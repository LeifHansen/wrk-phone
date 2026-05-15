import { Router } from 'express';
import { db } from '../lib/db.js';

export const pushRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';

// POST /api/push/register  body: { platform, token }
pushRouter.post('/push/register', (req, res) => {
  const platform = req.body.platform;
  const token = String(req.body.token || '');
  if (!['ios', 'android'].includes(platform) || !token) {
    return res.status(400).json({ error: 'platform + token required' });
  }
  db.prepare(
    `INSERT INTO push_tokens (user_id, platform, token) VALUES (?, ?, ?)
     ON CONFLICT(user_id, platform) DO UPDATE SET token = excluded.token`
  ).run(USER, platform, token);
  res.json({ ok: true });
});
