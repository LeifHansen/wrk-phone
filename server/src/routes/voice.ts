import { Router } from 'express';
import twilio from 'twilio';
import { db, getDefaultAgent, getOrCreateConversation, getAgentForConversation, getActiveNumber } from '../lib/db.js';
import { generateVoiceGreeting, generateLiveVoiceOpening, generateLiveVoiceReply } from '../lib/agent.js';
import { twilioConfig } from '../lib/twilio.js';
import { log } from '../lib/log.js';
import { emit } from '../lib/events.js';
import { isElevenLabsVoice, synthesizeElevenLabs } from '../lib/tts.js';
import { pickTtsForStyle } from './voices.js';
import crypto from 'node:crypto';

// Render `text` as either Twilio `<Say>` (Polly path) or pre-synthesized
// `<Play>` audio (ElevenLabs cloned-voice path). Falls back to a Polly voice
// if the ElevenLabs synthesis fails — the call still works, just in a neural
// preset instead of the cloned voice. `fallback` is the style-matched Polly
// voice (see resolveVoice) so a cloned-voice agent doesn't silently collapse
// to the same default woman's voice for every agent on synth failure.
async function speak(
  parent: any,
  voice: string,
  text: string,
  ctx: { userId: string; cacheKey: string },
  fallback = 'Polly.Joanna-Neural',
): Promise<void> {
  if (isElevenLabsVoice(voice)) {
    const url = await synthesizeElevenLabs(text, voice, ctx.userId, ctx.cacheKey);
    if (url) { parent.play({}, url); return; }
    // fall through → Polly as a safety net
  }
  const pollyVoice = (voice && voice.startsWith('Polly.')) ? voice : fallback;
  parent.say({ voice: pollyVoice }, text);
}

// Resolve the concrete TTS voice for an agent + a sensible Polly fallback.
//
// Why this exists: agents store `tts_voice` directly when the user picks a
// voice, but (a) the auto-created Default agent has none, and (b) a cloned
// `elevenlabs:` voice produces nothing when no ELEVENLABS_API_KEY is set or a
// synth call fails. Both cases previously fell back to Polly.Joanna for EVERY
// agent — hence "default woman's voice no matter which agent". We now resolve
// the voice through the linked `voices` row when the agent's tts_voice is
// blank, and derive the Polly fallback from that voice's saved style so the
// fallback at least varies per agent.
function resolveVoice(opts: {
  tts_voice?: string | null;
  voice_id?: number | null;
  user_id: string;
}): { voice: string; fallback: string } {
  let voice = (opts.tts_voice || '').trim();
  let style = '';
  if (opts.voice_id) {
    const v = db.prepare(
      `SELECT tts_voice, style FROM voices WHERE id = ? AND user_id = ?`
    ).get(opts.voice_id, opts.user_id) as { tts_voice: string; style: string } | undefined;
    if (v) {
      if (!voice && v.tts_voice) voice = v.tts_voice;
      style = v.style || '';
    }
  }
  if (!voice) voice = 'Polly.Joanna-Neural';
  const fallback = voice.startsWith('Polly.') ? voice : pickTtsForStyle(style);
  return { voice, fallback };
}

