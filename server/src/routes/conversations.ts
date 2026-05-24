import { Router } from 'express';
import { db, getAgentForConversation, hydrateAgent } from '../lib/db.js';
import { normalizePhone } from '../lib/phone.js';
import { OWNER_ID } from '../lib/auth.js';
// Shared-line model: the inbox/conversations belong to the shared account
// (OWNER), not the logged-in user. Per-user telephony is a future build.

export const conversationsRouter = Router();

// GET /api/conversations  -> inbox list (with assigned agent meta)
//
// Hot path: polled every 30s and refetched on every SSE event. The previous
// version issued THREE correlated subqueries PER conversation row (last body,
// last direction, contact name) — N+3 queries on a growing inbox. This now
// uses two preaggregated joins (latest message + contact name), one pass each.
conversationsRouter.get('/conversations', (req, res) => {
  const USER = OWNER_ID;
  const rows = db.prepare(`
    SELECT c.id, c.peer_phone, c.last_message_at, c.unread_count, c.agent_id,
           lm.body AS last_body, lm.direction AS last_direction,
           ct.name AS name,
           a.name AS agent_name, a.emoji AS agent_emoji, a.color AS agent_color, a.mode AS agent_mode, a.avatar_url AS agent_avatar
    FROM conversations c
    LEFT JOIN (
      SELECT m.conversation_id, m.body, m.direction
      FROM messages m
      JOIN (
        SELECT conversation_id, MAX(created_at) AS max_at
        FROM messages GROUP BY conversation_id
      ) lx ON lx.conversation_id = m.conversation_id AND lx.max_at = m.created_at
    ) lm ON lm.conversation_id = c.id
    LEFT JOIN contacts ct ON ct.user_id = c.user_id AND ct.phone = c.peer_phone
    LEFT JOIN agents a ON a.id = COALESCE(c.agent_id,
                                          (SELECT id FROM agents WHERE user_id = c.user_id AND is_default = 1 LIMIT 1))
    WHERE c.user_id = ?
    ORDER BY c.last_message_at DESC
  `).all(USER);
  res.json(rows);
});

