import { Router } from 'express';
import twilio from 'twilio';
import { db, getOrCreateConversation, getAgentForConversation, getCredits, spendCredits, addCredits, messageCost, MMS_MAX_CHARS, classifyCompliance, setOptOut, isOptedOut, getActiveNumber } from '../lib/db.js';
import { generateReply, SAFETY_REGEX } from '../lib/agent.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { routeInbound } from '../lib/routing.js';
import { getUserId } from '../lib/auth.js';

export const smsRouter = Router();
const MessagingResponse = twilio.twiml.MessagingResponse;
const USER = process.env.DEMO_USER_ID || 'demo';

// Inbound SMS webhook from Twilio
smsRouter.post('/sms/inbound', async (req, res) => {
  const from = String(req.body.From || '');
  const body = String(req.body.Body || '');
  const sid = String(req.body.MessageSid || '');
  const convId = getOrCreateConversation(USER, from);

  // Carrier-required opt-out handling. Always recorded, runs before the agent.
  const compliance = classifyCompliance(body);
  if (compliance) {
    db.prepare(
      `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at)
       VALUES (?, 'in', ?, ?, 'received', ?)`
    ).run(convId, body, sid, Date.now());
    db.prepare('UPDATE conversations SET last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?')
      .run(Date.now(), convId);
    const twiml = new MessagingResponse();
    if (compliance === 'stop') {
      setOptOut(USER, from, true);
      twiml.message('You are unsubscribed and will receive no more messages. Reply START to resubscribe.');
    } else if (compliance === 'start') {
      setOptOut(USER, from, false);
      twiml.message('You are resubscribed. Reply HELP for help, STOP to unsubscribe.');
    } else { // help
      twiml.message('Wrk Phone: reply STOP to unsubscribe. Msg & data rates may apply.');
    }
    return res.type('text/xml').send(twiml.toString());
  }

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
  // Per-thread autopilot overrides the agent's global mode → 'auto' for THIS
  // conversation, so a created agent works without changing it globally.
  const autopilot = !!(db.prepare(`SELECT autopilot FROM conversations WHERE id = ?`)
    .get(convId) as { autopilot: number } | undefined)?.autopilot;
  const effectiveMode = autopilot ? 'auto' : agent?.mode;
  const twiml = new MessagingResponse();

  if (agent && effectiveMode !== 'off') {
    try {
      const { reply, safeToAutoSend } = await generateReply(USER, convId, body);
      const safetyBlocked = SAFETY_REGEX.test(body) ? 1 : 0;
      if (effectiveMode === 'auto' && reply && safeToAutoSend && spendCredits(USER, messageCost(reply, false))) {
        const agentNum = (agent as any).send_number;
        if (agentNum) {
          // Reply FROM the agent's assigned number (out-of-band, not TwiML).
          try {
            const p: any = { to: from, body: reply, from: agentNum };
            await twilioClient.messages.create(p);
          } catch (e) { twiml.message(reply); /* fallback to reply on same number */ }
        } else {
          twiml.message(reply);
        }
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
  const mediaUrl = req.body.mediaUrl ? String(req.body.mediaUrl) : null;
  if (!to || (!body && !mediaUrl)) return res.status(400).json({ error: 'to and body (or mediaUrl) required' });
  if (mediaUrl && body.length > MMS_MAX_CHARS) {
    return res.status(400).json({ error: `MMS text is limited to ${MMS_MAX_CHARS} characters (got ${body.length}).` });
  }
  if (isOptedOut(USER, to)) {
    return res.status(409).json({ error: 'This contact has opted out (replied STOP). Messaging them is not allowed.' });
  }
  const cost = messageCost(body, !!mediaUrl);
  if (!spendCredits(USER, cost)) {
    return res.status(402).json({ error: `Not enough credits. This message costs ${cost} (balance ${getCredits(USER)}).`, cost });
  }
  const convId = getOrCreateConversation(USER, to);
  // Send FROM the sending user's selected shared-pool number (keeps their
  // chosen local area code). Explicit `from` so Twilio honors that number.
  const fromNum = getActiveNumber(getUserId(req)) || twilioConfig.defaultFrom;
  try {
    const params: any = { to, body, from: fromNum };
    if (mediaUrl) params.mediaUrl = [mediaUrl];        // MMS
    const msg = await twilioClient.messages.create(params);
    const result = db.prepare(
      `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at, media_url)
       VALUES (?, 'out', ?, ?, ?, ?, ?)`
    ).run(convId, body, msg.sid, msg.status, Date.now(), mediaUrl);
    db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(Date.now(), convId);
    res.json({ id: Number(result.lastInsertRowid), conversationId: convId, twilioSid: msg.sid, status: msg.status, creditsSpent: cost });
  } catch (err: any) {
    addCredits(USER, cost); // refund — the send failed
    const from = String(fromNum || '');
    const tollFree = /^\+1(800|833|844|855|866|877|888)\d{7}$/.test(from);
    const msg = tollFree
      ? `Couldn't send from ${from}. Toll-free numbers must complete Twilio Toll-Free Verification before they can text. Pick a local number from the pool (Numbers) and try again.`
      : err.message;
    res.status(500).json({ error: msg, code: err.code });
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
