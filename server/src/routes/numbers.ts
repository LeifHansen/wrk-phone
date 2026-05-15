import { Router } from 'express';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { getAppSettings, setActiveNumber } from '../lib/db.js';

export const numbersRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';

function publicBase(): string {
  const b = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return b;
}
function baseLooksReal(): boolean {
  const b = publicBase();
  return !!b && !/your-tunnel|localhost|example\.com/i.test(b);
}

// GET /api/numbers/search?country=US&areaCode=415&contains=
// Returns available numbers (voice + SMS capable) to choose from.
numbersRouter.get('/numbers/search', async (req, res) => {
  const country = String(req.query.country || 'US').toUpperCase();
  const areaCode = req.query.areaCode ? Number(req.query.areaCode) : undefined;
  const contains = req.query.contains ? String(req.query.contains) : undefined;
  try {
    const opts: any = { smsEnabled: true, voiceEnabled: true, limit: 20 };
    if (areaCode) opts.areaCode = areaCode;
    if (contains) opts.contains = contains;
    const list = await twilioClient
      .availablePhoneNumbers(country)
      .local.list(opts);
    res.json(
      list.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        capabilities: n.capabilities,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// POST /api/numbers/buy  body: { phoneNumber }
// 1. Purchase the number on the account, wiring its Voice webhook to our server.
// 2. Attach it to the Messaging Service from the env (SMS routes via the service).
// 3. Ensure the Messaging Service inbound URL points at our server.
// 4. Persist as the user's active number.
numbersRouter.post('/numbers/buy', async (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });

  const base = publicBase();
  const warnings: string[] = [];
  if (!baseLooksReal()) {
    warnings.push(
      `PUBLIC_BASE_URL is "${base || '(empty)'}". Webhooks were set to it, but Twilio can't reach a non-public URL — update PUBLIC_BASE_URL and re-run setup, or fix the webhooks after deploy.`
    );
  }

  try {
    // 1. Purchase + set the number's Voice webhook (SMS is handled by the service).
    const purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      voiceUrl: `${base}/api/voice/inbound`,
      voiceMethod: 'POST',
      statusCallback: `${base}/api/voice/status`,
      statusCallbackMethod: 'POST',
      friendlyName: 'Wrk Phone',
    });

    // 2. Attach to the Messaging Service (per requirement: all numbers tied to it).
    let attachedToService = false;
    if (twilioConfig.messagingServiceSid) {
      try {
        await twilioClient.messaging.v1
          .services(twilioConfig.messagingServiceSid)
          .phoneNumbers.create({ phoneNumberSid: purchased.sid });
        attachedToService = true;
      } catch (e: any) {
        // Already-in-service or sender-pool errors shouldn't fail the whole flow.
        warnings.push(`Could not attach to Messaging Service: ${e.message}`);
      }

      // 3. Make sure inbound SMS for the service routes to our server.
      try {
        await twilioClient.messaging.v1
          .services(twilioConfig.messagingServiceSid)
          .update({
            inboundRequestUrl: `${base}/api/sms/inbound`,
            inboundMethod: 'POST',
            useInboundWebhookOnNumber: false,
          });
      } catch (e: any) {
        warnings.push(`Could not set Messaging Service inbound URL: ${e.message}`);
      }
    } else {
      warnings.push('No TWILIO_MESSAGING_SERVICE_SID set — number purchased but not attached to a Messaging Service.');
    }

    // 4. Persist as the user's active number.
    setActiveNumber(USER, purchased.phoneNumber, purchased.sid);

    res.json({
      ok: true,
      number: purchased.phoneNumber,
      sid: purchased.sid,
      attachedToService,
      messagingServiceSid: twilioConfig.messagingServiceSid || null,
      warnings,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// GET /api/numbers/active — current provisioned number + onboarding state
numbersRouter.get('/numbers/active', (_req, res) => {
  const s = getAppSettings(USER);
  res.json({
    activeNumber: s.active_number || process.env.TWILIO_DEFAULT_FROM_NUMBER || null,
    activeNumberSid: s.active_number_sid || null,
    onboarded: !!s.onboarded,
    isProvisioned: !!s.active_number,
    messagingServiceSid: twilioConfig.messagingServiceSid || null,
  });
});