// GET /api/conversations/:id/messages  (and currently-assigned agent)
conversationsRouter.get('/conversations/:id/messages', (req, res) => {
  const USER = OWNER_ID;
  const id = Number(req.params.id);
  const messages = db.prepare(
    `SELECT id, direction, body, status, created_at, is_ai, is_suggestion, agent_id
     FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
  ).all(id);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  const agent = getAgentForConversation(USER, id);
  res.json({ conversation: conv, messages, agent: agent ? hydrateAgent(agent) : null });
});

conversationsRouter.post('/conversations/:id/read', (req, res) => {
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Toggle per-thread agent autopilot. body: { on, agentId? }
// on=true forces the (assigned/default) agent to auto-reply on THIS thread,
// regardless of the agent's global mode. Optionally (re)assign the agent.
conversationsRouter.patch('/conversations/:id/autopilot', (req, res) => {
  const id = Number(req.params.id);
  const on = req.body?.on ? 1 : 0;
  const agentId = req.body?.agentId != null ? Number(req.body.agentId) : null;
  if (agentId != null) {
    const a = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, OWNER_ID);
    if (!a) return res.status(404).json({ error: 'agent not found' });
    db.prepare('UPDATE conversations SET agent_id = ? WHERE id = ?').run(agentId, id);
  }
  db.prepare('UPDATE conversations SET autopilot = ? WHERE id = ? AND user_id = ?').run(on, id, OWNER_ID);
  res.json({ ok: true, autopilot: !!on });
});

// Delete a whole conversation + its messages.
// Order matters: scope the messages delete THROUGH the conversation row's
// ownership. The previous version blindly deleted by conversation_id with no
// user scoping, so without the FK cascade in place (or with mis-scoped auth)
// you could wipe any conversation's messages by guessing its id.
conversationsRouter.delete('/conversations/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare(
    `DELETE FROM messages
       WHERE conversation_id IN (SELECT id FROM conversations WHERE id = ? AND user_id = ?)`
  ).run(id, OWNER_ID);
  const r = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, OWNER_ID);
  res.json({ ok: true, deleted: r.changes });
});

conversationsRouter.post('/conversations', (req, res) => {
  const USER = OWNER_ID;
  // ALWAYS normalize peer phone before lookup/insert — otherwise we end up
  // with separate threads for "2068173472" and "+12068173472" even though
  // they're the same person. See dedupePhoneRows() in lib/db.ts for the
  // one-time cleanup of pre-fix duplicates.
  const peer = normalizePhone(String(req.body.peer_phone || ''));
  const name = req.body.name ? String(req.body.name) : null;
  if (!peer) return res.status(400).json({ error: 'valid peer_phone required' });
  let convId: number;
  const existing = db.prepare(
    'SELECT id FROM conversations WHERE user_id = ? AND peer_phone = ?'
  ).get(USER, peer) as { id: number } | undefined;
  if (existing) {
    convId = existing.id;
  } else {
    const r = db.prepare(
      'INSERT INTO conversations (user_id, peer_phone, last_message_at) VALUES (?, ?, ?)'
    ).run(USER, peer, Date.now());
    convId = Number(r.lastInsertRowid);
  }
  if (name) {
    db.prepare(
      `INSERT INTO contacts (user_id, phone, name) VALUES (?, ?, ?)
       ON CONFLICT(user_id, phone) DO UPDATE SET name = excluded.name`
    ).run(USER, peer, name);
  }
  res.json({ id: convId });
});

// ---------- drafts ----------
// A draft = a row in `messages` with status='draft', direction='out',
// living on a conversation (the conversation row is created on first save
// so the recipient context survives). The drafts subtab queries this set.
conversationsRouter.get('/drafts', (req, res) => {
  const USER = OWNER_ID;
  const rows = db.prepare(`
    SELECT m.id AS draft_id, m.body AS draft_body, m.created_at AS draft_at,
           c.id AS conversation_id, c.peer_phone, c.our_number,
           (SELECT name FROM contacts WHERE user_id = c.user_id AND phone = c.peer_phone LIMIT 1) AS name
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_id = ? AND m.status = 'draft'
     ORDER BY m.created_at DESC
  `).all(USER);
  res.json(rows);
});

// POST /api/drafts  body: { peer_phone, body, media_url? }
// Save (or upsert the latest open draft to) a draft message bound to a
// conversation. Returns the conversation id + draft id so the UI can either
// stay on the draft form or navigate into the thread.
conversationsRouter.post('/drafts', (req, res) => {
  const USER = OWNER_ID;
  const peer = normalizePhone(String(req.body.peer_phone || ''));
  const body = String(req.body.body || '');
  const media_url = req.body.media_url ? String(req.body.media_url) : null;
  if (!peer) return res.status(400).json({ error: 'valid peer_phone required' });
  if (!body && !media_url) return res.status(400).json({ error: 'body or media_url required' });
  // Get-or-create the conversation so it shows up in the inbox too.
  const existing = db.prepare(
    'SELECT id FROM conversations WHERE user_id = ? AND peer_phone = ?'
  ).get(USER, peer) as { id: number } | undefined;
  const convId = existing?.id || Number(
    db.prepare('INSERT INTO conversations (user_id, peer_phone, last_message_at) VALUES (?, ?, ?)')
      .run(USER, peer, Date.now()).lastInsertRowid
  );
  const draftId = Number(
    db.prepare(
      `INSERT INTO messages (conversation_id, direction, body, status, created_at, media_url)
       VALUES (?, 'out', ?, 'draft', ?, ?)`
    ).run(convId, body, Date.now(), media_url).lastInsertRowid
  );
  res.json({ id: draftId, conversation_id: convId });
});

// DELETE /api/drafts/:id — discard a draft
conversationsRouter.delete('/drafts/:id', (req, res) => {
  const USER = OWNER_ID;
  // Scope through the conversation so a forged id can't wipe someone else's row.
  db.prepare(
    `DELETE FROM messages WHERE id = ? AND status = 'draft'
       AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)`
  ).run(Number(req.params.id), USER);
  res.json({ ok: true });
});

conversationsRouter.get('/calls', (req, res) => {
  const USER = OWNER_ID;
  const rows = db.prepare(
    `SELECT c.*, ct.name FROM calls c
     LEFT JOIN contacts ct ON ct.user_id = c.user_id AND ct.phone = c.peer_phone
     WHERE c.user_id = ? ORDER BY c.started_at DESC LIMIT 200`
  ).all(USER);
  res.json(rows);
});
