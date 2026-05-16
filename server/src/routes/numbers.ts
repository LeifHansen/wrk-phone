import { Router } from 'express';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { getAppSettings, setActiveNumber } from '../lib/db.js';
import { getUserId, OWNER_ID } from '../lib/auth.js';

export const numbersRouter = Router();

// Number purchasing is locked until the 10DLC registration flow is built.
// Until then everyone shares the existing pool on the main Twilio account
// and just selects/swaps which pool number is their sending line.
const PURCHASE_ENABLED = process.env.NUMBER_PURCHASE_ENABLED === '1';
const purchaseLocked = (_req: any, res: any) =>
  res.status(403).json({ error: 'Buying numbers is disabled until 10DLC registration is set up. Pick a number from the shared pool instead.' });
// Shared pool model: numbers live on the one Twilio account/Messaging Service
// (OWNER). Each user *selects* one from the pool as their own outbound line
// (per-user, app_settings keyed by req.userId). Webhook/infra stays OWNER.

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
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

// GET /api/numbers/search
numbersRouter.get('/numbers/search', async (req, res) => {
  if (!PURCHASE_ENABLED) return purchaseLocked(req, res);
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

// POST /api/numbers/buy { phoneNumber }
numbersRouter.post('/numbers/buy', async (req, res) => {
  if (!PURCHASE_ENABLED) return purchaseLocked(req, res);
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });
  try {
    const purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber, friendlyName: 'Wrk Phone',
    });

    let attachedToService = false;
    if (twilioConfig.messagingServiceSid) {
      try {
        await twilioClient.messaging.v1
          .services(twilioConfig.messagingServiceSid)
          .phoneNumbers.create({ phoneNumberSid: purchased.sid });
        attachedToService = true;
      } catch (e: any) {
        // non-fatal (already attached / sender pool rules)
      }
    }

    // Auto-configure every webhook so inbound works immediately.
    const { urls, warnings } = await configureWebhooks(purchased.sid);

    setActiveNumber(OWNER_ID, purchased.phoneNumber, purchased.sid);
    res.json({
      ok: true, number: purchased.phoneNumber, sid: purchased.sid,
      attachedToService, messagingServiceSid: twilioConfig.messagingServiceSid || null,
      webhooks: urls, warnings,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// POST /api/numbers/repair-webhooks — fix inbound for the CURRENT active number
// (use this when a number was set up before auto-config, or PUBLIC_BASE_URL changed).
numbersRouter.post('/numbers/repair-webhooks', async (_req, res) => {
  try {
    const s = getAppSettings(OWNER_ID);
    let sid = s.active_number_sid;
    const num = s.active_number || twilioConfig.defaultFrom;
    if (!sid && num) {
      const found = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: num, limit: 1 });
      if (found.length) {
        sid = found[0].sid;
        setActiveNumber(OWNER_ID, num, sid);
      }
    }
    if (!sid) return res.status(400).json({ error: 'No active number found to repair. Buy/select a number first.' });
    const { urls, warnings } = await configureWebhooks(sid);
    res.json({ ok: true, number: num, webhooks: urls, warnings });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// GET /api/numbers/webhook-status — what Twilio currently has vs what we expect
numbersRouter.get('/numbers/webhook-status', async (_req, res) => {
  try {
    const s = getAppSettings(OWNER_ID);
    const num = s.active_number || twilioConfig.defaultFrom;
    let sid = s.active_number_sid;
    if (!sid && num) {
      const found = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: num, limit: 1 });
      sid = found[0]?.sid || null;
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

// GET /api/numbers/active
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

// GET /api/numbers/list — every number owned on the account (for the
// "Manage / add numbers" screen). Marks which one is active.
numbersRouter.get('/numbers/list', async (req, res) => {
  try {
    const s = getAppSettings(getUserId(req));
    const nums = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });
    res.json({
      active: s.active_number || twilioConfig.defaultFrom || null,
      pricePerMonth: 2.0,
      numbers: nums.map((n) => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities,
        isActive: n.phoneNumber === (s.active_number || twilioConfig.defaultFrom),
      })),
    });
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
  if (!PURCHASE_ENABLED) return purchaseLocked(req, res);
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });
  try {
    const purchased = await twilioClient.incomingPhoneNumbers.create({ phoneNumber, friendlyName: 'Wrk Phone' });
    if (twilioConfig.messagingServiceSid) {
      try {
        await twilioClient.messaging.v1.services(twilioConfig.messagingServiceSid)
          .phoneNumbers.create({ phoneNumberSid: purchased.sid });
      } catch { /* non-fatal */ }
    }
    const { warnings } = await configureWebhooks(purchased.sid);
    // Joins the shared pool/campaign AND becomes the buyer's selected line.
    setActiveNumber(getUserId(req), purchased.phoneNumber, purchased.sid);
    res.json({ ok: true, number: purchased.phoneNumber, sid: purchased.sid, monthly: 2.0, warnings });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});
