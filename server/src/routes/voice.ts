import { Router } from 'express';
import twilio from 'twilio';
import { db, getDefaultAgent, getOrCreateConversation, getAgentForConversation, getActiveNumber, setVoiceOptOut } from '../lib/db.js';
import { generateVoiceGreeting } from '../lib/agent.js';
import { twilioConfig } from '../lib/twilio.js';
import { log } from '../lib/log.js';
import { emit } from '../lib/events.js';

export const voiceRouter = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;
import { OWNER_ID as USER } from '../lib/auth.js';
import { resolveInboundOwner } from '../lib/numbers-store.js';

// Outbound (from softphone): TwiML App webhook
// The mobile/web SDK passes the dialed number as `To` parameter.
voiceRouter.post('/voice/outbound', (req, res) => {
  const to = String(req.body.To || '').trim();
  // The web/mobile SDK passes the caller's selected shared-pool number as
  // `From`. Honor it (it's on the account); else fall back to the shared
  // default. Loose E.164 check — Twilio rejects anything not on the account.
  const picked = String(req.body.From || '').trim();
  const callerId = /^\+\d{8,15}$/.test(picked)
    ? picked
    : (getActiveNumber(USER) || twilioConfig.defaultFrom);
  log.info('voice/outbound', `dial request`, { to, callerId, callSid: req.body.CallSid, from: req.body.From });
  const twiml = new VoiceResponse();
  try {
    if (!to) {
      log.warn('voice/outbound', 'no destination — call will end');
      twiml.say('No destination number provided.');
    } else if (!callerId || /x{4,}/i.test(callerId)) {
      log.error('voice/outbound', 'no valid caller ID (number not provisioned?) — call will fail', { callerId });
      twiml.say('This line has no caller ID configured.');
    } else {
      const dial = twiml.dial({ callerId, answerOnBridge: true });
      if (/^\+?\d+$/.test(to)) dial.number(to);
      else dial.client(to);
    }
    // Don't log the full TwiML on every connect — the dialed E.164 lands in
    // the call-request line above; this just adds noise + PII to every outbound.
    res.type('text/xml').send(twiml.toString());
  } catch (e: any) {
    log.error('voice/outbound', 'handler threw', e);
    res.type('text/xml').send(new VoiceResponse().toString());
  }
});


// Inbound: Twilio number's Voice webhook -> ring the softphone client
voiceRouter.post('/voice/inbound', (req, res) => {
  const fromNumber = String(req.body.From || '');
  // The account that owns the dialed number rings. For a shared toll-free,
  // disambiguated by the caller's prior thread. A cold call to a shared number
  // is unattributable → reject it.
  const owner = resolveInboundOwner(String(req.body.To || ''), fromNumber);
  const twiml = new VoiceResponse();
  if (!owner) {
    twiml.reject();
    return res.type('text/xml').send(twiml.toString());
  }
  const dial = twiml.dial({ timeout: 25, answerOnBridge: true, callerId: fromNumber });
  dial.client(owner);
  // If client doesn't answer, fall through to voicemail
  twiml.redirect({ method: 'POST' }, '/api/voice/voicemail-greeting');
  res.type('text/xml').send(twiml.toString());
});

voiceRouter.post('/voice/voicemail-greeting', async (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const fromNumber = String(req.body.From || '');
    const owner = resolveInboundOwner(String(req.body.To || ''), fromNumber);
    let agent = null as any;
    if (owner && fromNumber) {
      const conv = db.prepare(
        'SELECT id FROM conversations WHERE user_id = ? AND peer_phone = ?'
      ).get(owner, fromNumber) as { id: number } | undefined;
      if (conv) agent = getAgentForConversation(owner, conv.id);
    }
    if (!agent && owner) agent = getDefaultAgent(owner);
    const greeting = agent ? await generateVoiceGreeting(agent) : "Please leave a message after the tone.";
    const voice = (agent && (agent as any).tts_voice) || 'Polly.Joanna-Neural';
    twiml.say({ voice }, greeting);
  } catch {
    twiml.say("Please leave a message after the tone.");
  }
  twiml.record({
    maxLength: 120,
    playBeep: true,
    transcribe: true,
    transcribeCallback: '/api/voice/voicemail-transcription',
    action: '/api/voice/voicemail-done',
  });
  res.type('text/xml').send(twiml.toString());
});

