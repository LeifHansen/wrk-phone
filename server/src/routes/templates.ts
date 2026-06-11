import { Router } from 'express';
import { db } from '../lib/db.js';
import { firstNameFrom } from '../lib/phone.js';

export const templatesRouter = Router();
import { getUserId } from '../lib/auth.js';

// ---------- list ----------
templatesRouter.get('/templates', (req, res) => {
  const USER = getUserId(req);
  const rows = db.prepare(
    `SELECT id, name, body, media_url, created_at, updated_at
       FROM templates WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(USER);
  res.json(rows);
});

// ---------- get one ----------
templatesRouter.get('/templates/:id', (req, res) => {
  const USER = getUserId(req);
  const row = db.prepare(
    `SELECT id, name, body, media_url, created_at, updated_at
       FROM templates WHERE id = ? AND user_id = ?`
  ).get(Number(req.params.id), USER);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// ---------- create ----------
templatesRouter.post('/templates', (req, res) => {
  const USER = getUserId(req);
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const body = String(req.body?.body || '');
  const media_url = req.body?.media_url ? String(req.body.media_url) : null;
  if (!name || (!body && !media_url)) {
    return res.status(400).json({ error: 'name and body (or media) required' });
  }
  const now = Date.now();
  const r = db.prepare(
    `INSERT INTO templates (user_id, name, body, media_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(USER, name, body, media_url, now, now);
  res.json({ id: Number(r.lastInsertRowid), name, body, media_url, created_at: now, updated_at: now });
});

// ---------- update ----------
templatesRouter.patch('/templates/:id', (req, res) => {
  const USER = getUserId(req);
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT * FROM templates WHERE id = ? AND user_id = ?`).get(id, USER) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : row.name;
  const body = req.body?.body !== undefined ? String(req.body.body) : row.body;
  const media_url = req.body?.media_url !== undefined
    ? (req.body.media_url ? String(req.body.media_url) : null)
    : row.media_url;
  db.prepare(
    `UPDATE templates SET name = ?, body = ?, media_url = ?, updated_at = ? WHERE id = ?`
  ).run(name, body, media_url, Date.now(), id);
  res.json({ id, name, body, media_url });
});

// ---------- delete ----------
templatesRouter.delete('/templates/:id', (req, res) => {
  const USER = getUserId(req);
  db.prepare(`DELETE FROM templates WHERE id = ? AND user_id = ?`).run(Number(req.params.id), USER);
  res.json({ ok: true });
});

// ---------- render (substitute {{tokens}} for a specific recipient) ----------
// Used by the conversation composer and (eventually) the campaigns send loop
// when a template is selected. Currently supports {{first_name}}; future
// tokens slot in via the TOKENS map without changing call sites.
const TOKENS: Record<string, (ctx: { firstName: string; phone: string; name: string }) => string> = {
  first_name: (c) => c.firstName,
  name:       (c) => c.name,
  phone:      (c) => c.phone,
};

/** Pure helper — exported so campaigns / conversation composer can also call. */
export function renderTemplate(body: string, ctx: { firstName: string; phone: string; name: string }): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, raw) => {
    const fn = TOKENS[String(raw).toLowerCase()];
    return fn ? fn(ctx) : m;
  });
}

// POST /api/templates/:id/render  body: { phone? | contactId? }
// Returns the rendered body for the given recipient. The composer uses this
// to show a preview before sending.
templatesRouter.post('/templates/:id/render', (req, res) => {
  const USER = getUserId(req);
  const id = Number(req.params.id);
  const t = db.prepare(`SELECT * FROM templates WHERE id = ? AND user_id = ?`).get(id, USER) as any;
  if (!t) return res.status(404).json({ error: 'not found' });

  let contact: { name: string | null; phone: string } | null = null;
  if (req.body?.contactId) {
    contact = db.prepare(`SELECT name, phone FROM contacts WHERE id = ? AND user_id = ?`)
      .get(Number(req.body.contactId), USER) as any;
  } else if (req.body?.phone) {
    contact = db.prepare(`SELECT name, phone FROM contacts WHERE phone = ? AND user_id = ?`)
      .get(String(req.body.phone), USER) as any;
    if (!contact) contact = { name: null, phone: String(req.body.phone) };
  }
  const name = contact?.name || '';
  const phone = contact?.phone || '';
  const body = renderTemplate(t.body, {
    firstName: firstNameFrom(name) || 'there',
    name: name || phone,
    phone,
  });
  res.json({ body, media_url: t.media_url });
});
