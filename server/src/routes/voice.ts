import { Router } from 'express';
import twilio from 'twilio';
import { db, getDefaultAgent, getOrCreateConversation, getAgentForConversation } from '../lib/db.js';
import { generateVoiceGreeting } from '../lib/agent.js';
import { twilioConfig } from '../lib/twilio.js';

export const voiceRouter = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;
const USER = process.env.DEMO_USER_ID || 'demo';

// Outbound (from softphone): TwiML App webhook
// The mobile/web SDK passes the dialed number as `To` parameter.
voiceRouter.post('/voice/outbound', (req, res) => {
  const to = String(req.body.To || '').trim();
  const callerId = twilioConfig.defaultFrom;
  const twiml = new VoiceResponse();
  if (!to) {
    twiml.say('No destination number provided.');
  } else {
    const dial = twiml.dial({ callerId, answerOnBridge: true });
    if (/^\+?\d+$/.test(to)) {
      dial.number(to);
    } else {
      dial.client(to);
    }
  }
  res.type('text/xml').send(twiml.toString());
});

// Inbound: Twilio number's Voice webhook -> ring the softphone client
voiceRouter.post('/voice/inbound', (req, res) => {
  const fromNumber = String(req.body.From || '');
  const twiml = new VoiceResponse();
  const dial = twiml.dial({ timeout: 25, answerOnBridge: true, callerId: fromNumber });
  dial.client(USER);
  // If client doesn't answer, fall through to voicemail
  twiml.redirect({ method: 'POST' }, '/api/voice/voicemail-greeting');
  res.type('text/xml').send(twiml.toString());
});

voiceRouter.post('/voice/voicemail-greeting', async (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const fromNumber = String(req.body.From || '');
    let agent = null as any;
    if (fromNumber) {
      const conv = db.prepare(
        'SELECT id FROM conversations WHERE user_id = ? AND peer_phone = ?'
      ).get(USER, fromNumber) as { id: number } | undefined;
      if (conv) agent = getAgentForConversation(USER, conv.id);
    }
    if (!agent) agent = getDefaultAgent(USER);
    const greeting = agent ? await generateVoiceGreeting(agent) : "Please leave a message after the tone.";
    twiml.say({ voice: 'Polly.Joanna' }, greeting);
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
  const conv = db.prepare(
    'SELECT id FROM conversations WHERE user_id = ? AND peer_phone = ?'
  ).get(USER, from) as { id: number } | undefined;
  const convId = conv?.id || Number(
    db.prepare('INSERT INTO conversations (user_id, peer_phone, last_message_at) VALUES (?, ?, ?)')
      .run(USER, from, Date.now()).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at)
     VALUES (?, 'in', ?, ?, 'voicemail', ?)`
  ).run(convId, `[Voicemail] ${text}`, sid, Date.now());
  db.prepare('UPDATE conversations SET last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?')
    .run(Date.now(), convId);
  res.sendStatus(204);
});

// Status callbacks (optional logging)
voiceRouter.post('/voice/status', (req, res) => {
  const { CallSid, From, To, CallStatus, CallDuration, Direction } = req.body;
  if (CallStatus === 'completed') {
    const peer = Direction === 'inbound' ? String(From) : String(To);
    db.prepare(
      'INSERT INTO calls (user_id, peer_phone, direction, duration_sec, twilio_sid, started_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(USER, peer, Direction === 'inbound' ? 'in' : 'out', Number(CallDuration || 0), CallSid, Date.now());
  }
  res.sendStatus(204);
});
