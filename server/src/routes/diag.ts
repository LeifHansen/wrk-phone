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

// GET /api/_diag/twilio-repair — emergency one-shot for "I fucked up
// my Twilio creds in Fly and now nothing works."
//
// 1. Lists every phone number owned by the active Twilio account
//    (so the user knows what to set TWILIO_DEFAULT_FROM_NUMBER to)
// 2. Lists every TwiML App
// 3. If NO TwiML App exists, CREATES one pointing at PUBLIC_BASE_URL
//    (so TWILIO_TWIML_APP_SID gets a fresh, valid value)
// 4. Returns the exact `fly secrets set` commands the user should run
//
// Read-only on the Twilio side except for the (idempotent) TwiML-app
// create-when-missing path. Safe to call repeatedly.
diagRouter.get('/_diag/twilio-repair', async (_req, res) => {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  try {
    // Verify auth works at all before doing anything else.
    await twilioClient.api.v2010.accounts(twilioConfig.accountSid).fetch();
  } catch (e: any) {
    return res.status(503).json({
      error: 'Cannot reach Twilio with current credentials.',
      detail: e.message,
      hint: 'Check TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET in Fly secrets.',
    });
  }

  let numbers: { phoneNumber: string; sid: string; voice: boolean; sms: boolean }[] = [];
  try {
    const list = await twilioClient.incomingPhoneNumbers.list({ limit: 1000 });
    numbers = list.map((n) => ({
      phoneNumber: n.phoneNumber,
      sid: n.sid,
      voice: !!(n as any).capabilities?.voice,
      sms: !!(n as any).capabilities?.sms,
    }));
  } catch (e: any) {
    return res.status(503).json({ error: `Could not list numbers: ${e.message}` });
  }

  let twimlApps: { sid: string; friendlyName: string; voiceUrl: string }[] = [];
  try {
    const apps = await twilioClient.applications.list({ limit: 100 });
    twimlApps = apps.map((a) => ({ sid: a.sid, friendlyName: a.friendlyName || '', voiceUrl: a.voiceUrl || '' }));
  } catch (e: any) {
    return res.status(503).json({ error: `Could not list TwiML apps: ${e.message}` });
  }

  // Auto-create a TwiML app if none exists OR none point at the current
  // PUBLIC_BASE_URL. Cheap, idempotent — one TwiML app costs nothing.
  let createdAppSid: string | null = null;
  const voiceUrl = base ? `${base}/api/voice/outbound` : '';
  const matching = twimlApps.find((a) => a.voiceUrl === voiceUrl);
  if (!matching && base) {
    try {
      const app = await twilioClient.applications.create({
        friendlyName: 'WrkPhn (auto-repair)',
        voiceUrl,
        voiceMethod: 'POST',
      });
      createdAppSid = app.sid;
      twimlApps.unshift({ sid: app.sid, friendlyName: app.friendlyName || '', voiceUrl: app.voiceUrl || '' });
    } catch (e: any) {
      return res.status(503).json({ error: `Could not create TwiML app: ${e.message}` });
    }
  }

  // Recommendations: prefer the first SMS+voice-capable number for default-
  // from, and the just-created (or matching) TwiML app.
  const recommendedNumber = numbers.find((n) => n.voice && n.sms) || numbers[0];
  const recommendedApp = matching || twimlApps[0];

  // Current state vs recommended.
  const fromNumberOk = !!recommendedNumber && twilioConfig.defaultFrom === recommendedNumber.phoneNumber;
  const twimlAppOk = !!recommendedApp && twilioConfig.twimlAppSid === recommendedApp.sid;

  const commands: string[] = [];
  if (recommendedNumber && !fromNumberOk) {
    commands.push(`fly secrets set TWILIO_DEFAULT_FROM_NUMBER=${recommendedNumber.phoneNumber} --app wrk-phone`);
  }
  if (recommendedApp && !twimlAppOk) {
    commands.push(`fly secrets set TWILIO_TWIML_APP_SID=${recommendedApp.sid} --app wrk-phone`);
  }
  if (commands.length > 1) {
    // Combine into a single deploy.
    const merged = commands
      .map((c) => c.replace(/^fly secrets set /, '').replace(/ --app wrk-phone$/, ''))
      .join(' ');
    commands.length = 0;
    commands.push(`fly secrets set ${merged} --app wrk-phone`);
  }

  res.json({
    publicBaseUrl: base || '(not set!)',
    current: {
      defaultFromNumber: twilioConfig.defaultFrom || null,
      twimlAppSid: twilioConfig.twimlAppSid || null,
      fromNumberOk,
      twimlAppOk,
    },
    recommended: {
      defaultFromNumber: recommendedNumber?.phoneNumber || null,
      twimlAppSid: recommendedApp?.sid || null,
      createdTwimlAppForYou: createdAppSid,
    },
    ownedNumbers: numbers,
    twimlApps,
    fixItCommands: commands,
    note: commands.length
      ? 'Run the command(s) above to fix the broken creds. Fly will redeploy automatically.'
      : 'Twilio creds look correct already. If something else is broken, share the exact error.',
  });
});
