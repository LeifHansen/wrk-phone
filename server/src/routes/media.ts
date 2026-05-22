import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { openai } from '../lib/openai.js';
import { OWNER_ID as USER } from '../lib/auth.js';

export const mediaRouter = Router();

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
}

function saveBytes(buf: Buffer, ext = 'png'): { file: string; url: string } {
  const file = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, file), buf);
  return { file, url: `${publicBase()}/media/${file}` };
}

// POST /api/media/generate  body: { prompt, size? }
// Novelty: AI image generation for MMS campaigns. Saves to disk so Twilio can
// fetch it as MMS media (needs a public URL — set PUBLIC_BASE_URL).
mediaRouter.post('/media/generate', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const size = ['1024x1024', '1024x1536', '1536x1024'].includes(req.body?.size) ? req.body.size : '1024x1024';
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
      saved = saveBytes(Buffer.from(b64, 'base64'), 'png');
    } else if (result.data?.[0]?.url) {
      const r = await fetch(result.data[0].url);
      saved = saveBytes(Buffer.from(await r.arrayBuffer()), 'png');
    } else {
      return res.status(502).json({ error: 'no image returned' });
    }
    const row = db.prepare(
      `INSERT INTO media (user_id, url, prompt, kind, created_at) VALUES (?, ?, ?, 'generated', ?)`
    ).run(USER, saved.url, prompt, Date.now());
    res.json({ id: Number(row.lastInsertRowid), url: saved.url, prompt });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function genImageUrl(prompt: string): Promise<string> {
  const result = await openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 });
  const b64 = result.data?.[0]?.b64_json;
  if (b64) return saveBytes(Buffer.from(b64, 'base64'), 'png').url;
  if (result.data?.[0]?.url) {
    const r = await fetch(result.data[0].url);
    return saveBytes(Buffer.from(await r.arrayBuffer()), 'png').url;
  }
  throw new Error('no image returned');
}

// Only allow assigning avatars that we hosted — prevents pointing the avatar
// at an arbitrary external URL (which would let users hotlink anything from
// here, or worse, attempt SSRF via the avatar field).
function isOwnedMediaUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname.startsWith('/media/') && /\.(png|jpe?g|gif|bmp|webp)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

// Avatar set OR generate. body: { kind:'account'|'agent', agentId?, prompt?, url? }
// When `url` is provided (typically the result of a prior /media/upload),
// that image is assigned as-is and no OpenAI call is made. Otherwise an
// avatar is generated from the prompt (or a default prompt for the kind).
mediaRouter.post('/media/avatar', async (req, res) => {
  const kind = req.body?.kind === 'agent' ? 'agent' : 'account';
  const providedUrl = req.body?.url ? String(req.body.url) : '';
  try {
    if (providedUrl) {
      if (!isOwnedMediaUrl(providedUrl)) {
        return res.status(400).json({ error: 'avatar url must be a /media/ image we hosted (upload it first via /api/media/upload)' });
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

// GET /api/account — lightweight account profile (avatar).
mediaRouter.get('/account', (_req, res) => {
  const row = db.prepare(`SELECT avatar_url FROM app_settings WHERE user_id=?`).get(USER) as any;
  res.json({ avatarUrl: row?.avatar_url || null });
});

// POST /api/media/upload  body: { dataUrl }  (base64 data URL from device photos / picker)
mediaRouter.post('/media/upload', (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'expected an image data URL' });
  const ext = m[1].replace('jpeg', 'jpg');
  const saved = saveBytes(Buffer.from(m[2], 'base64'), ext);
  const row = db.prepare(
    `INSERT INTO media (user_id, url, prompt, kind, created_at) VALUES (?, ?, NULL, 'upload', ?)`
  ).run(USER, saved.url, Date.now());
  res.json({ id: Number(row.lastInsertRowid), url: saved.url });
});

mediaRouter.get('/media', (_req, res) => {
  res.json(db.prepare(`SELECT id, url, prompt, kind, created_at FROM media WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`).all(USER));
});

mediaRouter.delete('/media/:id', (req, res) => {
  const row = db.prepare(`SELECT url FROM media WHERE id = ? AND user_id = ?`).get(Number(req.params.id), USER) as any;
  if (row?.url) {
    const file = row.url.split('/media/')[1];
    if (file) { try { fs.unlinkSync(path.join(MEDIA_DIR, file)); } catch {} }
  }
  db.prepare(`DELETE FROM media WHERE id = ? AND user_id = ?`).run(Number(req.params.id), USER);
  res.json({ ok: true });
});

export { MEDIA_DIR };
