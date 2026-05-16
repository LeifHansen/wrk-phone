import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';

// The fixed owner account that telephony (Twilio webhooks, Stripe) is bound to.
// Per-user Twilio subaccounts are a separate, larger effort; until then all
// inbound calls/texts belong to this account.
export const OWNER_ID = process.env.DEMO_USER_ID || 'demo';

// When set, the UI requires a real login. Off by default so the existing
// single-user prototype + the live deploy keep working unchanged.
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === '1';

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, h] = stored.split(':');
  if (!salt || !h) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(test, 'hex'));
}

export function createUser(email: string, password: string): { id: string; email: string } {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, email.toLowerCase().trim(), hashPassword(password), Date.now());
  return { id, email };
}
export function findUser(email: string) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim()) as
    | { id: string; email: string; password_hash: string } | undefined;
}
export function newSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`)
    .run(token, userId, Date.now());
  return token;
}
export function dropSession(token: string) {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}
function userIdForToken(token?: string): string | null {
  if (!token) return null;
  const r = db.prepare(`SELECT user_id FROM sessions WHERE token = ?`).get(token) as any;
  return r?.user_id || null;
}

// Sets req.userId for every request. Bearer token → that user. No/invalid
// token → OWNER_ID (single-tenant fallback) unless AUTH_REQUIRED, in which
// case API calls (except auth/health/webhooks) get 401.
export function authContext(req: Request, res: Response, next: NextFunction) {
  const bearer = (req.header('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const uid = userIdForToken(bearer);
  (req as any).userId = uid || OWNER_ID;

  if (!AUTH_REQUIRED) return next();

  const p = req.path;
  const open = p.startsWith('/api/auth')
    || p === '/health'
    || p.startsWith('/api/voice')        // Twilio (signature-verified)
    || p === '/api/sms/inbound'
    || p === '/api/sms/status'
    || p === '/api/credits/webhook';     // Stripe (signature-verified)
  if (!uid && p.startsWith('/api') && !open) {
    return res.status(401).json({ error: 'authentication required' });
  }
  next();
}

export function getUserId(req: Request): string {
  return (req as any).userId || OWNER_ID;
}
