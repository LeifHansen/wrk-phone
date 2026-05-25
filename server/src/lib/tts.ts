// ============================================================
// Text-to-speech synthesis — ElevenLabs path.
// ============================================================
// Twilio TwiML has two ways to make the line speak:
//   <Say voice="Polly.X">    → uses Twilio's built-in neural voices
//   <Play>URL_to_audio.mp3</Play> → plays a pre-rendered audio file
//
// For cloned voices (saved as tts_voice = "elevenlabs:<voice_id>") we have
// to pre-render via ElevenLabs and then <Play> the URL — Twilio doesn't
// natively support ElevenLabs voice IDs. This module is that bridge.
//
// Result caching: callers pass an optional `cacheKey` so the same text +
// voice synthesizes once. The cached URL lives in the `media` table with
// `kind='generated'` and `prompt` set to the cache key, so a row can be
// reused across calls / retries without re-billing ElevenLabs.

import { db } from './db.js';
import { saveBytes } from './storage.js';
import { log } from './log.js';

const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

/** True iff a tts_voice string is an ElevenLabs cloned voice id. */
export function isElevenLabsVoice(tts: string | null | undefined): tts is string {
  return !!tts && tts.startsWith('elevenlabs:');
}

// In-process dedupe of concurrent synth requests. Twilio frequently posts
// the TwiML webhook twice (AMD path), arriving 100ms apart — both miss the
// DB cache, both POST to ElevenLabs, both INSERT a media row, billing 2x
// and producing a duplicate library entry. Memoizing the in-flight promise
// per (user, cacheKey) collapses the race to ONE actual synth + one row.
// Entries are deleted when the promise settles, so this never leaks memory
// long-term.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Synthesize `text` in the given ElevenLabs voice and return a public
 * HTTPS URL Twilio can fetch. Caches the rendered MP3 in the media table
 * keyed by `cacheKey` so we don't re-bill ElevenLabs on retries.
 * Returns null when the ElevenLabs API key isn't set OR synthesis fails —
 * the caller MUST fall back to a Polly `<Say>` so the call still works.
 */
export async function synthesizeElevenLabs(
  text: string,
  voiceIdWithPrefix: string,                // "elevenlabs:abc123"
  userId: string,
  cacheKey: string,                          // unique per (voice, text)
): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  if (!isElevenLabsVoice(voiceIdWithPrefix)) return null;

  const voiceId = voiceIdWithPrefix.slice('elevenlabs:'.length);
  const prompt = `tts:${cacheKey}`;
  const key = `${userId}|${prompt}`;

  // Cache hit? Reuse the prior synthesis (same voice + same text rendered
  // earlier, e.g. on a Twilio webhook retry, or because the user is dialing
  // the same recipient twice).
  const cached = db.prepare(
    `SELECT url FROM media WHERE user_id = ? AND prompt = ? AND kind = 'generated' LIMIT 1`
  ).get(userId, prompt) as { url: string } | undefined;
  if (cached?.url) return cached.url;

  // Concurrent miss? Wait for the in-flight synthesis instead of starting
  // a duplicate one. The first request inserts the row; subsequent requests
  // either hit the DB cache above OR await this same promise.
  const flying = inFlight.get(key);
  if (flying) return flying;

  const job = (async (): Promise<string | null> => {
    try {
      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
        }),
      });
      if (!resp.ok) {
        log.warn('tts', `ElevenLabs synthesize failed: ${resp.status} ${await resp.text().catch(() => '')}`);
        return null;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      const saved = await saveBytes(buf, 'mp3', 'audio/mpeg');
      // Re-check the cache before insert — defensively guards against the
      // (very unlikely) case where a different process inserted between
      // our miss above and now. SQLite is single-writer so this is mostly
      // theoretical, but cheap.
      const recheck = db.prepare(
        `SELECT url FROM media WHERE user_id = ? AND prompt = ? AND kind = 'generated' LIMIT 1`
      ).get(userId, prompt) as { url: string } | undefined;
      if (recheck?.url) return recheck.url;
      db.prepare(
        `INSERT INTO media (user_id, url, prompt, kind, created_at) VALUES (?, ?, ?, 'generated', ?)`
      ).run(userId, saved.url, prompt, Date.now());
      return saved.url;
    } catch (e) {
      log.warn('tts', 'ElevenLabs synthesize threw', e);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}