voiceRouter.post('/voice/voicemail-done', (_req, res) => {
  const twiml = new VoiceResponse();
  twiml.say('Thanks. Goodbye.');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

voiceRouter.post('/voice/voicemail-transcription', (req, res) => {
  // Persist as inbound message-style record
  const from = String(req.body.From || 'unknown');
  const text = String(req.body.TranscriptionText || '');
  const sid = String(req.body.RecordingSid || '');
  const toNumber = String(req.body.To || '');
  const owner = resolveInboundOwner(toNumber, from);
  if (!owner) {
    // Voicemail on a shared number we can't attribute — drop it.
    return res.sendStatus(204);
  }
  // Use the shared helper so the conversation row is stamped with our_number
  // — a raw INSERT here would leave it NULL and the next inbound from this
  // peer would fail resolveInboundOwner (no thread on this line yet) and drop.
  const convId = getOrCreateConversation(owner, from, toNumber || null);
  db.prepare(
    `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at)
     VALUES (?, 'in', ?, ?, 'voicemail', ?)`
  ).run(convId, `[Voicemail] ${text}`, sid, Date.now());
  db.prepare('UPDATE conversations SET last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?')
    .run(Date.now(), convId);
  emit({ kind: 'voicemail:new', conversationId: convId });
  res.sendStatus(204);
});

// ============================================================
// AGENT CALLS — outbound TwiML, keypress opt-out, status callback
// ============================================================

// TwiML Twilio fetches when an outbound agent-call connects. Resolves the
// script + agent voice from the recipient id baked into the URL, then plays
// the message inside a <Gather> so the recipient can press 9 to opt out.
// If Twilio's AMD classifies the call as "machine" we play a shorter
// voicemail-friendly take (no Gather — voicemails don't press keys).
voiceRouter.post('/voice/agent-call-twiml/:recipientId', (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const recipientId = Number(req.params.recipientId);
    const row = db.prepare(
      `SELECT acr.id, acr.phone, acr.name, ac.script, ac.user_id,
              a.name AS agent_name, a.tts_voice
         FROM agent_call_recipients acr
         JOIN agent_calls ac ON ac.id = acr.agent_call_id
         JOIN agents a ON a.id = ac.agent_id
        WHERE acr.id = ?`
    ).get(recipientId) as any;
    if (!row) {
      twiml.say('This call cannot be completed.');
      return res.type('text/xml').send(twiml.toString());
    }
    const voice = row.tts_voice || 'Polly.Joanna-Neural';
    // Honor a voice opt-out recorded between queue-time and dial-time
    // (e.g. recipient pressed 9 on a prior call seconds earlier).
    const optedRow = db.prepare(
      `SELECT voice_opted_out FROM contacts WHERE user_id = ? AND phone = ?`
    ).get(row.user_id, row.phone) as any;
    if (optedRow?.voice_opted_out) {
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    // Twilio AnsweredBy values: human, machine_start, machine_end_beep,
    // machine_end_silence, machine_end_other, fax, unknown. Anything that
    // starts with "machine" → leave a short voicemail. Default to human.
    const answeredBy = String(req.body.AnsweredBy || 'human');
    const isMachine = answeredBy.startsWith('machine');

    const greetName = row.name ? `, ${row.name}` : '';
    const intro = `Hi${greetName}, this is ${row.agent_name}. ${row.script}`;
    if (isMachine) {
      // Voicemail path: just leave the message + identifying info.
      twiml.pause({ length: 1 });
      twiml.say({ voice }, intro);
      twiml.say({ voice }, 'Thanks, goodbye.');
      twiml.hangup();
    } else {
      // Live human path: deliver message inside a Gather so the recipient
      // can press 9 to opt out. Timeout=3 keeps the call short after the
      // message ends if they don't press anything.
      const gather = twiml.gather({
        numDigits: 1,
        timeout: 3,
        action: `/api/voice/agent-call-keypress?recipientId=${recipientId}`,
        method: 'POST',
      });
      gather.pause({ length: 1 });
      gather.say({ voice }, intro);
      gather.pause({ length: 1 });
      gather.say({ voice }, 'Press 9 if you would like to be removed from our calls. Otherwise, goodbye.');
      twiml.hangup();
    }
    res.type('text/xml').send(twiml.toString());
  } catch (e) {
    log.error('voice/agent-call-twiml', 'handler threw', e);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// Recipient pressed a key during the agent's message. "9" = opt out;
// anything else = just hang up (don't burn a third Twilio request).
voiceRouter.post('/voice/agent-call-keypress', (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const recipientId = Number(req.query.recipientId);
    const digit = String(req.body.Digits || '');
    if (digit === '9' && recipientId) {
      const row = db.prepare(
        `SELECT acr.phone, ac.user_id FROM agent_call_recipients acr
           JOIN agent_calls ac ON ac.id = acr.agent_call_id
          WHERE acr.id = ?`
      ).get(recipientId) as any;
      if (row) {
        setVoiceOptOut(row.user_id, row.phone, true);
        const voice = 'Polly.Joanna-Neural';
        twiml.say({ voice }, 'You have been removed from our list. Goodbye.');
      }
    }
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  } catch (e) {
    log.error('voice/agent-call-keypress', 'handler threw', e);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// Twilio call-lifecycle callback. We get one POST per status change
// (initiated → ringing → in-progress → completed/no-answer/busy/failed).
// Update the per-recipient row and capture machine-detection result so the
// UI can show "answered by voicemail" vs "answered by human".
voiceRouter.post('/voice/agent-call-status', (req, res) => {
  try {
    const sid = String(req.body.CallSid || '');
    const status = String(req.body.CallStatus || '');
    const duration = Number(req.body.CallDuration || 0);
    const answeredBy = String(req.body.AnsweredBy || '');
    const errorCode = String(req.body.ErrorCode || '');
    if (sid) {
      db.prepare(
        `UPDATE agent_call_recipients
            SET status = ?, duration_sec = ?, answered_by = ?, error = ?
          WHERE twilio_sid = ?`
      ).run(status, duration || null, answeredBy || null, errorCode || null, sid);
    }
  } catch (e) {
    log.error('voice/agent-call-status', 'handler threw', e);
  }
  res.sendStatus(204);
});

// Status callbacks — call lifecycle logging + completed-call history.
// This is the single best signal for "why did the call drop".
voiceRouter.post('/voice/status', (req, res) => {
  const { CallSid, From, To, CallStatus, CallDuration, Direction, ErrorCode, ErrorMessage, SipResponseCode } = req.body;
  if (ErrorCode || CallStatus === 'failed') {
    log.error('voice/status', `call ${CallStatus}`, { CallSid, From, To, ErrorCode, ErrorMessage, SipResponseCode });
  } else {
    log.info('voice/status', `call ${CallStatus}`, { CallSid, From, To, CallDuration });
  }
  if (CallStatus === 'completed') {
    const peer = Direction === 'inbound' ? String(From) : String(To);
    // Our number is the dialed number on inbound, the caller ID on outbound.
    const owner = resolveInboundOwner(
      String(Direction === 'inbound' ? To : From),
      String(Direction === 'inbound' ? From : To),
    );
    if (owner) {
      db.prepare(
        'INSERT INTO calls (user_id, peer_phone, direction, duration_sec, twilio_sid, started_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(owner, peer, Direction === 'inbound' ? 'in' : 'out', Number(CallDuration || 0), CallSid, Date.now());
    }
  }
  res.sendStatus(204);
});
