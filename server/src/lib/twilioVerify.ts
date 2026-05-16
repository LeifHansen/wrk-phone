import type { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { log } from './log.js';

// Rejects forged requests to Twilio webhooks. Twilio signs each callback with
// your auth token over the EXACT public URL it was configured with — so we
// rebuild that URL from PUBLIC_BASE_URL (the app sits behind a tunnel/proxy,
// so req.protocol/host can't be trusted).
//
// Escape hatch for local dev without a real public URL: TWILIO_SKIP_VALIDATION=1.
let warnedOnce = false;

export function twilioWebhook(req: Request, res: Response, next: NextFunction) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const skip = process.env.TWILIO_SKIP_VALIDATION === '1';

  if (skip || !token || /x{4,}|placeholder/i.test(token) || !base) {
    if (!warnedOnce) {
      warnedOnce = true;
      log.warn('twilioVerify', 'signature validation DISABLED (skip flag, missing token, or no PUBLIC_BASE_URL). Webhooks are unauthenticated.');
    }
    return next();
  }

  const signature = req.header('X-Twilio-Signature') || '';
  const url = `${base}${req.originalUrl}`;
  const valid = twilio.validateRequest(token, signature, url, req.body || {});
  if (!valid) {
    log.error('twilioVerify', 'REJECTED forged/invalid Twilio request', { path: req.originalUrl, ip: req.ip });
    return res.status(403).type('text/plain').send('invalid twilio signature');
  }
  next();
}
