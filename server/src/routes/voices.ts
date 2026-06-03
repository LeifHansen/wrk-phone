import { Router, raw } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { log } from '../lib/log.js';
import { rateLimit } from '../lib/ratelimit.js';

export const voicesRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';

// Voice samples live on the data volume so they survive deploys, served as
// `${PUBLIC_BASE_URL}/voice-samples/<file>` (mounted in index.ts).
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const VOICE_SAMPLE_DIR = path.join(DATA_DIR, 'voice-samples');
fs.mkdirSync(VOICE_SAMPLE_DIR, { recursive: true });

// Per-file cap. Voice samples are short (15-30s of audio ≈ 500KB mp3);
// 25MB covers lossless wav, short m4a, and the .mov clips iPhones produce
// when the user records a quick sample on-device. Anything bigger is
// almost certainly the wrong file. Client cap is in lockstep so we don't
// accept-then-reject with a confusing 413.
const MAX_SAMPLE_BYTES = 25 * 1024 * 1024;

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
}

// Public URL for a stored sample file. We store JUST the filename in DB and
// build the URL on read so the same row works whether PUBLIC_BASE_URL is set
// (prod) or empty (local dev) — the previous full-URL-in-DB scheme broke
// delete-with-orphan-cleanup when the base was empty.
function sampleUrlFor(file: string): string {
  return `${publicBase()}/voice-samples/${file}`;
}

// ── Provider seam ──────────────────────────────────────────────────────────
// Voice cloning provider, picked in order:
//   1. ELEVENLABS_API_KEY → real cloning via POST /v1/voices/add
//   2. XAI_API_KEY + XAI_VOICE=on → future Grok voice cloning
//   3. neither → graceful fallback: store the sample, pick the closest Polly
//      preset from the style description. The agent still works on calls
//      today and auto-upgrades the instant a real key is added (no UI change).
const ELEVENLABS_AVAILABLE = !!process.env.ELEVENLABS_API_KEY;
const GROK_AVAILABLE = !!process.env.XAI_API_KEY && process.env.XAI_VOICE === 'on';

// Curated starter voices (work immediately on calls/voicemail).
export const VOICE_PRESETS = [
  { name: 'Nova',  style: 'warm, friendly',        tts_voice: 'Polly.Joanna-Neural' },
  { name: 'Atlas', style: 'deep, confident',       tts_voice: 'Polly.Matthew-Neural' },
  { name: 'Sage',  style: 'calm, professional',    tts_voice: 'Polly.Kendra-Neural' },
  { name: 'Rex',   style: 'energetic, upbeat',     tts_voice: 'Polly.Joey-Neural' },
  { name: 'Iris',  style: 'bright, casual',        tts_voice: 'Polly.Salli-Neural' },
];

export function pickTtsForStyle(style: string): string {
  const s = (style || '').toLowerCase();
  if (/deep|confident|authoritative|serious/.test(s)) return 'Polly.Matthew-Neural';
  if (/calm|professional|soft/.test(s))                return 'Polly.Kendra-Neural';
  if (/energetic|upbeat|hype|excited/.test(s))         return 'Polly.Joey-Neural';
  if (/bright|casual|fun/.test(s))                     return 'Polly.Salli-Neural';
  return 'Polly.Joanna-Neural';
}

// Best-effort clone via ElevenLabs. Returns the cloned voice id (`elevenlabs:<id>`)
// on success or null if the provider failed — caller falls back to Polly.
// Uses the global fetch + FormData (Node 18+).
async function tryCloneViaElevenLabs(
  name: string,
  description: string,
  sampleBuf: Buffer,
  sampleMime: string,
  sampleExt: string,
): Promise<string | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  try {
    const form = new FormData();
    form.append('name', name);
    form.append('description', description || '');
    // Buffer → Uint8Array → Blob. Casting through Uint8Array sidesteps the
    // SharedArrayBuffer typing edge case in newer @types/node.
    form.append('files', new Blob([new Uint8Array(sampleBuf)], { type: sampleMime }), `sample.${sampleExt}`);
    const resp = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form,
    });
    if (!resp.ok) {
      log.warn('voices', `ElevenLabs clone failed: ${resp.status} ${await resp.text()}`);
      return null;
    }
    const j = await resp.json() as { voice_id: string };
    return `elevenlabs:${j.voice_id}`;
  } catch (e) {
    log.warn('voices', 'ElevenLabs clone threw', e);
    return null;
  }
}

