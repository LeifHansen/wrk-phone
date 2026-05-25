import { Router } from 'express';
import { twilioClient, twilioConfig } from '../lib/twilio.js';

export const diagRouter = Router();

// GET /api/_diag — validates live credentials WITHOUT returning any secret values.
diagRouter.get('/_diag', async (_req, res) => {
  const checks: Record<string, { ok: boolean; note: string }> = {};

  const present = (v?: string) =>
    !!v && !/x{4,}/i.test(v) && !/placeholder/i.test(v);

  checks.env = {
    ok:
      present(twilioConfig.accountSid) &&
      present(twilioConfig.apiKeySid) &&
      present(twilioConfig.apiKeySecret) &&
      present(twilioConfig.twimlAppSid) &&
      present(twilioConfig.defaultFrom),
    note: [
      present(twilioConfig.accountSid) ? 'accountSid✓' : 'accountSid✗',
      present(twilioConfig.apiKeySid) ? 'apiKey✓' : 'apiKey✗',
      present(twilioConfig.apiKeySecret) ? 'apiSecret✓' : 'apiSecret✗',
      present(twilioConfig.twimlAppSid) ? 'twimlApp✓' : 'twimlApp✗',
      present(twilioConfig.defaultFrom) ? 'fromNumber✓' : 'fromNumber✗',
      twilioConfig.messagingServiceSid ? 'msgService✓' : 'msgService(none)',
      process.env.OPENAI_API_KEY && !/placeholder/i.test(process.env.OPENAI_API_KEY) ? 'openai✓' : 'openai✗',
    ].join(' '),
  };

  try {
    const acct = await twilioClient.api.v2010.accounts(twilioConfig.accountSid).fetch();
    checks.account = { ok: acct.status === 'active', note: `status=${acct.status}` };
  } catch (e: any) {
    checks.account = { ok: false, note: `auth failed (${e.status || e.code || 'err'})` };
  }

  try {
    const nums = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: twilioConfig.defaultFrom, limit: 1 });
    checks.fromNumber = nums.length > 0
      ? { ok: true, note: `owned, voice=${(nums[0] as any).capabilities?.voice} sms=${(nums[0] as any).capabilities?.sms}` }
      : { ok: false, note: 'number not found on this account' };
  } catch (e: any) {
    checks.fromNumber = { ok: false, note: `lookup failed (${e.status || 'err'})` };
  }

  try {
    const app = await twilioClient.applications(twilioConfig.twimlAppSid).fetch();
    checks.twimlApp = { ok: !!app.sid, note: app.voiceUrl ? 'voiceUrl set' : 'voiceUrl EMPTY (set it!)' };
  } catch (e: any) {
    checks.twimlApp = { ok: false, note: `not found (${e.status || 'err'})` };
  }

  try {
    const { buildVoiceAccessToken } = await import('../lib/twilio.js');
    const jwt = buildVoiceAccessToken('demo', 'web');
    checks.voiceToken = { ok: jwt.split('.').length === 3, note: 'token minted' };
  } catch (e: any) {
    checks.voiceToken = { ok: false, note: `mint failed: ${String(e.message).slice(0, 60)}` };
  }

  // ── Stripe ──────────────────────────────────────────────────────────
  // Surface the exact state of the Stripe secret so you can tell at a
  // glance whether business-line / credits checkout will work. We never
  // return the key itself — just its prefix, length, and one of three
  // states: usable / placeholder / missing.
  const sk = process.env.STRIPE_SECRET_KEY || '';
  let stripeState: 'usable' | 'placeholder' | 'missing' | 'malformed' = 'missing';
  let stripeNote = '';
  if (!sk) {
    stripeState = 'missing';
    stripeNote = 'STRIPE_SECRET_KEY not set — checkout will fall back to dev/no-charge mode';
  } else if (!/^sk_(test|live)_/.test(sk)) {
    stripeState = 'malformed';
    stripeNote = `expected sk_test_ or sk_live_ prefix, got "${sk.slice(0, 8)}…"`;
  } else if (/x{6,}/i.test(sk) || /your[_-]?key|placeholder|stub/i.test(sk) || sk.length <= 30) {
    stripeState = 'placeholder';
    stripeNote = `value looks like a stub (prefix=${sk.slice(0, 8)}…, length=${sk.length}). Set a real key with: fly secrets set STRIPE_SECRET_KEY=sk_live_…`;
  } else {
    stripeState = 'usable';
    stripeNote = `prefix=${sk.slice(0, 8)}… length=${sk.length} — real Stripe checkout enabled`;
  }
  checks.stripe = { ok: stripeState === 'usable' || stripeState === 'missing', note: `${stripeState}: ${stripeNote}` };

  // Webhook secret check.
  const wh = process.env.STRIPE_WEBHOOK_SECRET || '';
  const whReal = /^whsec_/.test(wh) && !/x{6,}/i.test(wh) && wh.length > 20;
  checks.stripeWebhook = {
    ok: !wh || whReal,
    note: !wh ? 'not set (webhooks will be rejected in prod)' :
      whReal ? `prefix=${wh.slice(0, 6)}… length=${wh.length} — real` :
      `placeholder (length=${wh.length}). Set with: fly secrets set STRIPE_WEBHOOK_SECRET=whsec_…`,
  };

  // ── ElevenLabs voice cloning ────────────────────────────────────────
  const el = process.env.ELEVENLABS_API_KEY || '';
  checks.elevenlabs = {
    ok: !el || (el.length > 20 && !/x{6,}/i.test(el)),
    note: !el ? 'not set (voice cloning falls back to Polly preset)' :
      el.length > 20 && !/x{6,}/i.test(el) ? `prefix=${el.slice(0, 6)}… real voice cloning enabled` : 'placeholder value',
  };

  // ── R2 storage ──────────────────────────────────────────────────────
  const r2Set = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE);
  checks.r2 = {
    ok: true,
    note: r2Set ? `enabled (bucket=${process.env.R2_BUCKET})` : 'not configured (using local Fly volume)',
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({ allOk, checks });
});
