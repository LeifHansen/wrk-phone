import { Router } from 'express';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { getAppSettings, setActiveNumber, clearActiveNumber } from '../lib/db.js';
import { getUserId, OWNER_ID, requireSuperadmin } from '../lib/auth.js';
import {
  importToPool, poolStats, isTollFree, pickSharedTollfree, addPurchasedNumber,
  releaseNumber, numberForStripeSub, getDefaultNumber,
} from '../lib/numbers-store.js';
import { createPlanCheckout } from './billing.js';
import { refreshTfvStatuses } from '../lib/tollfree.js';
import { log } from '../lib/log.js';

export const numbersRouter = Router();

// The Messaging Service tied to the approved A2P 10DLC campaign — purchased
// local numbers join it so they send 10DLC traffic under that campaign. Falls
// back to the general Messaging Service until a dedicated campaign service is
// configured (set TWILIO_CAMPAIGN_MESSAGING_SERVICE_SID once the campaign is
// approved on Twilio).
function campaignMessagingServiceSid(): string | undefined {
  return process.env.TWILIO_CAMPAIGN_MESSAGING_SERVICE_SID
    || twilioConfig.messagingServiceSid
    || undefined;
}

function publicBase(): string {
  // .trim() guards against trailing whitespace in the env value (a stray
  // space turns "https://x.com" into "https://x.com /api/..." which Twilio
  // rejects as an invalid URL).
  return (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
}
function baseLooksReal(): boolean {
  const b = publicBase();
  return !!b && /^https:\/\//.test(b) && !/your-tunnel|localhost|127\.0\.0\.1|example\.com/i.test(b);
}

/**
 * Configure ALL webhooks for a number so inbound calls + SMS reach this server.
 * - Number's own Voice webhook  -> /api/voice/inbound
 * - Number's own SMS webhook    -> /api/sms/inbound  (fallback if not in a service)
 * - Messaging Service inbound   -> /api/sms/inbound  (authoritative when number
 *   is in a Messaging Service — which is how every Wrk number is provisioned)
 *
 * Returns the URLs it set + warnings so the caller can see exactly what happened.
 */
async function configureWebhooks(numberSid: string): Promise<{ urls: any; warnings: string[] }> {
  const base = publicBase();
  const warnings: string[] = [];
  if (!baseLooksReal()) {
    warnings.push(
      `PUBLIC_BASE_URL is "${base || '(empty)'}". Inbound calls/texts require a PUBLIC https URL Twilio can reach (ngrok in dev, or your deployed URL). Outbound still works; INBOUND WILL NOT until this is a real public URL. Set PUBLIC_BASE_URL, restart the server, and run Repair webhooks again.`
    );
  }
  const voiceUrl = `${base}/api/voice/inbound`;
  const smsUrl = `${base}/api/sms/inbound`;
  const statusCb = `${base}/api/voice/status`;
  const outboundUrl = `${base}/api/voice/outbound`;

  // 1. The number itself (voice + sms fallback)
  await twilioClient.incomingPhoneNumbers(numberSid).update({
    voiceUrl, voiceMethod: 'POST',
    smsUrl, smsMethod: 'POST',
    statusCallback: statusCb, statusCallbackMethod: 'POST',
  });

  // 1b. THE TWIML APP — this powers OUTBOUND softphone calls. The token's
  //     VoiceGrant.outgoingApplicationSid points here; if its Voice Request
  //     URL is blank, Twilio gets no TwiML and the call disconnects before
  //     it rings. This was the missing piece.
  if (twilioConfig.twimlAppSid) {
    try {
      await twilioClient.applications(twilioConfig.twimlAppSid).update({
        voiceUrl: outboundUrl,
        voiceMethod: 'POST',
        statusCallback: statusCb,
        statusCallbackMethod: 'POST',
      });
    } catch (e: any) {
      warnings.push(`TwiML App voice URL not set (outbound calls will fail): ${e.message}`);
    }
  } else {
    warnings.push('No TWILIO_TWIML_APP_SID — outbound softphone calls cannot be routed.');
  }

  // 2. The Messaging Service (authoritative inbound route for pooled numbers)
  if (twilioConfig.messagingServiceSid) {
    try {
      await twilioClient.messaging.v1.services(twilioConfig.messagingServiceSid).update({
        inboundRequestUrl: smsUrl,
        inboundMethod: 'POST',
        useInboundWebhookOnNumber: false,
      });
    } catch (e: any) {
      warnings.push(`Messaging Service inbound URL not set: ${e.message}`);
    }
  } else {
    warnings.push('No TWILIO_MESSAGING_SERVICE_SID — inbound SMS uses the number webhook only.');
  }

  return { urls: { voiceUrl, smsUrl, statusCb, outboundUrl }, warnings };
}

// GET /api/numbers/search — open to every account; buying is the paid step.
numbersRouter.get('/numbers/search', async (req, res) => {
  const country = String(req.query.country || 'US').toUpperCase();
  const areaCode = req.query.areaCode ? Number(req.query.areaCode) : undefined;
  const contains = req.query.contains ? String(req.query.contains) : undefined;
  try {
    const opts: any = { smsEnabled: true, voiceEnabled: true, mmsEnabled: true, limit: 20 };
    if (areaCode) opts.areaCode = areaCode;
    if (contains) opts.contains = contains;
    const list = await twilioClient.availablePhoneNumbers(country).local.list(opts);
    res.json(list.map((n) => ({
      phoneNumber: n.phoneNumber, friendlyName: n.friendlyName,
      locality: n.locality, region: n.region, capabilities: n.capabilities,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

/**
 * Buy a number on Twilio, join it to the marketing/campaign Messaging Service
 * (so it sends under the registered A2P campaign), wire every webhook, and
 * record ownership. Shared by the buy endpoints (no-Stripe dev path) and the
 * Stripe webhook (paid path — runs after checkout completes).
 *
 * If the exact number was snapped up while checkout was open, falls back to
 * the next available number in the same area code so a paid subscription
 * always yields a working line.
 */
export async function purchaseAndProvision(userId: string, phoneNumber: string, opts: {
  makeDefault: boolean;
  stripeSubId?: string | null;
  /** 0 for the account's included onboarding number; 200 (default) for paid
   *  $2/mo add-ons bought through Stripe. */
  monthlyCostCents?: number;
}): Promise<{ phoneNumber: string; sid: string; attachedToService: boolean; warnings: string[]; urls: any }> {
  let purchased;
  try {
    purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber, friendlyName: 'WrkPhn',
    });
  } catch (e: any) {
    const area = phoneNumber.match(/^\+1(\d{3})/)?.[1];
    if (!area) throw e;
    const alt = await twilioClient.availablePhoneNumbers('US').local.list({
      areaCode: Number(area), smsEnabled: true, voiceEnabled: true, limit: 1,
    });
    if (!alt[0]) throw e;
    purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber: alt[0].phoneNumber, friendlyName: 'WrkPhn',
    });
    log.warn('numbers/provision', `${phoneNumber} was taken — purchased ${purchased.phoneNumber} from the same area code instead`);
  }

  // Join the marketing Messaging Service so traffic sends under the
  // registered A2P campaign.
  const msSid = campaignMessagingServiceSid();
  let attachedToService = false;
  if (msSid) {
    try {
      await twilioClient.messaging.v1.services(msSid)
        .phoneNumbers.create({ phoneNumberSid: purchased.sid });
      attachedToService = true;
    } catch (e: any) {
      log.warn('numbers/provision', `messaging-service attach failed for ${purchased.phoneNumber}`, e);
    }
  }

  // Auto-configure every webhook so inbound works immediately.
  const { urls, warnings } = await configureWebhooks(purchased.sid);

  // Record exclusive ownership (resolveInboundOwner routes inbound to this
  // account) and optionally make it the buyer's sending line.
  addPurchasedNumber(userId, {
    phone: purchased.phoneNumber, twilioSid: purchased.sid, type: 'local',
    monthlyCostCents: opts.monthlyCostCents ?? 200, activationPaid: true,
    makeDefault: opts.makeDefault,
    stripeSubId: opts.stripeSubId ?? null,
  });
  if (opts.makeDefault) setActiveNumber(userId, purchased.phoneNumber, purchased.sid);
  return { phoneNumber: purchased.phoneNumber, sid: purchased.sid, attachedToService, warnings, urls };
}

/**
 * Cancel → release (Stripe webhook). Releases the number bought under a
 * canceled subscription: removes it from Twilio (stops the $/mo passthrough),
 * marks it released in the DB, and drops the owner back to the shared
 * default line if it was their active sender.
 */
export async function releaseNumberForStripeSub(stripeSubId: string): Promise<void> {
  const row = numberForStripeSub(stripeSubId);
  if (!row || row.status === 'released') return;
  try {
    if (row.twilio_sid) await twilioClient.incomingPhoneNumbers(row.twilio_sid).remove();
  } catch (e: any) {
    log.warn('numbers/release', `Twilio release failed for ${row.phone} — releasing in DB anyway`, e);
  }
  releaseNumber(row.id);
  if (row.user_id) {
    const s = getAppSettings(row.user_id);
    if (s.active_number === row.phone) clearActiveNumber(row.user_id);
  }
  log.info('numbers/release', `released ${row.phone} after subscription cancel`);
}

// POST /api/numbers/provision-onboarding { areaCode }
// Onboarding auto-provision: buy the first available local number in the
// chosen area code, join it to the platform's approved A2P campaign, wire
// webhooks, and make it the account's sending line — included with the
// account, no checkout. Idempotent: an account that already owns an active
// LOCAL number keeps it (a pool toll-free default doesn't block this —
// the user explicitly asked for a local line, which becomes the default).
numbersRouter.post('/numbers/provision-onboarding', async (req, res) => {
  const userId = getUserId(req);
  const areaCode = String(req.body?.areaCode || '').trim();
  if (!/^[2-9]\d{2}$/.test(areaCode)) {
    return res.status(400).json({ error: 'Enter a 3-digit US area code (e.g. 415).' });
  }
  try {
    const existing = getDefaultNumber(userId);
    if (existing && existing.type === 'local') {
      return res.json({ ok: true, number: existing.phone, sid: existing.twilio_sid, alreadyHad: true });
    }
    const avail = await twilioClient.availablePhoneNumbers('US').local.list({
      areaCode: Number(areaCode), smsEnabled: true, voiceEnabled: true, limit: 1,
    });
    if (!avail[0]) {
      return res.status(404).json({ error: `No numbers available in ${areaCode} right now — try a nearby area code.` });
    }
    const r = await purchaseAndProvision(userId, avail[0].phoneNumber, {
      makeDefault: true,
      monthlyCostCents: 0,   // included with the account — not a paid add-on
    });
    log.info('numbers/onboarding', `provisioned ${r.phoneNumber} (area ${areaCode}) for ${userId}`);
    res.json({ ok: true, number: r.phoneNumber, sid: r.sid, attachedToService: r.attachedToService, warnings: r.warnings });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// POST /api/numbers/buy { phoneNumber }
// Starts a dedicated-number purchase ($2 activation + $2/mo). With Stripe
// configured this returns a checkout URL — the number is bought, joined to
// the marketing campaign's Messaging Service, and made the account's sending
// line by the webhook once payment completes. Without Stripe (dev) it
// provisions immediately.
numbersRouter.post('/numbers/buy', async (req, res) => {
  const userId = getUserId(req);
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!/^\+1\d{10}$/.test(phoneNumber)) return res.status(400).json({ error: 'phoneNumber required (E.164 US, e.g. +12065551234)' });
  try {
    const checkout = await createPlanCheckout({
      userId, planId: 'number', ref: phoneNumber,
      successPath: '/numbers?purchase=success', cancelPath: '/numbers?purchase=canceled',
      metadata: { makeDefault: '1' },
    });
    if (!checkout.stub) return res.json({ ok: true, url: checkout.url });

    // Dev / no-Stripe path: no checkout to wait on — provision right away.
    const r = await purchaseAndProvision(userId, phoneNumber, { makeDefault: true });
    res.json({
      ok: true, number: r.phoneNumber, sid: r.sid,
      attachedToService: r.attachedToService,
      messagingServiceSid: campaignMessagingServiceSid() || null,
      webhooks: r.urls, warnings: r.warnings, note: checkout.note,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// POST /api/numbers/repair-webhooks — fix inbound for the CURRENT active number
// (use this when a number was set up before auto-config, or PUBLIC_BASE_URL changed).
//
// We always re-resolve the SID via Twilio rather than trusting the DB: the
// stored active_number_sid can drift (e.g. a number released + repurchased
// gets a fresh SID) and the only failure mode of trusting it is the whole
// repair endpoint blowing up with a Twilio 400, which is exactly what this
// function exists to PREVENT.
numbersRouter.post('/numbers/repair-webhooks', async (req, res) => {
  try {
    const s = getAppSettings(getUserId(req));
    const num = s.active_number || twilioConfig.defaultFrom;
    if (!num) return res.status(400).json({ error: 'No active number found to repair. Buy/select a number first.' });
    const found = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: num, limit: 1 });
    if (!found.length) {
      return res.status(404).json({ error: `Twilio doesn't have ${num} on this account — buy it first or pick a different active number.` });
    }
    const sid = found[0].sid;
    if (sid !== s.active_number_sid) setActiveNumber(getUserId(req), num, sid);
    const { urls, warnings } = await configureWebhooks(sid);
    res.json({ ok: true, number: num, sid, webhooks: urls, warnings });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// POST /api/numbers/repair-all-webhooks — (re)configure voice + SMS webhooks
// for EVERY phone number on the Twilio account, not just the active one.
// Idempotent. Use after a PUBLIC_BASE_URL change, an account migration, or to
// fix numbers provisioned before auto-config existed.
numbersRouter.post('/numbers/repair-all-webhooks', async (_req, res) => {
  try {
    const all = await twilioClient.incomingPhoneNumbers.list({ limit: 1000 });
    const numbers: any[] = [];
    for (const n of all) {
      try {
        const { warnings } = await configureWebhooks(n.sid);
        numbers.push({ number: n.phoneNumber, sid: n.sid, ok: true, warnings });
      } catch (e: any) {
        numbers.push({ number: n.phoneNumber, sid: n.sid, ok: false, error: e.message });
      }
    }
    const configured = numbers.filter((n) => n.ok).length;
    res.json({ ok: configured === numbers.length, configured, total: numbers.length, numbers });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// GET /api/numbers/webhook-status — what Twilio currently has vs what we expect
numbersRouter.get('/numbers/webhook-status', async (req, res) => {
  try {
    const s = getAppSettings(getUserId(req));
    const num = s.active_number || twilioConfig.defaultFrom;
    // Always re-resolve via Twilio so a stale DB SID doesn't 500 this status
    // probe (which is the one tool the operator uses to diagnose drift).
    let sid: string | null = null;
    if (num) {
      const found = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: num, limit: 1 });
      sid = found[0]?.sid || null;
      if (sid && sid !== s.active_number_sid) setActiveNumber(getUserId(req), num, sid);
    }
    const base = publicBase();
    const expected = { voiceUrl: `${base}/api/voice/inbound`, smsInbound: `${base}/api/sms/inbound` };
    let numberCfg: any = null;
    if (sid) {
      const n = await twilioClient.incomingPhoneNumbers(sid).fetch();
      numberCfg = { voiceUrl: n.voiceUrl, smsUrl: n.smsUrl };
    }
    let serviceCfg: any = null;
    if (twilioConfig.messagingServiceSid) {
      const svc = await twilioClient.messaging.v1.services(twilioConfig.messagingServiceSid).fetch();
      serviceCfg = { inboundRequestUrl: svc.inboundRequestUrl, useInboundWebhookOnNumber: svc.useInboundWebhookOnNumber };
    }
    let twimlAppCfg: any = null;
    if (twilioConfig.twimlAppSid) {
      const app = await twilioClient.applications(twilioConfig.twimlAppSid).fetch();
      twimlAppCfg = { voiceUrl: app.voiceUrl };
    }
    const expectedOutbound = `${base}/api/voice/outbound`;
    const reachable = baseLooksReal();
    const inboundOk = reachable && serviceCfg?.inboundRequestUrl === expected.smsInbound;
    const outboundOk = reachable && twimlAppCfg?.voiceUrl === expectedOutbound;
    res.json({
      number: num, publicBaseUrl: base, reachable,
      expected: { ...expected, outboundUrl: expectedOutbound },
      numberCfg, serviceCfg, twimlAppCfg,
      inboundOk, outboundOk,
      ok: inboundOk && outboundOk,
      hint: !reachable
        ? 'PUBLIC_BASE_URL is not a reachable https URL — calls/texts cannot work until it is.'
        : !outboundOk
          ? 'TwiML App voice URL not wired — outbound calls drop before ringing. Tap Repair.'
          : !inboundOk
            ? 'Inbound SMS route not wired — tap Repair.'
            : 'Routable. If a call still drops, check server logs for POST /api/voice/outbound.',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Assign a number to a user from the shared pool WITHOUT exposing the pool.
// We never show users the list of available numbers — they just get one.
// Numbers may be shared across accounts (that's acceptable for now); pool
// numbers already have webhooks/Messaging Service wired by OWNER, so we only
// need to point this user's app_settings at one.
async function claimPoolNumber(userId: string) {
  const s = getAppSettings(userId);
  if (s.active_number) {
    return { phoneNumber: s.active_number, sid: s.active_number_sid, alreadyHad: true };
  }
  // Preferred path: a shared toll-free from the account_numbers pool — the
  // intended model (every account gets a random toll-free, sharing allowed).
  const shared = pickSharedTollfree();
  if (shared) {
    setActiveNumber(userId, shared.phone, shared.twilioSid || '');
    if (shared.twilioSid) {
      try { await configureWebhooks(shared.twilioSid); }
      catch (e) { log.warn('claimPoolNumber', `webhook auto-config failed for ${shared.phone}`, e); }
    }
    return { phoneNumber: shared.phone, sid: shared.twilioSid, alreadyHad: false };
  }
  // Fallback: account_numbers pool not populated yet — scan Twilio directly.
  const pool = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });
  if (!pool.length) throw new Error('No numbers in the shared pool yet. An admin must add one to the Twilio account.');
  // Prefer SMS-capable numbers; spread users across the pool with a random pick.
  const usable = pool.filter((n) => n.capabilities?.sms !== false);
  const chosen = (usable.length ? usable : pool)[Math.floor(Math.random() * (usable.length ? usable.length : pool.length))];
  setActiveNumber(userId, chosen.phoneNumber, chosen.sid);
  // Ensure the assigned number actually routes to this server. Pool numbers
  // are SUPPOSED to be pre-wired, but that assumption has bitten us before
  // (numbers left sitting on Twilio's demo webhooks). configureWebhooks is
  // idempotent; run it best-effort so a webhook hiccup never blocks signup.
  try {
    await configureWebhooks(chosen.sid);
  } catch (e) {
    log.warn('claimPoolNumber', `webhook auto-config failed for ${chosen.phoneNumber}`, e);
  }
  return { phoneNumber: chosen.phoneNumber, sid: chosen.sid, alreadyHad: false };
}

// POST /api/numbers/claim — idempotently give the caller a pool number.
// Called on signup and as a safety net from Setup. No pool is ever returned.
numbersRouter.post('/numbers/claim', async (req, res) => {
  try {
    const r = await claimPoolNumber(getUserId(req));
    res.json({ ok: true, number: r.phoneNumber, sid: r.sid, alreadyHad: r.alreadyHad });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/numbers/active — read-only. A pool number is assigned explicitly
// at signup (and as a Setup safety net), not here, so anonymous visitors
// still see the marketing page instead of silently consuming a number.
numbersRouter.get('/numbers/active', (req, res) => {
  const s = getAppSettings(getUserId(req));
  res.json({
    activeNumber: s.active_number || process.env.TWILIO_DEFAULT_FROM_NUMBER || null,
    activeNumberSid: s.active_number_sid || null,
    onboarded: !!s.onboarded,
    isProvisioned: !!s.active_number,
    messagingServiceSid: twilioConfig.messagingServiceSid || null,
  });
});

// GET /api/numbers/list — ONLY the caller's own line. The shared pool is
// never exposed to users; they get one auto-assigned number until they
// provision their own (onboarding area-code pick or a paid $2/mo add-on).
numbersRouter.get('/numbers/list', async (req, res) => {
  try {
    const userId = getUserId(req);
    let s = getAppSettings(userId);
    if (!s.active_number) {
      try { await claimPoolNumber(userId); s = getAppSettings(userId); }
      catch { /* pool empty — return no numbers */ }
    }
    const numbers: any[] = [];
    if (s.active_number) {
      let capabilities: any = { sms: true, voice: true, mms: true };
      try {
        if (s.active_number_sid) {
          const n = await twilioClient.incomingPhoneNumbers(s.active_number_sid).fetch();
          capabilities = n.capabilities;
        }
      } catch { /* keep optimistic defaults */ }
      numbers.push({
        sid: s.active_number_sid,
        phoneNumber: s.active_number,
        friendlyName: 'Your line',
        capabilities,
        isActive: true,
      });
    }
    res.json({ active: s.active_number || null, pricePerMonth: 2.0, numbers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/numbers/set-active  { sid }
numbersRouter.post('/numbers/set-active', async (req: any, res) => {
  const USER = getUserId(req);
  try {
    const sid = String(req.body?.sid || '');
    const n = await twilioClient.incomingPhoneNumbers(sid).fetch();
    setActiveNumber(USER, n.phoneNumber, n.sid);
    res.json({ ok: true, active: n.phoneNumber });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/numbers/buy-additional  { phoneNumber }
// Same provisioning as the primary, but does NOT change the active line.
// $2/mo recurring (billing wired later — see Stripe note in README).
numbersRouter.post('/numbers/buy-additional', async (req, res) => {
  const userId = getUserId(req);
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!/^\+1\d{10}$/.test(phoneNumber)) return res.status(400).json({ error: 'phoneNumber required (E.164 US, e.g. +12065551234)' });
  try {
    const checkout = await createPlanCheckout({
      userId, planId: 'number', ref: phoneNumber,
      successPath: '/numbers?purchase=success', cancelPath: '/numbers?purchase=canceled',
      metadata: { makeDefault: '0' },
    });
    if (!checkout.stub) return res.json({ ok: true, url: checkout.url });

    // Dev / no-Stripe path. Recorded as an owned number, but does NOT become
    // the active line.
    const r = await purchaseAndProvision(userId, phoneNumber, { makeDefault: false });
    res.json({ ok: true, number: r.phoneNumber, sid: r.sid, monthly: 2.0, warnings: r.warnings, note: checkout.note });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// ── Toll-free pool administration (superadmin) ───────────────────────────────
// The pool = toll-free numbers already on the Twilio account. New accounts are
// each assigned one at random at signup (Phase 2). These endpoints sync and
// inspect the pool; they are NOT gated by NUMBER_PURCHASE_ENABLED.

// POST /api/numbers/pool/import — discover toll-free numbers on the Twilio
// account and register any not yet tracked as unassigned pool inventory.
numbersRouter.post('/numbers/pool/import', requireSuperadmin, async (_req, res) => {
  try {
    const all = await twilioClient.incomingPhoneNumbers.list({ limit: 1000 });
    const tollfree = all
      .filter((n) => isTollFree(n.phoneNumber))
      .map((n) => ({ phone: n.phoneNumber, twilioSid: n.sid, type: 'tollfree' as const }));
    const { added, skipped } = importToPool(tollfree);
    // Wire webhooks the moment a number joins the pool, so it's never handed
    // to a user still pointing at Twilio's default/demo webhooks.
    let configured = 0;
    for (const n of tollfree) {
      try { await configureWebhooks(n.twilioSid); configured++; }
      catch (e) { log.warn('pool/import', `webhook config failed for ${n.phone}`, e); }
    }
    res.json({ ok: true, discovered: tollfree.length, added, skipped, webhooksConfigured: configured, stats: poolStats() });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// GET /api/numbers/pool/stats — pool inventory summary.
numbersRouter.get('/numbers/pool/stats', requireSuperadmin, (_req, res) => {
  res.json(poolStats());
});

// POST /api/numbers/pool/refresh-tfv — pull the latest Toll-Free Verification
// status from Twilio onto every tracked toll-free number.
numbersRouter.post('/numbers/pool/refresh-tfv', requireSuperadmin, async (_req, res) => {
  try {
    const updated = await refreshTfvStatuses();
    res.json({ ok: true, updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Twilio account migration (superadmin) ────────────────────────────────────

// GET /api/numbers/account-info — confirm WHICH Twilio account + messaging
// service the server is wired to. Read-only. Run this before any bulk webhook
// or number change to verify the env points at the intended account.
numbersRouter.get('/numbers/account-info', requireSuperadmin, async (_req, res) => {
  try {
    const acct = await twilioClient.api.v2010.accounts(twilioConfig.accountSid).fetch();
    let messagingService: { sid: string; friendlyName?: string; error?: string } | null = null;
    if (twilioConfig.messagingServiceSid) {
      try {
        const svc = await twilioClient.messaging.v1.services(twilioConfig.messagingServiceSid).fetch();
        messagingService = { sid: svc.sid, friendlyName: svc.friendlyName };
      } catch (e: any) {
        messagingService = { sid: twilioConfig.messagingServiceSid, error: e.message };
      }
    }
    const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 1000 });
    res.json({
      accountSid: acct.sid,
      accountName: acct.friendlyName,
      accountStatus: acct.status,
      messagingService,
      defaultFromNumber: twilioConfig.defaultFrom,
      publicBaseUrl: publicBase(),
      incomingNumberCount: numbers.length,
      numbers: numbers.map((n) => ({ phoneNumber: n.phoneNumber, sid: n.sid })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// POST /api/numbers/configure-all-webhooks — set voice/SMS/status webhooks on
// EVERY number on the account (and, per number, the TwiML app + Messaging
// Service inbound URL). Use after moving to a new Twilio account or changing
// PUBLIC_BASE_URL. Idempotent; safe to re-run.
numbersRouter.post('/numbers/configure-all-webhooks', requireSuperadmin, async (_req, res) => {
  try {
    const all = await twilioClient.incomingPhoneNumbers.list({ limit: 1000 });
    const results: Array<{ number: string; sid: string; ok: boolean; warnings?: string[]; error?: string }> = [];
    for (const n of all) {
      try {
        const { warnings } = await configureWebhooks(n.sid);
        results.push({ number: n.phoneNumber, sid: n.sid, ok: true, warnings });
      } catch (e: any) {
        results.push({ number: n.phoneNumber, sid: n.sid, ok: false, error: e.message });
      }
    }
    const configured = results.filter((r) => r.ok).length;
    res.json({ ok: true, total: all.length, configured, failed: all.length - configured, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// POST /api/numbers/attach-to-service { sid? , phoneNumber? } — add a number
// that already lives on THIS account to the configured Messaging Service.
// It cannot move a number that belongs to a different Twilio account — that
// transfer must happen first (Twilio Console / port process).
numbersRouter.post('/numbers/attach-to-service', requireSuperadmin, async (req, res) => {
  if (!twilioConfig.messagingServiceSid) {
    return res.status(400).json({ error: 'No TWILIO_MESSAGING_SERVICE_SID is configured.' });
  }
  try {
    let sid = String(req.body?.sid || '').trim();
    const phoneNumber = String(req.body?.phoneNumber || '').trim();
    if (!sid && phoneNumber) {
      const found = await twilioClient.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
      sid = found[0]?.sid || '';
    }
    if (!sid) {
      return res.status(400).json({ error: 'Provide an sid, or a phoneNumber that exists on this account.' });
    }
    const attached = await twilioClient.messaging.v1
      .services(twilioConfig.messagingServiceSid)
      .phoneNumbers.create({ phoneNumberSid: sid });
    res.json({ ok: true, sid: attached.sid, messagingServiceSid: twilioConfig.messagingServiceSid });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});