// GET /api/voices — presets + the user's saved custom voices.
// We store the bare filename in `voices.sample_url` (legacy column name) and
// expand to a full URL on read so the API contract stays the same.
voicesRouter.get('/voices', (_req, res) => {
  const rows = db.prepare(
    `SELECT id, name, provider, tts_voice, style, sample_url, cloned
       FROM voices WHERE user_id = ? ORDER BY created_at DESC`
  ).all(USER) as any[];
  const custom = rows.map((r) => ({
    ...r,
    sample_url: r.sample_url ? sampleUrlFor(r.sample_url) : null,
  }));
  res.json({
    cloningProvider: ELEVENLABS_AVAILABLE ? 'elevenlabs' : (GROK_AVAILABLE ? 'grok' : null),
    grokAvailable: GROK_AVAILABLE,
    elevenlabsAvailable: ELEVENLABS_AVAILABLE,
    presets: VOICE_PRESETS,
    custom,
    note: ELEVENLABS_AVAILABLE
      ? 'Voice cloning is active via ElevenLabs. Upload a 30-second clean voice sample to clone.'
      : GROK_AVAILABLE
        ? 'Grok voice cloning is active.'
        : 'No cloning provider configured. Voices fall back to neural TTS presets matched to the style you describe. Add ELEVENLABS_API_KEY to enable cloning.',
  });
});

// POST /api/voices  body: { name, style }  — "create a voice" (style-only)
voicesRouter.post('/voices', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const style = String(req.body?.style || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'name required' });

  const tts_voice = pickTtsForStyle(style);
  const provider = 'tts';
  // Upsert on (user_id, name) so saving the same name twice REPLACES instead
  // of creating a duplicate row. Prevents the "two of the same voice appeared
  // and selecting one highlights both" bug.
  db.prepare(
    `INSERT INTO voices (user_id, name, provider, tts_voice, style, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, name) DO UPDATE SET
        provider = excluded.provider,
        tts_voice = excluded.tts_voice,
        style = excluded.style`
  ).run(USER, name, provider, tts_voice, style, Date.now());
  const row = db.prepare(`SELECT id FROM voices WHERE user_id = ? AND name = ?`).get(USER, name) as { id: number };
  res.json({ id: row.id, name, provider, tts_voice, style, cloned: 0 });
});

