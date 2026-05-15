import { Router } from 'express';
import twilio from 'twilio';
import { db, getOrCreateConversation, getAgentForConversation } from '../lib/db.js';
import { generateReply, SAFETY_REGEX } from '../lib/agent.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { routeInbound } from '../lib/routing.js';

export const smsRouter = Router();
const MessagingResponse = twilio.twiml.MessagingResponse;
const USER = process.env.DEMO_USER_ID || 'demo';

// Inbound SMS webhook from Twilio
smsRouter.post('/sms/inbound', async (req, res) => {
  const from = String(req.body.From || '');
  const body = String(req.body.Body || '');
  const sid = String(req.body.MessageSid || '');
  const convId = getOrCreateConversation(USER, from);

  // If the conversation has no agent assigned yet, run auto-routing rules.
  // Once an agent is assigned, the conversation sticks with it (manual switch
  // still wins). This keeps mid-thread re-routing from feeling chaotic.
  const conv = db.prepare(`SELECT agent_id FROM conversations WHERE id = ?`).get(convId) as { agent_id: number | null };
  if (!conv?.agent_id) {
    try {
      const matchedRule = await routeInbound({ userId: USER, fromPhone: from, body });
      if (matchedRule) {
        db.prepare(`UPDATE conversations SET agent_id = ? WHERE id = ?`).run(matchedRule.agent_id, convId);
      }
    } catch (e) { console.warn('routing failed', e); }
  }

  db.prepare(
    `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at)
     VALUES (?, 'in', ?, ?, 'received', ?)`
  ).run(convId, body, sid, Date.now());
  db.prepare('UPDATE conversations SET last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?')
    .run(Date.now(), convId);

  const agent = getAgentForConversation(USER, convId);
  const twiml = new MessagingResponse();

  if (agent && agent.mode !== 'off') {
    try {
      const { reply, safeToAutoSend } = await generateReply(USER, convId, body);
      const safetyBlocked = SAFETY_REGEX.test(body) ? 1 : 0;
      if (agent.mode === 'auto' && reply && safeToAutoSend) {
        twiml.message(reply);
        db.prepare(
          `INSERT INTO messages (conversation_id, direction, body, status, created_at, is_ai, agent_id)
           VALUES (?, 'out', ?, 'queued', ?, 1, ?)`
        ).run(convId, reply, Date.now(), agent.id);
      } else if (reply) {
        // Suggestion (either suggest mode, or auto + sensitive)
        db.prepare(
          `INSERT INTO messages (conversation_id, direction, body, status, created_at, is_ai, is_suggestion, agent_id, safety_blocked)
           VALUES (?, 'out', ?, 'suggestion', ?, 1, 1, ?, ?)`
        ).run(convId, reply, Date.now(), agent.id, safetyBlocked);
      }
    } catch (err: any) {
      console.error('agent error', err);
    }
  }

  res.type('text/xml').send(twiml.toString());
});

// Outbound: client posts a message to send
// POST /api/sms/send  body: { to, body, conversationId? }
smsRouter.post('/sms/send', async (req, res) => {
  const to = String(req.body.to || '').trim();
  const body = String(req.body.body || '').trim();
  if (!to || !body) return res.status(400).json({ error: 'to and body required' });
  const convId = getOrCreateConversation(USER, to);
  try {
    const params: any = { to, body };
    if (twilioConfig.messagingServiceSid) params.messagingServiceSid = twilioConfig.messagingServiceSid;
    else params.from = twilioConfig.defaultFrom;
    const msg = await twilioClient.messages.create(params);
    const result = db.prepare(
      `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at)
       VALUES (?, 'out', ?, ?, ?, ?)`
    ).run(convId, body, msg.sid, msg.status, Date.now());
    db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(Date.now(), convId);
    res.json({ id: Number(result.lastInsertRowid), conversationId: convId, twilioSid: msg.sid, status: msg.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

smsRouter.post('/sms/status', (req, res) => {
  const sid = String(req.body.MessageSid || '');
  const status = String(req.body.MessageStatus || '');
  if (sid) db.prepare('UPDATE messages SET status = ? WHERE twilio_sid = ?').run(status, sid);
  res.sendStatus(204);
});

smsRouter.post('/sms/suggestion/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(
    `SELECT m.*, c.peer_phone FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?`
  ).get(id) as any;
  if (!row || !row.is_suggestion) return res.status(404).json({ error: 'not found' });
  try {
    const params: any = { to: row.peer_phone, body: row.body };
    if (twilioConfig.messagingServiceSid) params.messagingServiceSid = twilioConfig.messagingServiceSid;
    else params.from = twilioConfig.defaultFrom;
    const msg = await twilioClient.messages.create(params);
    db.prepare('UPDATE messages SET is_suggestion = 0, twilio_sid = ?, status = ? WHERE id = ?')
      .run(msg.sid, msg.status, id);
    db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(Date.now(), row.conversation_id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

smsRouter.post('/sms/suggestion/:id/dismiss', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM messages WHERE id = ? AND is_suggestion = 1').run(id);
  res.json({ ok: true });
});
