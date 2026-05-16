import { Router } from 'express';
import { db } from '../lib/db.js';
import { twilioClient } from '../lib/twilio.js';
import { log } from '../lib/log.js';

export const analyticsRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';

// GET /api/analytics — message/delivery stats from Twilio (bounded to last 30d,
// sampled) + campaign + call stats from our DB.
analyticsRouter.get('/analytics', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const stats = {
    window: '30d',
    messages: { outbound: 0, inbound: 0, delivered: 0, failed: 0, sampled: 0 },
    calls: { total: 0, inbound: 0, outbound: 0, minutes: 0 },
    campaigns: [] as any[],
    note: '' as string,
  };

  try {
    const msgs = await twilioClient.messages.list({ dateSentAfter: since, limit: 500 });
    stats.messages.sampled = msgs.length;
    for (const m of msgs) {
      if (m.direction?.startsWith('outbound')) stats.messages.outbound++;
      else stats.messages.inbound++;
      if (m.status === 'delivered') stats.messages.delivered++;
      if (m.status === 'failed' || m.status === 'undelivered') stats.messages.failed++;
    }
    if (msgs.length === 500) stats.note = 'Showing the most recent 500 messages in the last 30 days.';
  } catch (e: any) {
    log.warn('analytics', 'twilio messages.list failed', e);
    stats.note = `Twilio message stats unavailable: ${e.message}`;
  }

  // Calls from our DB (logged via /voice/status).
  const calls = db.prepare(
    `SELECT direction, COUNT(*) n, COALESCE(SUM(duration_sec),0) secs
     FROM calls WHERE user_id=? AND started_at > ? GROUP BY direction`
  ).all(USER, Date.now() - 30 * 86400000) as any[];
  for (const c of calls) {
    stats.calls.total += c.n;
    stats.calls.minutes += Math.round(c.secs / 60);
    if (c.direction === 'in') stats.calls.inbound = c.n; else stats.calls.outbound = c.n;
  }

  // Campaign stats from our DB.
  stats.campaigns = db.prepare(
    `SELECT id, name, status, sent_count, total_count, channel, created_at
     FROM campaigns WHERE user_id=? ORDER BY created_at DESC LIMIT 20`
  ).all(USER);

  res.json(stats);
});
