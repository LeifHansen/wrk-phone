import { Router } from 'express';
import { db } from '../lib/db.js';

export const contactsRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';

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
