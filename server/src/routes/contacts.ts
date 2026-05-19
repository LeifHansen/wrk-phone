import { Router } from 'express';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { db } from '../lib/db.js';

export const contactsRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';

// SSRF guard for user-supplied import URLs: https only, and the resolved IP
// must be publicly routable (blocks cloud metadata, localhost, LAN, etc.).
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
    const m = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

async function assertSafeFetchUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('invalid url'); }
  if (u.protocol !== 'https:') throw new Error('only https URLs are allowed');
  const host = u.hostname;
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addrs) {
    if (isPrivateIp(address)) throw new Error('url resolves to a non-public address');
  }
  return u;
}

// Fetch text while validating every hop against the SSRF guard. Manual
// redirect following so a public host can't 30x us into the internal network
// (Google Sheets export legitimately 307s to googleusercontent.com).
async function safeFetchText(start: string, maxHops = 5): Promise<Response> {
  let url = start;
  for (let i = 0; i <= maxHops; i++) {
    await assertSafeFetchUrl(url);
    const r = await fetch(url, { redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) return r;
      url = new URL(loc, url).toString();
      continue;
    }
    return r;
  }
  throw new Error('too many redirects');
}

export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

function withSegments(rows: any[]): any[] {
  const segByContact = new Map<number, { id: number; name: string }[]>();
  const links = db.prepare(
    `SELECT cs.contact_id, s.id, s.name FROM contact_segments cs JOIN segments s ON s.id = cs.segment_id WHERE s.user_id = ?`
  ).all(USER) as any[];
  for (const l of links) {
    if (!segByContact.has(l.contact_id)) segByContact.set(l.contact_id, []);
    segByContact.get(l.contact_id)!.push({ id: l.id, name: l.name });
  }
  return rows.map((r) => ({ ...r, segments: segByContact.get(r.id) || [] }));
}

// ---- list / search ----
contactsRouter.get('/contacts', (req, res) => {
  const q = String(req.query.q || '').trim();
  const segmentId = req.query.segmentId ? Number(req.query.segmentId) : null;
  let rows: any[];
  if (segmentId) {
    rows = db.prepare(
      `SELECT c.id, c.phone, c.name FROM contacts c
       JOIN contact_segments cs ON cs.contact_id = c.id
       WHERE c.user_id = ? AND cs.segment_id = ? ORDER BY c.name, c.phone`
    ).all(USER, segmentId) as any[];
  } else if (q) {
    rows = db.prepare(
      `SELECT id, phone, name FROM contacts WHERE user_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name, phone LIMIT 500`
    ).all(USER, `%${q}%`, `%${q}%`) as any[];
  } else {
    rows = db.prepare(
      `SELECT id, phone, name FROM contacts WHERE user_id = ? ORDER BY name, phone LIMIT 1000`
    ).all(USER) as any[];
  }
  res.json(withSegments(rows));
});

contactsRouter.get('/contacts/meta', (_req, res) => {
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?`).get(USER) as any).n;
  res.json({ total });
});

// ---- manual add: phone is the ONLY required field ----
contactsRouter.post('/contacts', (req, res) => {
  const phone = normalizePhone(String(req.body?.phone || ''));
  if (!phone) return res.status(400).json({ error: 'A valid phone number is required.' });
  const name = String(req.body?.name || '').trim().slice(0, 120);
  db.prepare(
    `INSERT INTO contacts (user_id, phone, name) VALUES (?, ?, ?)
     ON CONFLICT(user_id, phone) DO UPDATE SET name = COALESCE(NULLIF(excluded.name,''), contacts.name)`
  ).run(USER, phone, name);
  const row = db.prepare(`SELECT id, phone, name FROM contacts WHERE user_id = ? AND phone = ?`).get(USER, phone);
  res.json(row);
});

contactsRouter.delete('/contacts/:id', (req, res) => {
  db.prepare(`DELETE FROM contacts WHERE id = ? AND user_id = ?`).run(Number(req.params.id), USER);
  res.json({ ok: true });
});

// ---- bulk sync (device) ----
contactsRouter.post('/contacts/sync', (req, res) => {
  const incoming: { name?: string; phone?: string }[] = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  let synced = 0, skipped = 0;
  const upsert = db.prepare(
    `INSERT INTO contacts (user_id, phone, name) VALUES (?, ?, ?)
     ON CONFLICT(user_id, phone) DO UPDATE SET name = COALESCE(NULLIF(excluded.name,''), contacts.name)`
  );
  const tx = db.transaction((rows: typeof incoming) => {
    for (const c of rows) {
      const phone = normalizePhone(String(c.phone || ''));
      if (!phone) { skipped++; continue; }
      upsert.run(USER, phone, String(c.name || '').trim().slice(0, 120));
      synced++;
    }
  });
  tx(incoming);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?`).get(USER) as any).n;
  res.json({ synced, skipped, total });
});

// ---- segments ----
contactsRouter.get('/segments', (_req, res) => {
  const rows = db.prepare(
    `SELECT s.id, s.name,
       (SELECT COUNT(*) FROM contact_segments cs WHERE cs.segment_id = s.id) AS count
     FROM segments s WHERE s.user_id = ? ORDER BY s.name`
  ).all(USER);
  res.json(rows);
});

contactsRouter.post('/segments', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = db.prepare(`INSERT INTO segments (user_id, name, created_at) VALUES (?, ?, ?)`)
      .run(USER, name, Date.now());
    res.json({ id: Number(r.lastInsertRowid), name });
  } catch {
    res.status(409).json({ error: 'segment already exists' });
  }
});

