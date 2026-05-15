import { Router } from 'express';
import { db } from '../lib/db.js';

export const contactsRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';

// Normalize a raw device phone string to E.164 (US-biased, safe fallback).
function normalize(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, '');
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

// POST /api/contacts/sync  body: { contacts: [{ name, phone }] }
// Bulk upsert. Returns counts. Idempotent — safe to call repeatedly.
contactsRouter.post('/contacts/sync', (req, res) => {
  const incoming: { name?: string; phone?: string }[] = Array.isArray(req.body?.contacts)
    ? req.body.contacts
    : [];
  if (incoming.length === 0) return res.json({ synced: 0, skipped: 0, total: 0 });

  let synced = 0;
  let skipped = 0;
  const upsert = db.prepare(
    `INSERT INTO contacts (user_id, phone, name) VALUES (?, ?, ?)
     ON CONFLICT(user_id, phone) DO UPDATE SET name = COALESCE(NULLIF(excluded.name,''), contacts.name)`
  );
  const tx = db.transaction((rows: typeof incoming) => {
    for (const c of rows) {
      const phone = normalize(String(c.phone || ''));
      if (!phone) { skipped++; continue; }
      const name = String(c.name || '').trim().slice(0, 120);
      upsert.run(USER, phone, name);
      synced++;
    }
  });
  tx(incoming);

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?`).get(USER) as any).n;
  res.json({ synced, skipped, total });
});

// GET /api/contacts/meta — count + sample (for the Settings screen)
contactsRouter.get('/contacts/meta', (_req, res) => {
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?`).get(USER) as any).n;
  res.json({ total });
});

// GET /api/contacts?q= — search (used by compose / pickers later)
contactsRouter.get('/contacts', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(
        `SELECT phone, name FROM contacts WHERE user_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 50`
      ).all(USER, `%${q}%`, `%${q}%`)
    : db.prepare(`SELECT phone, name FROM contacts WHERE user_id = ? ORDER BY name LIMIT 50`).all(USER);
  res.json(rows);
});
