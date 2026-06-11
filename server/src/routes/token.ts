import { Router } from 'express';
import { buildVoiceAccessToken } from '../lib/twilio.js';
import { getUserId } from '../lib/auth.js';
import { log } from '../lib/log.js';

export const tokenRouter = Router();

// POST /api/token  body: { platform }
// Identity is ALWAYS the server-resolved account — never client input. A
// body-supplied identity would let any user mint a voice token for someone
// else's line once auth is on (they'd receive that account's calls).
tokenRouter.post('/token', (req, res) => {
  const identity = getUserId(req);
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
