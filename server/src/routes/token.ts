import { Router } from 'express';
import { buildVoiceAccessToken } from '../lib/twilio.js';

export const tokenRouter = Router();

// POST /api/token  body: { identity, platform }
tokenRouter.post('/token', (req, res) => {
  const identity = (req.body?.identity as string) || process.env.DEMO_USER_ID || 'demo';
  const platform = (req.body?.platform as 'ios' | 'android' | 'web') || 'web';
  try {
    const jwt = buildVoiceAccessToken(identity, platform);
    res.json({ token: jwt, identity, ttl: 3600 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
