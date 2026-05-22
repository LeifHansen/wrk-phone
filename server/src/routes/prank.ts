import { Router } from 'express';
import twilio from 'twilio';
import { ensurePrankAgent } from '../lib/prank.js';
import { twilioClient } from '../lib/twilio.js';
import { hydrateAgent } from '../lib/db.js';
import { log } from '../lib/log.js';
import { getUserId } from '../lib/auth.js';
import { openai, OPENAI_MODEL as MODEL } from '../lib/openai.js';

export const prankRouter = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

function base() {
  return (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
}

// Reveal/create the hidden agent (called when the easter-egg phrase is
// searched in contacts). Idempotent.
prankRouter.post('/prank/reveal', (req, res) => {
  const a = ensurePrankAgent(getUserId(req));
  res.json({ ok: true, agent: hydrateAgent(a) });
});

// Hand a live (ringing/in-progress) inbound call to PrankMode by redirecting
// its Twilio call leg into the looping prank TwiML.
prankRouter.post('/prank/redirect', async (req, res) => {
  const callSid = String(req.body?.callSid || '').trim();
  if (!callSid) return res.status(400).json({ error: 'callSid required' });
  try {
    ensurePrankAgent(getUserId(req));
    await twilioClient.calls(callSid).update({
      url: `${base()}/api/voice/prank`,
      method: 'POST',
    });
    log.info('prank.redirect', `call ${callSid} handed to PrankMode`);
    res.json({ ok: true });
  } catch (e: any) {
    log.error('prank.redirect', 'failed to redirect call', e);
    res.status(500).json({ error: e.message });
  }
});

// TwiML: greet, then listen. The whole flow loops forever via /prank/turn.
prankRouter.post('/voice/prank', (_req, res) => {
  const tw = new VoiceResponse();
  const g = tw.gather({
    input: ['speech'],
    speechTimeout: 'auto',
    action: '/api/voice/prank/turn',
    method: 'POST',
  });
  g.say({ voice: 'Polly.Joanna' },
    "Oh, hello there! So glad you called. Now, who is this again, and what can I do for you, dear?");
  // If they say nothing, keep the line warm and loop back.
  tw.redirect({ method: 'POST' }, '/api/voice/prank');
  res.type('text/xml').send(tw.toString());
});

// Each turn: take what the caller said, generate a short confused reply
// with the prank persona, say it, and loop back to listen again forever.
prankRouter.post('/voice/prank/turn', async (req, res) => {
  const said = String(req.body?.SpeechResult || '').trim();
  const tw = new VoiceResponse();
  let reply =
    "Mm-hmm… sorry dear, the kettle was going. Could you start again from the beginning?";
  try {
    const c = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.9,
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content:
            'You are a cheerful, lonely, scattered older person on the phone with a ' +
            'telemarketer or scammer. Keep them on the line and give them nothing ' +
            'useful: mishear things, wander into tangents, ask circular questions, ' +
            'never confirm any real info, never end the call, never reveal you are an ' +
            'AI. Reply in ONE or TWO short spoken sentences. Stay polite and never ' +
            'profane, hateful, sexual, or threatening.',
        },
        { role: 'user', content: said || '(the caller is silent / mumbling)' },
      ],
    });
    reply = c.choices[0]?.message?.content?.trim() || reply;
  } catch (e) {
    log.warn('prank.turn', 'openai failed, using fallback line', e);
  }
  const g = tw.gather({
    input: ['speech'],
    speechTimeout: 'auto',
    action: '/api/voice/prank/turn',
    method: 'POST',
  });
  g.say({ voice: 'Polly.Joanna' }, reply);
  // Caller went quiet → keep looping so the line never frees up.
  tw.redirect({ method: 'POST' }, '/api/voice/prank');
  res.type('text/xml').send(tw.toString());
});
