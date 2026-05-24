import { Router } from 'express';
import twilio from 'twilio';
import { db, getOrCreateConversation, getAgentForConversation, getCredits, spendCredits, addCredits, messageCost, MMS_MAX_CHARS, classifyCompliance, setOptOut, isOptedOut, getActiveNumber } from '../lib/db.js';
import { generateReply, SAFETY_REGEX } from '../lib/agent.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { routeInbound } from '../lib/routing.js';
import { log } from '../lib/log.js';
import { emit } from '../lib/events.js';
import { getUserId } from '../lib/auth.js';

export const smsRouter = Router();
const MessagingResponse = twilio.twiml.MessagingResponse;
import { OWNER_ID as USER } from '../lib/auth.js';
import { resolveInboundOwner } from '../lib/numbers-store.js';

// Twilio posts per-message delivery receipts (queued → sent → delivered, or
// → undelivered/failed) to this URL. WITHOUT it, an accepted-but-undeliverable
// message — e.g. an unverified toll-free sender whose traffic carriers drop —
// is stuck at 'queued' forever and the UI cannot tell success from failure.
function smsStatusCallback(): string | undefined {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  return base ? `${base}/api/sms/status` : undefined;
}

// Inbound SMS webhook from Twilio
smsRouter.post('/sms/inbound', async (req, res) => {
  const from = String(req.body.From || '');
  const body = String(req.body.Body || '');
  const sid = String(req.body.MessageSid || '');
  const toNumber = String(req.body.To || '');
  // The account that owns the texted number. For a shared toll-free this is
  // disambiguated by the contact (a reply to an existing thread). Cold or
  // ambiguous inbound is unattributable → null → drop it (empty 200 so Twilio
  // doesn't retry).
  const owner = resolveInboundOwner(toNumber, from);
  if (!owner) {
    log.info('sms.inbound', 'ignored unattributable inbound', { to: toNumber, from });
    return res.type('text/xml').send(new MessagingResponse().toString());
  }

  // Idempotency: Twilio retries the webhook (up to ~15s, then again) when a
  // response is slow. Two OpenAI round-trips below routinely exceed that, so
  // without this guard a retry re-inserts the inbound and re-bills a second
  // AI reply. First write wins; retries get an empty 200.
  if (sid) {
    const dup = db.prepare(`SELECT 1 FROM messages WHERE twilio_sid = ? LIMIT 1`).get(sid);
    if (dup) return res.type('text/xml').send(new MessagingResponse().toString());
  }

  const convId = getOrCreateConversation(owner, from, toNumber || null);

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
      setOptOut(owner, from, true);
      twiml.message('You are unsubscribed and will receive no more messages. Reply START to resubscribe.');
    } else if (compliance === 'start') {
      setOptOut(owner, from, false);
      twiml.message('You are resubscribed. Reply HELP for help, STOP to unsubscribe.');
    } else { // help
      twiml.message('WrkPhn: reply STOP to unsubscribe. Msg & data rates may apply.');
    }
    return res.type('text/xml').send(twiml.toString());
  }

  // If the conversation has no agent assigned yet, run auto-routing rules.
  // Once an agent is assigned, the conversation sticks with it (manual switch
  // still wins). This keeps mid-thread re-routing from feeling chaotic.
  const conv = db.prepare(`SELECT agent_id FROM conversations WHERE id = ?`).get(convId) as { agent_id: number | null };
  if (!conv?.agent_id) {
    try {
      const matchedRule = await routeInbound({ userId: owner, fromPhone: from, body });
      if (matchedRule) {
        db.prepare(`UPDATE conversations SET agent_id = ? WHERE id = ?`).run(matchedRule.agent_id, convId);
      }
    } catch (e) { log.warn('sms.inbound', 'auto-routing failed', e); }
  }

  db.prepare(
    `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at)
     VALUES (?, 'in', ?, ?, 'received', ?)`
  ).run(convId, body, sid, Date.now());
  db.prepare('UPDATE conversations SET last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?')
    .run(Date.now(), convId);
  // Push the new inbound to any connected clients so the inbox lights up
  // without waiting for the next 30s poll tick.
  emit({ kind: 'message:new', conversationId: convId, direction: 'in' });

  const agent = getAgentForConversation(owner, convId);
  // Per-thread autopilot overrides the agent's global mode → 'auto' for THIS
  // conversation, so a created agent works without changing it globally.
  const autopilot = !!(db.prepare(`SELECT autopilot FROM conversations WHERE id = ?`)
    .get(convId) as { autopilot: number } | undefined)?.autopilot;
  const effectiveMode = autopilot ? 'auto' : agent?.mode;
  const twiml = new MessagingResponse();

  if (agent && effectiveMode !== 'off') {
    try {
      const { reply, safeToAutoSend } = await generateReply(owner, convId, body);
      const safetyBlocked = SAFETY_REGEX.test(body) ? 1 : 0;
      const cost = messageCost(reply, false);
      if (effectiveMode === 'auto' && reply && safeToAutoSend && spendCredits(owner, cost)) {
        const agentNum = (agent as any).send_number;
        // Track what was actually delivered so we (a) don't queue a row that
        // wasn't sent, (b) don't double-send (out-of-band + TwiML), and
        // (c) refund credits if every send path failed.
        let actuallySent: { sid: string | null; status: string } | null = null;
        if (agentNum) {
          try {
            const p: any = { to: from, body: reply, from: agentNum };
            const cb = smsStatusCallback();
            if (cb) p.statusCallback = cb;
            const m = await twilioClient.messages.create(p);
            actuallySent = { sid: m.sid, status: m.status };
          } catch (e) {
            // Out-of-band send failed → fall back to the inbound's same-line
            // TwiML reply instead (one path or the other, never both).
            log.warn('sms.inbound', `agent send_number ${agentNum} failed; falling back to same-line TwiML reply`, e);
            twiml.message(reply);
            actuallySent = { sid: null, status: 'queued' };
          }
        } else {
          twiml.message(reply);
          actuallySent = { sid: null, status: 'queued' };
        }
        if (actuallySent) {
          db.prepare(
            `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at, is_ai, agent_id)
             VALUES (?, 'out', ?, ?, ?, ?, 1, ?)`
          ).run(convId, reply, actuallySent.sid, actuallySent.status, Date.now(), agent.id);
          emit({ kind: 'message:new', conversationId: convId, direction: 'out' });
        } else {
          // Truly nothing went out — refund the credit we just spent.
          addCredits(owner, cost);
        }
      } else if (reply) {
        // Suggestion (either suggest mode, or auto + sensitive)
        db.prepare(
          `INSERT INTO messages (conversation_id, direction, body, status, created_at, is_ai, is_suggestion, agent_id, safety_blocked)
           VALUES (?, 'out', ?, 'suggestion', ?, 1, 1, ?, ?)`
        ).run(convId, reply, Date.now(), agent.id, safetyBlocked);
        emit({ kind: 'message:new', conversationId: convId, direction: 'out', isSuggestion: true });
      }
    } catch (err: any) {
      log.error('sms.inbound', 'agent reply generation failed', err);
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
  // Send FROM the sending user's selected shared-pool number (keeps their
  // chosen local area code). Explicit `from` so Twilio honors that number.
  const fromNum = getActiveNumber(getUserId(req)) || twilioConfig.defaultFrom;
  // Stamp the thread with WHICH number it's on, so when the contact replies
  // resolveInboundOwner() can route the (our_number, peer) pair back here.
  const convId = getOrCreateConversation(USER, to, fromNum || null);
  let msg: any;
  try {
    const params: any = { to, body, from: fromNum };
    if (mediaUrl) params.mediaUrl = [mediaUrl];        // MMS
    const cb = smsStatusCallback();
    if (cb) params.statusCallback = cb;
    msg = await twilioClient.messages.create(params);
  } catch (err: any) {
    addCredits(USER, cost); // refund — the send itself failed, nothing went out
    const from = String(fromNum || '');
    log.error('sms.send', `outbound send failed from ${from} to ${to}`, { code: err.code, message: err.message, moreInfo: err.moreInfo });
    const isTollFree = /^\+1(800|833|844|855|866|877|888)\d{7}$/.test(from);
    // Only blame Toll-Free Verification when Twilio actually says so
    // (30032 = TF number not verified). A verified toll-free that fails
    // for another reason must surface its REAL error, not a misleading
    // "go verify your number" message.
    const tfUnverified = err.code === 30032 ||
      /toll[- ]?free.*(verif|not been verified)/i.test(String(err.message || ''));
    const errMsg = (isTollFree && tfUnverified)
      ? `Couldn't send from ${from}: this toll-free number hasn't completed Twilio Toll-Free Verification yet. Use a different number or finish verification, then try again.`
      : `Couldn't send from ${from}: ${err.message}${err.code ? ` (Twilio ${err.code})` : ''}`;
    return res.status(500).json({ error: errMsg, code: err.code });
  }

  // The SMS is already sent. A failure persisting it must NOT refund — the
  // credit was correctly consumed; just log and still report success.
  try {
    const result = db.prepare(
      `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at, media_url)
       VALUES (?, 'out', ?, ?, ?, ?, ?)`
    ).run(convId, body, msg.sid, msg.status, Date.now(), mediaUrl);
    db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(Date.now(), convId);
    emit({ kind: 'message:new', conversationId: convId, direction: 'out' });
    res.json({ id: Number(result.lastInsertRowid), conversationId: convId, twilioSid: msg.sid, status: msg.status, creditsSpent: cost });
  } catch (dbErr: any) {
    log.error('sms.send', `sent (sid ${msg?.sid}) but failed to persist message`, dbErr);
    res.json({ conversationId: convId, twilioSid: msg.sid, status: msg.status, creditsSpent: cost, warning: 'message sent but not recorded' });
  }
});

