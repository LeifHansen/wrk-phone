import { Router } from 'express';
import { db, getAgentForConversation, hydrateAgent } from '../lib/db.js';
import { getUserId } from '../lib/auth.js';

export const conversationsRouter = Router();

// GET /api/conversations  -> inbox list (with assigned agent meta)
conversationsRouter.get('/conversations', (req, res) => {
  const USER = getUserId(req);
  const rows = db.prepare(`
    SELECT c.id, c.peer_phone, c.last_message_at, c.unread_count, c.agent_id,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
           (SELECT direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_direction,
           (SELECT name FROM contacts WHERE user_id = c.user_id AND phone = c.peer_phone LIMIT 1) AS name,
           a.name AS agent_name, a.emoji AS agent_emoji, a.color AS agent_color, a.mode AS agent_mode
    FROM conversations c
    LEFT JOIN agents a ON a.id = COALESCE(c.agent_id,
                                          (SELECT id FROM agents WHERE user_id = c.user_id AND is_default = 1 LIMIT 1))
    WHERE c.user_id = ?
    ORDER BY c.last_message_at DESC
  `).all(USER);
  res.json(rows);
});

// GET /api/conversations/:id/messages  (and currently-assigned agent)
conversationsRouter.get('/conversations/:id/messages', (req, res) => {
  const USER = getUserId(req);
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

conversationsRouter.post('/conversations', (req, res) => {
  const USER = getUserId(req);
  const peer = String(req.body.peer_phone || '').trim();
  const name = req.body.name ? String(req.body.name) : null;
  if (!peer) return res.status(400).json({ error: 'peer_phone required' });
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

conversationsRouter.get('/calls', (req, res) => {
  const USER = getUserId(req);
  const rows = db.prepare(
    `SELECT c.*, ct.name FROM calls c
     LEFT JOIN contacts ct ON ct.user_id = c.user_id AND ct.phone = c.peer_phone
     WHERE c.user_id = ? ORDER BY c.started_at DESC LIMIT 200`
  ).all(USER);
  res.json(rows);
});
