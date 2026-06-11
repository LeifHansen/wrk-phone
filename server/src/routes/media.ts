import { Router, raw } from 'express';
import { db } from '../lib/db.js';
import { openai } from '../lib/openai.js';
import { getUserId } from '../lib/auth.js';
import { saveBytes, deleteByUrl, storageBackend, MEDIA_DIR } from '../lib/storage.js';

export const mediaRouter = Router();

// Re-export so index.ts can mount the static path it already serves.
export { MEDIA_DIR };

// Per-file caps. Images stay generous (10MB) since AI-generated PNGs can run
// 1–3MB; videos get a higher (50MB) cap appropriate for short MMS clips.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// `kind` semantics:
//   'generated' = AI-generated image (from /media/generate)
//   'upload'    = user-uploaded image
//   'video'     = user-uploaded short video clip (e.g. MMS attachment)
// Anything in the `media` table is "in the library" by definition. The
// `saveToLibrary` flag on the upload/generate endpoints controls whether
// the row is inserted at all — when false, the file is written to disk
// (so Twilio can fetch it for the immediate send) but no library row is
// created, so it won't appear on the Media Library page.

function recordInLibrary(userId: string, url: string, kind: 'generated' | 'upload' | 'video', prompt?: string): number {
  const r = db.prepare(
    `INSERT INTO media (user_id, url, prompt, kind, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(userId, url, prompt ?? null, kind, Date.now());
  return Number(r.lastInsertRowid);
}

// POST /api/media/generate  body: { prompt, size?, saveToLibrary? }
// AI image generation. Defaults saveToLibrary=true — toggle off when the
// user just wants a one-shot MMS image without polluting their library.
mediaRouter.post('/media/generate', async (req, res) => {
  const USER = getUserId(req);
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const size = ['1024x1024', '1024x1536', '1536x1024'].includes(req.body?.size) ? req.body.size : '1024x1024';
  const saveToLibrary = req.body?.saveToLibrary !== false;
  try {
    const result = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: size as any,
      n: 1,
    });
    const b64 = result.data?.[0]?.b64_json;
    let saved;
    if (b64) {
      saved = await saveBytes(Buffer.from(b64, 'base64'), 'png', 'image/png');
    } else if (result.data?.[0]?.url) {
      const r = await fetch(result.data[0].url);
      saved = await saveBytes(Buffer.from(await r.arrayBuffer()), 'png', 'image/png');
    } else {
      return res.status(502).json({ error: 'no image returned' });
    }
    const id = saveToLibrary ? recordInLibrary(USER, saved.url, 'generated', prompt) : null;
    res.json({ id, url: saved.url, prompt, savedToLibrary: !!id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function genImageUrl(prompt: string): Promise<string> {
  const result = await openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 });
  const b64 = result.data?.[0]?.b64_json;
  if (b64) return (await saveBytes(Buffer.from(b64, 'base64'), 'png', 'image/png')).url;
  if (result.data?.[0]?.url) {
    const r = await fetch(result.data[0].url);
    return (await saveBytes(Buffer.from(await r.arrayBuffer()), 'png', 'image/png')).url;
  }
  throw new Error('no image returned');
}

// Only allow assigning avatars that we hosted — prevents pointing the avatar
// at an arbitrary external URL (which would let users hotlink anything from
// here, or worse, attempt SSRF via the avatar field). Accepts both local
// (/media/<file>) and R2 (custom-domain) URLs.
function isOwnedMediaUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const looksLikeImage = /\.(png|jpe?g|gif|bmp|webp)$/i.test(u.pathname);
    if (!looksLikeImage) return false;
    if (u.pathname.startsWith('/media/')) return true;
    // R2 public base = whole pathname; trust that the bucket is ours by
    // matching the configured R2_PUBLIC_BASE host.
    const r2Base = (process.env.R2_PUBLIC_BASE || '').trim().replace(/\/$/, '');
    if (r2Base) {
      try { const rb = new URL(r2Base); if (u.host === rb.host) return true; } catch {}
    }
    return false;
  } catch {
    return false;
  }
}

mediaRouter.post('/media/avatar', async (req, res) => {
  const USER = getUserId(req);
  const kind = req.body?.kind === 'agent' ? 'agent' : 'account';
  const providedUrl = req.body?.url ? String(req.body.url) : '';
  try {
    if (providedUrl) {
      if (!isOwnedMediaUrl(providedUrl)) {
        return res.status(400).json({ error: 'avatar url must be an image we hosted (upload it first via /api/media/upload)' });
      }
      if (kind === 'agent') {
        const a = db.prepare(`SELECT id FROM agents WHERE id=? AND user_id=?`)
          .get(Number(req.body?.agentId), USER) as any;
        if (!a) return res.status(404).json({ error: 'agent not found' });
        db.prepare(`UPDATE agents SET avatar_url=? WHERE id=? AND user_id=?`).run(providedUrl, Number(req.body.agentId), USER);
      } else {
        db.prepare(`UPDATE app_settings SET avatar_url=?, updated_at=? WHERE user_id=?`).run(providedUrl, Date.now(), USER);
      }
      return res.json({ url: providedUrl });
    }
    let prompt = String(req.body?.prompt || '').trim();
    if (kind === 'agent') {
      const a = db.prepare(`SELECT name, persona, role FROM agents WHERE id=? AND user_id=?`)
        .get(Number(req.body?.agentId), USER) as any;
      if (!a) return res.status(404).json({ error: 'agent not found' });
      prompt = prompt ||
        `Bold flat-vector avatar icon, retro arcade sticker style, thick outline, cream background, for an AI assistant named "${a.name}" whose job is ${a.role || 'messaging'} with a ${a.persona || 'friendly'} personality. Centered, simple, no text.`;
      const url = await genImageUrl(prompt);
      db.prepare(`UPDATE agents SET avatar_url=? WHERE id=? AND user_id=?`).run(url, Number(req.body.agentId), USER);
      return res.json({ url });
    }
    prompt = prompt ||
      `Friendly bold flat-vector profile avatar, retro arcade sticker style, thick black outline, cream background, abstract person, no text.`;
    const url = await genImageUrl(prompt);
    db.prepare(`UPDATE app_settings SET avatar_url=?, updated_at=? WHERE user_id=?`).run(url, Date.now(), USER);
    res.json({ url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

mediaRouter.get('/account', (req, res) => {
  const USER = getUserId(req);
  const row = db.prepare(`SELECT avatar_url FROM app_settings WHERE user_id=?`).get(USER) as any;
  res.json({ avatarUrl: row?.avatar_url || null });
});

// POST /api/media/upload  body: { dataUrl, saveToLibrary? }
// Image upload via base64 data URL — used by the device photo picker.
// Keeps backward compatibility with the existing UI. For larger files OR
// videos, callers should use /api/media/upload-raw which streams bytes.
mediaRouter.post('/media/upload', async (req, res) => {
  const USER = getUserId(req);
  const dataUrl = String(req.body?.dataUrl || '');
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'expected an image data URL' });
  const ext = m[1].replace('jpeg', 'jpg');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'image too large (max 10MB)' });
  const saveToLibrary = req.body?.saveToLibrary !== false;
  const saved = await saveBytes(buf, ext, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  const id = saveToLibrary ? recordInLibrary(USER, saved.url, 'upload') : null;
  res.json({ id, url: saved.url, savedToLibrary: !!id });
});

// POST /api/media/upload-raw — bytes-in-body upload for images AND videos.
// Headers:
//   Content-Type: image/* | video/*
//   X-Save-To-Library: '1' (default) or '0'
// Strict mime allowlist — extension is derived ONLY from this map. An
// unknown / spoofed mime now returns 415 instead of being silently relabeled
// as `image/png` (which the previous fallback allowed and which let a video
// payload bypass the smaller image size cap).
const MIME_TO_EXT: Record<string, { ext: string; kind: 'upload' | 'video' }> = {
  'image/png':       { ext: 'png',  kind: 'upload' },
  'image/jpeg':      { ext: 'jpg',  kind: 'upload' },
  'image/jpg':       { ext: 'jpg',  kind: 'upload' },
  'image/webp':      { ext: 'webp', kind: 'upload' },
  'image/gif':       { ext: 'gif',  kind: 'upload' },
  'video/mp4':       { ext: 'mp4',  kind: 'video'  },
  'video/quicktime': { ext: 'mov',  kind: 'video'  },
  'video/webm':      { ext: 'webm', kind: 'video'  },
};

mediaRouter.post(
  '/media/upload-raw',
  raw({ type: ['image/*', 'video/*'], limit: MAX_VIDEO_BYTES }),
  async (req, res) => {
    const USER = getUserId(req);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'image or video body required' });
    }
    const mime = String(req.header('content-type') || '').toLowerCase().split(';')[0].trim();
    const meta = MIME_TO_EXT[mime];
    if (!meta) {
      return res.status(415).json({
        error: `unsupported content-type "${mime}". Use one of: ${Object.keys(MIME_TO_EXT).join(', ')}.`,
      });
    }
    // Per-kind size cap. Image upload caps at 10MB; video at 50MB.
    const cap = meta.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (req.body.length > cap) {
      return res.status(413).json({
        error: `${meta.kind} too large (max ${Math.round(cap / (1024 * 1024))}MB)`,
      });
    }
    const saved = await saveBytes(req.body as Buffer, meta.ext, mime);
    const saveToLibrary = req.header('x-save-to-library') !== '0';
    const id = saveToLibrary ? recordInLibrary(USER, saved.url, meta.kind) : null;
    res.json({ id, url: saved.url, savedToLibrary: !!id, kind: meta.kind });
  },
);

mediaRouter.get('/media', (req, res) => {
  const USER = getUserId(req);
  const kind = req.query.kind ? String(req.query.kind) : null;
  const sql = kind
    ? `SELECT id, url, prompt, kind, created_at FROM media WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 500`
    : `SELECT id, url, prompt, kind, created_at FROM media WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`;
  const rows = kind
    ? db.prepare(sql).all(USER, kind)
    : db.prepare(sql).all(USER);
  res.json({ items: rows, backend: storageBackend() });
});

mediaRouter.delete('/media/:id', async (req, res) => {
  const USER = getUserId(req);
  const row = db.prepare(`SELECT url FROM media WHERE id = ? AND user_id = ?`)
    .get(Number(req.params.id), USER) as any;
  if (row?.url) await deleteByUrl(row.url);
  db.prepare(`DELETE FROM media WHERE id = ? AND user_id = ?`).run(Number(req.params.id), USER);
  res.json({ ok: true });
});
