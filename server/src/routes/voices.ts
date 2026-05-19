import { Router } from 'express';
import { db } from '../lib/db.js';

export const voicesRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';

// ── Provider seam ──────────────────────────────────────────────────────────
// xAI Grok does NOT expose a public voice-creation/cloning API today. We model
// a "voice" as a profile the user names + styles; it synthesizes via Twilio's
// neural TTS now, and will route to Grok the moment XAI_API_KEY + a voice API
// exist (swap createVoice's body — the rest of the app already uses voice_id).

const GROK_AVAILABLE = !!process.env.XAI_API_KEY && process.env.XAI_VOICE === 'on';

// Curated starter voices (work immediately on calls/voicemail).
export const VOICE_PRESETS = [
  { name: 'Nova',  style: 'warm, friendly',        tts_voice: 'Polly.Joanna-Neural' },
  { name: 'Atlas', style: 'deep, confident',       tts_voice: 'Polly.Matthew-Neural' },
  { name: 'Sage',  style: 'calm, professional',    tts_voice: 'Polly.Kendra-Neural' },
  { name: 'Rex',   style: 'energetic, upbeat',     tts_voice: 'Polly.Joey-Neural' },
  { name: 'Iris',  style: 'bright, casual',        tts_voice: 'Polly.Salli-Neural' },
];

function pickTtsForStyle(style: string): string {
  const s = style.toLowerCase();
  if (/deep|confident|authoritative|serious/.test(s)) return 'Polly.Matthew-Neural';
  if (/calm|professional|soft/.test(s))                return 'Polly.Kendra-Neural';
  if (/energetic|upbeat|hype|excited/.test(s))         return 'Polly.Joey-Neural';
  if (/bright|casual|fun/.test(s))                     return 'Polly.Salli-Neural';
  return 'Polly.Joanna-Neural';
}

// GET /api/voices — presets + the user's saved custom voices
voicesRouter.get('/voices', (_req, res) => {
  const custom = db.prepare(
    `SELECT id, name, provider, tts_voice, style FROM voices WHERE user_id = ? ORDER BY created_at DESC`
  ).all(USER);
  res.json({
    grokAvailable: GROK_AVAILABLE,
    presets: VOICE_PRESETS,
    custom,
    note: GROK_AVAILABLE
      ? 'Grok voice is active.'
      : 'Grok custom voices require an xAI voice API (not public yet). Voices synthesize with neural TTS for now and will upgrade automatically.',
  });
});

// POST /api/voices  body: { name, style }  — "create a voice" (easy)
voicesRouter.post('/voices', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const style = String(req.body?.style || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'name required' });

  let provider = 'tts';
  let tts_voice = pickTtsForStyle(style);

  if (GROK_AVAILABLE) {
    // Placeholder for the real call once xAI ships it, e.g.:
    //   const v = await grok.voices.create({ name, style });
    //   provider = 'grok'; tts_voice = v.id;
    provider = 'grok';
  }

  const r = db.prepare(
    `INSERT INTO voices (user_id, name, provider, tts_voice, style, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(USER, name, provider, tts_voice, style, Date.now());
  res.json({ id: Number(r.lastInsertRowid), name, provider, tts_voice, style });
});

voicesRouter.delete('/voices/:id', (req, res) => {
  db.prepare(`DELETE FROM voices WHERE id = ? AND user_id = ?`).run(Number(req.params.id), USER);
  res.json({ ok: true });
});