smsRouter.post('/sms/status', (req, res) => {
  const sid = String(req.body.MessageSid || '');
  const status = String(req.body.MessageStatus || '');
  if (sid) {
    const r = db.prepare('UPDATE messages SET status = ? WHERE twilio_sid = ?').run(status, sid);
    if (r.changes) {
      // Include conversationId so clients viewing other threads can ignore
      // this event — without it every open thread re-fetches on every Twilio
      // delivery callback.
      const conv = db.prepare(
        'SELECT conversation_id FROM messages WHERE twilio_sid = ? LIMIT 1'
      ).get(sid) as { conversation_id: number } | undefined;
      emit({ kind: 'message:status', sid, status, conversationId: conv?.conversation_id });
    }
  }
  res.sendStatus(204);
});

smsRouter.post('/sms/suggestion/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(
    `SELECT m.*, c.peer_phone, c.our_number FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?`
  ).get(id) as any;
  if (!row || !row.is_suggestion) return res.status(404).json({ error: 'not found' });
  try {
    const params: any = { to: row.peer_phone, body: row.body };
    // Stay on the SAME line the thread is on. Falling back to a Messaging
    // Service or the global defaultFrom would silently send the approved
    // reply from a different number, breaking the contact's threading and
    // making it look like a new sender.
    if (row.our_number) params.from = row.our_number;
    else if (twilioConfig.messagingServiceSid) params.messagingServiceSid = twilioConfig.messagingServiceSid;
    else params.from = twilioConfig.defaultFrom;
    const cb = smsStatusCallback();
    if (cb) params.statusCallback = cb;
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
