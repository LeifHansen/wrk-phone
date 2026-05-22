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

// Collects every public origin Twilio MIGHT be calling at. Twilio signs the
// EXACT URL configured in its console; if our PUBLIC_BASE_URL doesn't match
// that origin (e.g. configured at wrkphn.com but webhooks set to the raw
// *.fly.dev), every signature mismatches and the app silently 403s every
// inbound. The fix is to allow multiple accepted origins via:
//   PUBLIC_BASE_URL        — the canonical origin (used for URL-building)
//   PUBLIC_BASE_URL_EXTRA  — comma-separated list of additional accepted
//                            origins for signature validation only
// We try each candidate and pass on the first one that validates.
function acceptedBases(): string[] {
  const trim = (s: string) => s.trim().replace(/\/$/, '');
  const primary = trim(process.env.PUBLIC_BASE_URL || '');
  const extras = (process.env.PUBLIC_BASE_URL_EXTRA || '')
    .split(',')
    .map(trim)
    .filter(Boolean);
  const all = [primary, ...extras].filter(Boolean);
  // de-dupe, preserve order
  return Array.from(new Set(all));
}

export function twilioWebhook(req: Request, res: Response, next: NextFunction) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const bases = acceptedBases();
  const skip = process.env.TWILIO_SKIP_VALIDATION === '1';
  const isProd = process.env.NODE_ENV === 'production';
  const canValidate = token && !/x{4,}|placeholder/i.test(token) && bases.length > 0;

  if (skip || !canValidate) {
    // Fail CLOSED in production: an unvalidatable webhook there means anyone
    // can forge inbound SMS/voice and spend credits. Only the explicit
    // operator escape hatch (TWILIO_SKIP_VALIDATION=1) is honored in prod.
    if (isProd && !skip) {
      log.error('twilioVerify', 'REJECTED webhook — cannot validate signature in production (missing TWILIO_AUTH_TOKEN or PUBLIC_BASE_URL)', { path: req.originalUrl });
      return res.status(503).type('text/plain').send('webhook validation unavailable');
    }
    if (!warnedOnce) {
      warnedOnce = true;
      log.warn('twilioVerify', 'signature validation DISABLED (skip flag, missing token, or no PUBLIC_BASE_URL). Webhooks are unauthenticated — dev only.');
    }
    return next();
  }

  const signature = req.header('X-Twilio-Signature') || '';
  const body = req.body || {};
  const valid = bases.some((base) =>
    twilio.validateRequest(token, signature, `${base}${req.originalUrl}`, body)
  );
  if (!valid) {
    log.error('twilioVerify', 'REJECTED forged/invalid Twilio request', {
      path: req.originalUrl,
      ip: req.ip,
      tried: bases.length,
    });
    return res.status(403).type('text/plain').send('invalid twilio signature');
  }
  next();
}