// Append a chunk to the Live Calls feed so the user can watch a two-way agent
// conversation unfold in real time. `source`: 'outbound' = the agent speaking,
// 'inbound' = the person on the other end. Best-effort — never throws into a
// TwiML handler.
function appendCallEvent(callSid: string, userId: string, source: 'inbound' | 'outbound' | 'system', text: string): void {
  try {
    if (!callSid || !text) return;
    const last = db.prepare(
      `SELECT COALESCE(MAX(sequence), 0) AS m FROM live_call_events WHERE call_sid = ?`
    ).get(callSid) as { m: number };
    db.prepare(
      `INSERT INTO live_call_events (call_sid, user_id, sequence, source, text, is_final, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(callSid, userId, (last?.m || 0) + 1, source, text, Date.now());
  } catch (e) {
    log.warn('voice', 'appendCallEvent failed', e);
  }
}

// Stable hash for the TTS cache key — text + voice id together so a tweak
// to either invalidates the cached MP3 automatically.
function hashKey(...parts: string[]): string {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

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
      // `action` fires when the dial completes — Twilio POSTs DialCallStatus,
      // DialCallDuration, DialCallSid. This is the only signal we get back
      // about the call lifecycle for softphone-initiated outbound, so it's
      // also the only place we can persist a row in the `calls` table for
      // analytics. Without it, the metrics table stays empty forever.
      const dial = twiml.dial({
        callerId,
        answerOnBridge: true,
        action: '/api/voice/dial-status?direction=out',
        method: 'POST',
      });
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


// Inbound: Twilio number's Voice webhook
//
// Routing decision:
//   1. If the owner has an agent with voice_mode='auto' assigned to the
//      conversation (or as default) — skip the softphone entirely and
//      have the AI answer the call live (/voice/inbound-agent).
//   2. Otherwise → ring the softphone client. If unanswered, fall
//      through to the voicemail greeting (which uses the AI to
//      generate the greeting text but still records to voicemail).
//
// Cold call to a shared number with no owner = reject.
voiceRouter.post('/voice/inbound', (req, res) => {
  const fromNumber = String(req.body.From || '');
  const owner = resolveInboundOwner(String(req.body.To || ''), fromNumber);
  const twiml = new VoiceResponse();
  if (!owner) {
    twiml.reject();
    return res.type('text/xml').send(twiml.toString());
  }
  // Pick the agent that would handle THIS call (conversation-pinned if the
  // caller has a thread, else the user's default agent).
  let agent: any = null;
  if (fromNumber) {
    const conv = db.prepare(
      'SELECT id FROM conversations WHERE user_id = ? AND peer_phone = ?'
    ).get(owner, fromNumber) as { id: number } | undefined;
    if (conv) agent = getAgentForConversation(owner, conv.id);
  }
  if (!agent) agent = getDefaultAgent(owner);

  // Live-answer AI path. Hand the whole call to /voice/inbound-agent
  // which runs a Gather → AI → Say loop. Cheap to fall through to the
  // softphone path if anything goes wrong.
  if (agent && (agent as any).voice_mode === 'auto') {
    twiml.redirect({ method: 'POST' }, `/api/voice/inbound-agent?agentId=${(agent as any).id}`);
    return res.type('text/xml').send(twiml.toString());
  }

  // Default path: ring softphone, fall through to voicemail.
  const dial = twiml.dial({
    timeout: 25,
    answerOnBridge: true,
    callerId: fromNumber,
    action: '/api/voice/dial-status?direction=in',
    method: 'POST',
  });
  dial.client(owner);
  twiml.redirect({ method: 'POST' }, '/api/voice/voicemail-greeting');
  res.type('text/xml').send(twiml.toString());
});

// ---- Live-answer AI voice agent ----
// When voice_mode='auto', the AI picks up the call directly and runs
// a turn-by-turn conversation. State is rehydrated from live_call_turns
// on every callback (Twilio doesn't carry state between webhook hits).
//
// Loop:
//   1. /voice/inbound-agent      → AI greets, opens a Gather for speech
//   2. /voice/inbound-agent-turn → AI replies to caller speech, loops
//
// End conditions (the call runs as long as the conversation naturally does):
//   - "goodbye"/"thanks bye" detected → final reply then hangup
//   - caller goes silent → graceful closer then hangup
//   - MAX_TURNS is only a runaway safety bound (stuck-loop / cost guard), set
//     high so normal conversations are never cut off mid-thread.
const MAX_TURNS = 50;

voiceRouter.post('/voice/inbound-agent', async (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const callSid = String(req.body.CallSid || '');
    const fromNumber = String(req.body.From || '');
    const owner = resolveInboundOwner(String(req.body.To || ''), fromNumber);
    const agentId = Number(req.query.agentId);
    if (!owner || !agentId) {
      twiml.say('Sorry, this line is not available right now. Please try again later.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    const agent = db.prepare(
      `SELECT * FROM agents WHERE id = ? AND user_id = ?`
    ).get(agentId, owner) as any;
    if (!agent) {
      twiml.say('Sorry, this line is not available right now.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    const opening = await generateLiveVoiceOpening(agent);
    // Persist the opening as the agent's first turn so the next webhook
    // has full context when the caller responds.
    if (callSid) {
      db.prepare(
        `INSERT INTO live_call_turns (call_sid, user_id, agent_id, role, text, created_at)
         VALUES (?, ?, ?, 'agent', ?, ?)`
      ).run(callSid, owner, agent.id, opening, Date.now());
      appendCallEvent(callSid, owner, 'outbound', opening);
    }
    const { voice, fallback } = resolveVoice({ tts_voice: agent.tts_voice, voice_id: (agent as any).voice_id, user_id: owner });
    const ctx = { userId: owner, cacheKey: hashKey(voice, 'opening', opening) };
    await speak(twiml, voice, opening, ctx, fallback);
    // Open a Gather. speechTimeout='auto' lets Twilio detect end of speech.
    const gather = twiml.gather({
      input: ['speech'] as any,
      speechTimeout: 'auto',
      action: `/api/voice/inbound-agent-turn?agentId=${agent.id}`,
      method: 'POST',
      // Don't wait forever for the caller to start speaking after greeting.
      timeout: 6,
    });
    // If the caller doesn't say anything, the call drops here.
    // After Gather completes (or times out without speech), this fires:
    twiml.say('I didn\'t catch that. Goodbye.');
    twiml.hangup();
  } catch (e) {
    log.error('voice/inbound-agent', 'opening threw', e);
    twiml.say('Sorry, something went wrong. Please try again.');
    twiml.hangup();
  }
  res.type('text/xml').send(twiml.toString());
});

voiceRouter.post('/voice/inbound-agent-turn', async (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const callSid = String(req.body.CallSid || '');
    const owner = resolveInboundOwner(String(req.body.To || ''), String(req.body.From || ''));
    const agentId = Number(req.query.agentId);
    const callerSaid = String(req.body.SpeechResult || '').trim();

    if (!owner || !agentId || !callSid) {
      twiml.say('Sorry, this call cannot continue.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    const agent = db.prepare(
      `SELECT * FROM agents WHERE id = ? AND user_id = ?`
    ).get(agentId, owner) as any;
    if (!agent) {
      twiml.say('Sorry, this line is not available.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    const { voice, fallback } = resolveVoice({ tts_voice: agent.tts_voice, voice_id: (agent as any).voice_id, user_id: owner });

    // Persist whatever the caller said (even if empty — silence has meaning
    // for the end-condition counter).
    if (callerSaid) {
      db.prepare(
        `INSERT INTO live_call_turns (call_sid, user_id, agent_id, role, text, created_at)
         VALUES (?, ?, ?, 'caller', ?, ?)`
      ).run(callSid, owner, agent.id, callerSaid, Date.now());
      appendCallEvent(callSid, owner, 'inbound', callerSaid);
    }

    // Rehydrate full conversation history for this call.
    const turns = db.prepare(
      `SELECT role, text FROM live_call_turns WHERE call_sid = ? ORDER BY id ASC`
    ).all(callSid) as { role: 'caller' | 'agent'; text: string }[];

    // End condition: turn cap.
    const agentTurns = turns.filter((t) => t.role === 'agent').length;
    if (agentTurns >= MAX_TURNS) {
      const goodbye = 'I have to let you go now. Take care.';
      await speak(twiml, voice, goodbye, { userId: owner, cacheKey: hashKey(voice, 'goodbye') }, fallback);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // End condition: caller said goodbye-ish.
    const said = callerSaid.toLowerCase();
    const callerGoodbye = /(^|\b)(bye|goodbye|thanks bye|gotta go|i'?ll let you go|talk to you later|take care)(\b|$)/.test(said);

    // Generate AI reply (history excludes the just-appended caller turn,
    // which is passed separately as callerSaid).
    const historyWithoutLast = turns.slice(0, callerSaid ? turns.length - 1 : turns.length);
    let reply = '';
    try {
      reply = await generateLiveVoiceReply(agent, historyWithoutLast, callerSaid || '...');
    } catch (e) {
      log.error('voice/inbound-agent-turn', 'reply generation failed', e);
      reply = 'I\'m sorry, I missed that. Could you say it again?';
    }
    if (!reply) reply = 'I\'m sorry, I didn\'t catch that. Could you say it again?';

    // Persist the AI's reply so the next turn sees it in history.
    db.prepare(
      `INSERT INTO live_call_turns (call_sid, user_id, agent_id, role, text, created_at)
       VALUES (?, ?, ?, 'agent', ?, ?)`
    ).run(callSid, owner, agent.id, reply, Date.now());
    appendCallEvent(callSid, owner, 'outbound', reply);

    const ctx = { userId: owner, cacheKey: hashKey(voice, 'turn', String(turns.length), reply.slice(0, 40)) };
    await speak(twiml, voice, reply, ctx, fallback);

    if (callerGoodbye) {
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Next turn — another Gather.
    const gather = twiml.gather({
      input: ['speech'] as any,
      speechTimeout: 'auto',
      action: `/api/voice/inbound-agent-turn?agentId=${agent.id}`,
      method: 'POST',
      timeout: 8,
    });
    // If the caller goes silent, end the call gracefully.
    twiml.say('Sounds like you\'re away. I\'ll let you go. Take care.');
    twiml.hangup();
  } catch (e) {
    log.error('voice/inbound-agent-turn', 'handler threw', e);
    twiml.say('Sorry, something went wrong. Goodbye.');
    twiml.hangup();
  }
  res.type('text/xml').send(twiml.toString());
});

// Dial-action callback — fires when the inner <Dial> leg completes for
// inbound OR outbound calls. Body includes DialCallStatus,
// DialCallDuration, DialCallSid. We log the call here so analytics has
// actual data; previously /voice/status was the only INSERT site but it
// only fires when statusCallback is configured (which it never was on
// these routes), so the `calls` table stayed empty.
voiceRouter.post('/voice/dial-status', (req, res) => {
  const twiml = new (twilio.twiml.VoiceResponse)();
  try {
    const direction = req.query.direction === 'in' ? 'in' : 'out';
    const from = String(req.body.From || '');
    const to = String(req.body.To || '');
    const dialStatus = String(req.body.DialCallStatus || '');
    const duration = Number(req.body.DialCallDuration || 0);
    const dialSid = String(req.body.DialCallSid || '') || String(req.body.CallSid || '');

    // Only record completed dials. Busy/no-answer/canceled/failed go to logs
    // (above) but not the calls table — matches what users mean by
    // "calls placed/received" on the analytics page.
    if (dialStatus === 'completed') {
      const peer = direction === 'in' ? from : to;
      const ourNumber = direction === 'in' ? to : from;
      // Outbound from the softphone is always THIS account's call (single-
      // user prod). Skip the resolveInboundOwner lookup entirely — it's
      // built for inbound webhooks and would always return null on a shared
      // toll-free, wasting a DB read on every completed outbound call.
      // (Multi-tenant outbound would need a CallSid→user map at /voice/
      // outbound time; out of scope.)
      const owner = direction === 'out' ? USER : resolveInboundOwner(ourNumber, peer);
      if (owner) {
        db.prepare(
          'INSERT INTO calls (user_id, peer_phone, direction, duration_sec, twilio_sid, started_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(owner, peer, direction, duration, dialSid, Date.now());
      } else {
        log.warn('voice/dial-status', 'no owner resolved — call not logged', { direction, from, to });
      }
    } else {
      log.info('voice/dial-status', `dial ${dialStatus}`, { direction, from, to, duration });
    }

    // INBOUND voicemail fallback: when the user's softphone didn't answer
    // (no-answer / busy / failed / canceled), redirect to the voicemail
    // greeting handler. Without this redirect, the action callback would
    // just hang up empty and the caller would never reach voicemail —
    // the <Redirect> after <Dial> in /voice/inbound is IGNORED once
    // `action` is set on the dial.
    if (req.query.direction === 'in' && dialStatus !== 'completed') {
      twiml.redirect({ method: 'POST' }, '/api/voice/voicemail-greeting');
    }
  } catch (e) {
    log.error('voice/dial-status', 'handler threw', e);
  }
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
// AGENT CALLS — outbound live two-way AI conversation, status callback
// ============================================================

// Look up everything an agent-call TwiML handler needs from a recipient id:
// the recipient, the campaign script, and the FULL agent row (so the AI reply
// generator gets persona/instructions/examples and the voice resolves
// correctly). Returns null if the recipient/campaign/agent chain is broken.
function loadAgentCallContext(recipientId: number): {
  rec: { phone: string; name: string | null; script: string; user_id: string; voicemail_only: number; agent_id: number };
  agent: any;
} | null {
  const rec = db.prepare(
    `SELECT acr.phone, acr.name, ac.script, ac.user_id, ac.voicemail_only, ac.agent_id
       FROM agent_call_recipients acr
       JOIN agent_calls ac ON ac.id = acr.agent_call_id
      WHERE acr.id = ?`
  ).get(recipientId) as any;
  if (!rec) return null;
  const agent = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(rec.agent_id) as any;
  if (!agent) return null;
  return { rec, agent };
}

// TwiML Twilio fetches when an outbound agent-call connects.
//
//   - Machine pickup (or voicemail-only mode): leave the script as a single
//     voicemail message — you can't have a conversation with an answering
//     machine.
//   - Live human: GREET with the script, then open a speech <Gather> that
//     hands control to /voice/agent-call-turn, which runs a real back-and-forth
//     AI conversation (same engine as the inbound live-answer agent). There is
//     NO "press 9 to opt out" notice — the call is a normal conversation.
voiceRouter.post('/voice/agent-call-twiml/:recipientId', async (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const recipientId = Number(req.params.recipientId);
    const ctxRow = loadAgentCallContext(recipientId);
    if (!ctxRow) {
      twiml.say('This call cannot be completed.');
      return res.type('text/xml').send(twiml.toString());
    }
    const { rec, agent } = ctxRow;
    const callSid = String(req.body.CallSid || '');
    const { voice, fallback } = resolveVoice({ tts_voice: agent.tts_voice, voice_id: agent.voice_id, user_id: rec.user_id });

    // Twilio AnsweredBy values: human, machine_start, machine_end_beep,
    // machine_end_silence, machine_end_other, fax, unknown.
    // - Regular agent call: treat machine* as voicemail, everything else as
    //   a live human.
    // - voicemail_only: treat ANYTHING that isn't a confirmed human as a
    //   machine so we don't hang up on unclassified pickups.
    const answeredBy = String(req.body.AnsweredBy || '');
    const voicemailOnly = !!rec.voicemail_only;
    const isMachine = voicemailOnly ? answeredBy !== 'human' : answeredBy.startsWith('machine');

    const greetName = rec.name ? `, ${rec.name}` : '';
    const intro = `Hi${greetName}, this is ${agent.name}. ${rec.script}`;
    const ttsCtx = (label: string) => ({
      userId: rec.user_id as string,
      cacheKey: hashKey(voice, label, intro, String(recipientId)),
    });
    const goodbyeCtx = { userId: rec.user_id as string, cacheKey: hashKey(voice, 'goodbye', 'Thanks, goodbye.') };

    if (voicemailOnly && !isMachine) {
      // Drop-voicemail mode: hang up on live human pickup. We can't redial
      // straight to voicemail (Twilio doesn't expose carrier-side RVM); the
      // next attempt — or the recipient calling back — lands on voicemail.
      twiml.pause({ length: 1 });
      twiml.hangup();
    } else if (isMachine) {
      // Voicemail path — just leave the script, then hang up.
      twiml.pause({ length: 1 });
      await speak(twiml, voice, intro, ttsCtx('intro'), fallback);
      await speak(twiml, voice, 'Thanks, goodbye.', goodbyeCtx, fallback);
      twiml.hangup();
    } else {
      // Live human → open a real two-way AI conversation. Seed the script as
      // the agent's first turn so /voice/agent-call-turn has full context when
      // the person responds.
      if (callSid) {
        db.prepare(
          `INSERT INTO live_call_turns (call_sid, user_id, agent_id, role, text, created_at)
           VALUES (?, ?, ?, 'agent', ?, ?)`
        ).run(callSid, rec.user_id, rec.agent_id, intro, Date.now());
        appendCallEvent(callSid, rec.user_id, 'outbound', intro);
      }
      twiml.pause({ length: 1 });
      await speak(twiml, voice, intro, ttsCtx('intro'), fallback);
      twiml.gather({
        input: ['speech'] as any,
        speechTimeout: 'auto',
        action: `/api/voice/agent-call-turn?recipientId=${recipientId}`,
        method: 'POST',
        timeout: 7,
      });
      // No response after the opening → brief closer, then hang up.
      await speak(twiml, voice, 'Thanks for your time. Take care.', { userId: rec.user_id, cacheKey: hashKey(voice, 'closer') }, fallback);
      twiml.hangup();
    }
    res.type('text/xml').send(twiml.toString());
  } catch (e) {
    log.error('voice/agent-call-twiml', 'handler threw', e);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// One turn of a live OUTBOUND agent conversation. Mirrors
// /voice/inbound-agent-turn: rehydrate the transcript from live_call_turns,
// generate the agent's next line (kept on the campaign script's purpose via
// the `goal` option), speak it, then re-open a <Gather> for the next turn.
// Ends on a spoken goodbye, on silence, or at the MAX_TURNS safety bound.
voiceRouter.post('/voice/agent-call-turn', async (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const recipientId = Number(req.query.recipientId);
    const callSid = String(req.body.CallSid || '');
    const callerSaid = String(req.body.SpeechResult || '').trim();
    const ctxRow = loadAgentCallContext(recipientId);
    if (!ctxRow || !callSid) {
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    const { rec, agent } = ctxRow;
    const { voice, fallback } = resolveVoice({ tts_voice: agent.tts_voice, voice_id: agent.voice_id, user_id: rec.user_id });

    if (callerSaid) {
      db.prepare(
        `INSERT INTO live_call_turns (call_sid, user_id, agent_id, role, text, created_at)
         VALUES (?, ?, ?, 'caller', ?, ?)`
      ).run(callSid, rec.user_id, rec.agent_id, callerSaid, Date.now());
      appendCallEvent(callSid, rec.user_id, 'inbound', callerSaid);
    }

    const turns = db.prepare(
      `SELECT role, text FROM live_call_turns WHERE call_sid = ? ORDER BY id ASC`
    ).all(callSid) as { role: 'caller' | 'agent'; text: string }[];

    // Safety bound only — normal conversations end on goodbye/silence below.
    const agentTurns = turns.filter((t) => t.role === 'agent').length;
    if (agentTurns >= MAX_TURNS) {
      await speak(twiml, voice, 'I have to let you go now. Take care.', { userId: rec.user_id, cacheKey: hashKey(voice, 'goodbye') }, fallback);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    const said = callerSaid.toLowerCase();
    const callerGoodbye = /(^|\b)(bye|goodbye|thanks bye|gotta go|i'?ll let you go|talk to you later|take care|not interested)(\b|$)/.test(said);

    const historyWithoutLast = turns.slice(0, callerSaid ? turns.length - 1 : turns.length);
    let reply = '';
    try {
      reply = await generateLiveVoiceReply(agent, historyWithoutLast, callerSaid || '...', { goal: rec.script });
    } catch (e) {
      log.error('voice/agent-call-turn', 'reply generation failed', e);
      reply = 'I\'m sorry, I missed that. Could you say it again?';
    }
    if (!reply) reply = 'I\'m sorry, I didn\'t catch that. Could you say it again?';

    db.prepare(
      `INSERT INTO live_call_turns (call_sid, user_id, agent_id, role, text, created_at)
       VALUES (?, ?, ?, 'agent', ?, ?)`
    ).run(callSid, rec.user_id, rec.agent_id, reply, Date.now());
    appendCallEvent(callSid, rec.user_id, 'outbound', reply);

    const ctx = { userId: rec.user_id, cacheKey: hashKey(voice, 'turn', String(turns.length), reply.slice(0, 40)) };
    await speak(twiml, voice, reply, ctx, fallback);

    if (callerGoodbye) {
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    twiml.gather({
      input: ['speech'] as any,
      speechTimeout: 'auto',
      action: `/api/voice/agent-call-turn?recipientId=${recipientId}`,
      method: 'POST',
      timeout: 8,
    });
    // Caller went quiet → graceful close.
    await speak(twiml, voice, 'Alright, I\'ll let you go. Take care.', { userId: rec.user_id, cacheKey: hashKey(voice, 'silent-close') }, fallback);
    twiml.hangup();
  } catch (e) {
    log.error('voice/agent-call-turn', 'handler threw', e);
    twiml.say('Sorry, something went wrong. Goodbye.');
    twiml.hangup();
  }
  res.type('text/xml').send(twiml.toString());
});

// Twilio real-time transcription callback (configured in TwiML via
// <Start><Transcription statusCallbackUrl=…/>). Twilio posts partial
// and final transcript chunks as the call progresses. We persist each
// chunk to live_call_events so the Live Calls panel can replay/poll.
voiceRouter.post('/voice/agent-call-transcript', (req, res) => {
  try {
    const sid = String(req.body.CallSid || '');
    if (!sid) return res.sendStatus(204);
    // Track is 'inbound_track' (caller / callee) or 'outbound_track' (agent
    // side). Normalize to the friendlier UI labels.
    const track = String(req.body.Track || '').toLowerCase();
    const source =
      track.includes('inbound') ? 'inbound'
      : track.includes('outbound') ? 'outbound'
      : 'system';
    const text = String(
      req.body.TranscriptionData
        ? (() => { try { return JSON.parse(req.body.TranscriptionData).transcript || ''; } catch { return ''; } })()
        : (req.body.TranscriptionText || ''),
    ).trim();
    if (!text) return res.sendStatus(204);
    const isFinal = String(req.body.Final || req.body.IsFinal || 'false').toLowerCase() === 'true' ? 1 : 0;
    // Look up the owning user via the recipient row so the live feed can
    // filter to the right account.
    const recipient = db.prepare(
      `SELECT ac.user_id FROM agent_call_recipients acr
         JOIN agent_calls ac ON ac.id = acr.agent_call_id
        WHERE acr.twilio_sid = ?`
    ).get(sid) as { user_id?: string } | undefined;
    const userId = recipient?.user_id || 'unknown';
    // Sequence — monotonic per call, used by the client to dedupe and to
    // request only NEW events on a poll.
    const last = db.prepare(
      `SELECT COALESCE(MAX(sequence), 0) AS m FROM live_call_events WHERE call_sid = ?`
    ).get(sid) as { m: number };
    db.prepare(
      `INSERT INTO live_call_events (call_sid, user_id, sequence, source, text, is_final, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(sid, userId, (last?.m || 0) + 1, source, text, isFinal, Date.now());
  } catch (e) {
    log.error('voice/agent-call-transcript', 'handler threw', e);
  }
  res.sendStatus(204);
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