contactsRouter.delete('/segments/:id', (req, res) => {
  db.prepare(`DELETE FROM segments WHERE id = ? AND user_id = ?`).run(Number(req.params.id), USER);
  res.json({ ok: true });
});

// add / remove a contact to/from a segment
contactsRouter.post('/segments/:id/members', (req, res) => {
  const segId = Number(req.params.id);
  const contactId = Number(req.body?.contactId);
  const seg = db.prepare(`SELECT id FROM segments WHERE id = ? AND user_id = ?`).get(segId, USER);
  if (!seg) return res.status(404).json({ error: 'segment not found' });
  db.prepare(`INSERT OR IGNORE INTO contact_segments (contact_id, segment_id) VALUES (?, ?)`)
    .run(contactId, segId);
  res.json({ ok: true });
});

contactsRouter.delete('/segments/:id/members/:contactId', (req, res) => {
  db.prepare(`DELETE FROM contact_segments WHERE segment_id = ? AND contact_id = ?`)
    .run(Number(req.params.id), Number(req.params.contactId));
  res.json({ ok: true });
});

// ───── Google Sheets / Excel sync (both export CSV) ─────

function parseCsv(text: string): { name: string; phone: string }[] {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rows.length === 0) return [];
  // Detect + skip a header row.
  const first = rows[0].toLowerCase();
  const hasHeader = /name|phone|number|mobile/.test(first);
  const out: { name: string; phone: string }[] = [];
  for (const line of rows.slice(hasHeader ? 1 : 0)) {
    const cells = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    // Heuristic: the cell that looks most like a phone is the phone.
    let phone = cells.find((c) => /[\d][\d\-\s().+]{6,}/.test(c)) || cells[cells.length - 1] || '';
    let name = cells.find((c) => c && c !== phone && !/^\+?[\d\-\s().]+$/.test(c)) || '';
    if (phone) out.push({ name, phone });
  }
  return out;
}

function bulkUpsert(rows: { name: string; phone: string }[], segmentId?: number | null) {
  let synced = 0, skipped = 0;
  const up = db.prepare(
    `INSERT INTO contacts (user_id, phone, name) VALUES (?, ?, ?)
     ON CONFLICT(user_id, phone) DO UPDATE SET name = COALESCE(NULLIF(excluded.name,''), contacts.name)`
  );
  const getId = db.prepare(`SELECT id FROM contacts WHERE user_id = ? AND phone = ?`);
  const link = db.prepare(`INSERT OR IGNORE INTO contact_segments (contact_id, segment_id) VALUES (?, ?)`);
  const validSeg = segmentId
    ? db.prepare(`SELECT id FROM segments WHERE id = ? AND user_id = ?`).get(segmentId, USER)
    : null;
  const tx = db.transaction((list: typeof rows) => {
    for (const r of list) {
      const phone = normalizePhone(r.phone);
      if (!phone) { skipped++; continue; }
      up.run(USER, phone, (r.name || '').slice(0, 120));
      synced++;
      if (validSeg) {
        const c = getId.get(USER, phone) as { id: number } | undefined;
        if (c) link.run(c.id, segmentId);
      }
    }
  });
  tx(rows);
  return { synced, skipped };
}

// Export every contact as CSV (opens in Excel / Google Sheets directly).
contactsRouter.get('/contacts/export.csv', (_req, res) => {
  const rows = db.prepare(`SELECT name, phone FROM contacts WHERE user_id = ? ORDER BY name`).all(USER) as any[];
  const csv = 'name,phone\n' + rows.map((r) => `"${(r.name || '').replace(/"/g, '""')}","${r.phone}"`).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="wrk-contacts.csv"');
  res.send(csv);
});

// Import from pasted CSV (Excel "Save as CSV").  body: { csv }
contactsRouter.post('/contacts/import-csv', (req, res) => {
  const rows = parseCsv(String(req.body?.csv || ''));
  if (rows.length === 0) return res.status(400).json({ error: 'no rows parsed' });
  const segmentId = req.body?.segmentId ? Number(req.body.segmentId) : null;
  const r = bulkUpsert(rows, segmentId);
  res.json({ ...r, total: (db.prepare(`SELECT COUNT(*) n FROM contacts WHERE user_id=?`).get(USER) as any).n });
});

// Import from a Google Sheets / Excel-Online URL.  body: { url }
// Accepts a normal Sheets link and rewrites it to the CSV export endpoint.
contactsRouter.post('/contacts/import-url', async (req, res) => {
  let url = String(req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: 'url required' });
  const gs = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (gs) {
    const gid = (url.match(/[#&]gid=(\d+)/) || [])[1] || '0';
    url = `https://docs.google.com/spreadsheets/d/${gs[1]}/export?format=csv&gid=${gid}`;
  }
  let r: Response;
  try {
    r = await safeFetchText(url);
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'url not allowed' });
  }
  try {
    if (!r.ok) return res.status(400).json({ error: `fetch failed (${r.status}). For Google Sheets: Share → Anyone with the link → Viewer.` });
    const rows = parseCsv(await r.text());
    if (rows.length === 0) return res.status(400).json({ error: 'no rows parsed — is the sheet shared publicly?' });
    const out = bulkUpsert(rows, req.body?.segmentId ? Number(req.body.segmentId) : null);
    res.json({ ...out, total: (db.prepare(`SELECT COUNT(*) n FROM contacts WHERE user_id=?`).get(USER) as any).n });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
