import { Router } from 'express';
import { buildVoiceAccessToken } from '../lib/twilio.js';
import { log } from '../lib/log.js';

export const tokenRouter = Router();

// POST /api/token  body: { identity, platform }
tokenRouter.post('/token', (req, res) => {
  const identity = (req.body?.identity as string) || process.env.DEMO_USER_ID || 'demo';
  const platform = (req.body?.platform as 'ios' | 'android' | 'web') || 'web';
  try {
    const jwt = buildVoiceAccessToken(identity, platform);
    log.info('token', 'minted voice token', { identity, platform });
    res.json({ token: jwt, identity, ttl: 3600 });
  } catch (err: any) {
    log.error('token', 'mint failed — outbound calls will not work', { identity, platform, error: err.message });
    res.status(500).json({ error: err.message });
  }
});
