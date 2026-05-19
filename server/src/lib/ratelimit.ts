import type { Request, Response, NextFunction } from 'express';
import { log } from './log.js';

// Tiny in-memory fixed-window rate limiter. Good enough for a single-instance
// deploy to stop runaway cost on the OpenAI/Twilio-backed endpoints (AI lint/
// optimize, prank redirect, diag, analytics). Not distributed — if we move to
// multi-instance, swap for a shared store.
export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = (req.ip || req.socket.remoteAddress || 'unknown');
    let e = hits.get(key);
    if (!e || now > e.reset) { e = { n: 0, reset: now + opts.windowMs }; hits.set(key, e); }
    e.n++;
    if (e.n > opts.max) {
      const retry = Math.ceil((e.reset - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      log.warn('ratelimit', `${opts.name} limit hit for ${key} (${e.n}/${opts.max})`);
      return res.status(429).json({ error: `Rate limit exceeded — retry in ${retry}s.` });
    }
    // Opportunistic GC so the map can't grow unbounded.
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    next();
  };
}
