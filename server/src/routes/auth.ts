import { Router } from 'express';
import { createUser, findUser, verifyPassword, newSession, dropSession, getUserId } from '../lib/auth.js';
import { db, setActiveNumber } from '../lib/db.js';
import { pickSharedTollfree } from '../lib/numbers-store.js';
import { log } from '../lib/log.js';

export const authRouter = Router();

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

authRouter.post('/auth/signup', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!emailOk(email)) return res.status(400).json({ error: 'valid email required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  if (findUser(email)) return res.status(409).json({ error: 'an account with that email already exists' });
  try {
    const u = createUser(email, password);
    // Assign a shared toll-free number from the pool so the account can send
    // immediately. Best-effort — number assignment must never fail signup;
    // /numbers/claim is the safety net if the pool is empty at this moment.
    try {
      const tf = pickSharedTollfree();
      if (tf) setActiveNumber(u.id, tf.phone, tf.twilioSid || '');
    } catch (e) {
      log.warn('auth', 'toll-free auto-assign at signup failed', e);
    }
    const token = newSession(u.id);
    log.info('auth', 'signup', { email });
    res.json({ token, email });
  } catch (e: any) {
    log.error('auth', 'signup failed', e);
    res.status(500).json({ error: e.message });
  }
});

authRouter.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const u = findUser(email);
  if (!u || !verifyPassword(password, u.password_hash)) {
    return res.status(401).json({ error: 'invalid email or password' });
  }
  res.json({ token: newSession(u.id), email: u.email });
});

authRouter.get('/auth/me', (req, res) => {
  const uid = getUserId(req);
  const u = db.prepare(`SELECT email FROM users WHERE id = ?`).get(uid) as any;
  res.json({ userId: uid, email: u?.email || null, authenticated: !!u });
});

authRouter.post('/auth/logout', (req, res) => {
  const bearer = (req.header('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) dropSession(bearer);
  res.json({ ok: true });
});