// POST /api/voices/upload — accepts a raw audio/video sample for cloning.
// Headers must set Content-Type (audio/mpeg, audio/mp4, video/mp4, etc.) AND
// X-Voice-Name (and optionally X-Voice-Style). The body is the file bytes;
// no multipart — keeps the dependency surface zero.
//
// Flow:
//   1. Persist the sample to disk so it survives reload and can be reused
//      (e.g. retried clone, audit trail of what voice the user uploaded).
//   2. If ELEVENLABS_API_KEY is set, fire the clone and store the returned
//      voice id (cloned=1). If not (or it fails), fall back to a Polly preset
//      matched to the style description — agent still works on calls.
voicesRouter.post(
  '/voices/upload',
  // 5 uploads / minute is plenty for the legit "tweak my voice sample" flow
  // and cheap insurance against a stolen-token attacker bombing the volume
  // (or our ElevenLabs spend) with 20MB POSTs.
  rateLimit({ windowMs: 60_000, max: 5, name: 'voice-upload' }),
  // Accept blank/unknown mime too — Safari and some Android browsers
  // leave file.type empty for certain m4a/mov files, in which case the
  // client falls back to application/octet-stream. Without this, raw()
  // would skip parsing and req.body would be `{}` → 400 with no useful
  // error to the user.
  raw({ type: ['audio/*', 'video/*', 'application/octet-stream'], limit: MAX_SAMPLE_BYTES }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'audio/video body required' });
    }
    const name = String(req.header('x-voice-name') || '').trim().slice(0, 40);
    const style = String(req.header('x-voice-style') || '').trim().slice(0, 200);
    if (!name) return res.status(400).json({ error: 'X-Voice-Name header required' });

    const mime = String(req.header('content-type') || '').toLowerCase();
    // Optional client-provided original filename — used to recover the
    // extension when the mime is generic (octet-stream from Safari, etc).
    const hintedName = String(req.header('x-voice-filename') || '').toLowerCase();
    const filenameExt = (hintedName.match(/\.([a-z0-9]{2,5})$/) || [, ''])[1];
    // Map mime → file extension for storage + provider upload.
    const extMap: Record<string, string> = {
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
      'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
      'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
      'audio/ogg': 'ogg', 'audio/webm': 'weba',
      'audio/flac': 'flac',
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    };
    // Priority: explicit mime → filename extension → guess from broad type.
    const ext =
      extMap[mime] ||
      (filenameExt && filenameExt.length <= 5 ? filenameExt : null) ||
      (mime.startsWith('video/') ? 'mp4' : 'mp3');

    // Persist. We store JUST the filename in DB and expand to a public URL
    // on read — keeps the row valid whether PUBLIC_BASE_URL is set or not
    // and avoids the URL-parsing-on-delete crash from the first cut.
    const file = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(VOICE_SAMPLE_DIR, file), req.body as Buffer);

    // Try real cloning. Falls back gracefully.
    const cloned = await tryCloneViaElevenLabs(name, style, req.body as Buffer, mime, ext);
    const tts_voice = cloned || pickTtsForStyle(style);
    const provider = cloned ? 'elevenlabs' : 'tts';

    // Upsert on (user_id, name) — re-uploading the same-named voice replaces
    // the prior row's sample/clone instead of creating a duplicate. Old
    // sample_url is dropped from disk so we don't accumulate orphaned files.
    const prior = db.prepare(`SELECT sample_url FROM voices WHERE user_id = ? AND name = ?`).get(USER, name) as { sample_url: string | null } | undefined;
    if (prior?.sample_url) {
      // Async + ignore-failures so we don't block the upload response on
      // an EBUSY / ENOENT from the previous sample's file handle.
      await fs.promises.unlink(path.join(VOICE_SAMPLE_DIR, prior.sample_url)).catch(() => {});
    }
    db.prepare(
      `INSERT INTO voices (user_id, name, provider, tts_voice, style, sample_url, cloned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, name) DO UPDATE SET
          provider = excluded.provider,
          tts_voice = excluded.tts_voice,
          style = excluded.style,
          sample_url = excluded.sample_url,
          cloned = excluded.cloned`
    ).run(USER, name, provider, tts_voice, style, file, cloned ? 1 : 0, Date.now());
    const row = db.prepare(`SELECT id FROM voices WHERE user_id = ? AND name = ?`).get(USER, name) as { id: number };
    res.json({
      id: row.id,
      name, provider, tts_voice, style,
      sample_url: sampleUrlFor(file),
      cloned: cloned ? 1 : 0,
      note: cloned
        ? 'Voice cloned successfully.'
        : 'Sample saved. Cloning provider not configured — using a matched neural TTS preset for now.',
    });
  },
);

voicesRouter.delete('/voices/:id', async (req, res) => {
  const id = Number(req.params.id);
  // Best-effort cleanup of the sample file. The DB row is the source of truth.
  const row = db.prepare(`SELECT sample_url FROM voices WHERE id = ? AND user_id = ?`)
    .get(id, USER) as { sample_url: string | null } | undefined;
  if (row?.sample_url) {
    await fs.promises.unlink(path.join(VOICE_SAMPLE_DIR, row.sample_url)).catch(() => {});
  }
  // Null out any agent references so the agent doesn't end up pointing at
  // a deleted voice id (UI then falls back to a Polly preset cleanly).
  db.prepare(`UPDATE agents SET voice_id = NULL, voice_name = NULL, tts_voice = NULL WHERE voice_id = ? AND user_id = ?`)
    .run(id, USER);
  db.prepare(`DELETE FROM voices WHERE id = ? AND user_id = ?`).run(id, USER);
  res.json({ ok: true });
});
