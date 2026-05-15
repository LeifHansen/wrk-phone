import { Router } from 'express';
import OpenAI from 'openai';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';

export const mediaRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
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
