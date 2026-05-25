import { Router } from 'express';
import Stripe from 'stripe';
import { recordSubscription, listSubscriptions } from '../lib/db.js';
import { log } from '../lib/log.js';

export const billingRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';

// A "real" Stripe key passes the prefix check AND doesn't look like an
// example/stub value (any 6+ consecutive x's, "your_key", "placeholder",
// or short strings — real keys are ~100 chars). Without this guard the
// Stripe constructor succeeds on a fake value but every API call 401s with
// a misleading "Invalid API Key" error, and from the user's POV the
// Subscribe button is just broken. Treating the stub as unconfigured falls
// back to the dev path that records a 'dev' subscription so the flow
// stays testable end-to-end without real Stripe credentials.
function isUsableStripeKey(k: string | undefined): boolean {
  if (!k) return false;
  if (!/^sk_(test|live)_/.test(k)) return false;
  if (/x{6,}/i.test(k) || /your[_-]?key|placeholder|stub/i.test(k)) return false;
  return k.length > 30; // real Stripe keys are ~100 chars
}
const stripe = isUsableStripeKey(process.env.STRIPE_SECRET_KEY)
  ? new Stripe(process.env.STRIPE_SECRET_KEY as string)
  : null;
if (process.env.STRIPE_SECRET_KEY && !stripe) {
  log.warn('billing', 'STRIPE_SECRET_KEY looks like a placeholder/stub — treating as unconfigured. Set a real sk_live_… or sk_test_… key in Fly secrets to enable real Stripe checkout.');
}

// Recurring plans. Prices are created inline (price_data) so there's no
// pre-setup in the Stripe dashboard required. `setupFee` is a one-time
// charge added to the first invoice (covers Twilio's brand/campaign vetting).
//
// Tiering — cheap → premium:
//   1. (no plan)   = free / pay-as-you-go on a shared toll-free pool number.
//                    Standard credits buy SMS; works for low volume + ad-hoc
//                    use without any registration.
//   2. sole_prop  = cheaper sole-prop tier. Lower monthly + smaller setup,
//                    but Twilio's sole-prop verification flow currently
//                    requires a manual identity-verification step in the
//                    Twilio Console (the automated TrustHub path is not
//                    available on all accounts). Lower throughput than A2P.
//   3. a2p        = the premium standard 10DLC Business Line. Full automated
//                    brand + campaign registration; highest throughput; best
//                    deliverability with US carriers.
//   number        = paid add-on for an extra dedicated number on top of any
//                    of the above (or the shared pool).
export const PLANS: Record<string, {
  label: string;
  monthly: number;
  setupFee?: number;
  tier: 'addon' | 'sole_prop' | 'standard';
  blurb: string;
  throughput: string;
  manualVerification?: boolean;
}> = {
  sole_prop: {
    label: 'Sole Proprietor line',
    monthly: 5,
    setupFee: 5,
    tier: 'sole_prop',
    blurb: 'Cheaper monthly. Best for solos + small side-hustles. Requires a one-time identity step in the Twilio console (~5 min).',
    throughput: 'Up to ~3,000 msgs/day',
    manualVerification: true,
  },
  a2p: {
    label: 'Business line (A2P 10DLC)',
    monthly: 10,
    setupFee: 15,
    tier: 'standard',
    blurb: 'Fully automated brand + campaign registration. Highest throughput. Best US carrier deliverability.',
    throughput: 'Up to ~200,000 msgs/day',
  },
  number: {
    label: 'Additional phone number',
    monthly: 2,
    tier: 'addon',
    blurb: 'Add a dedicated local number on top of your shared pool number.',
    throughput: '',
  },
};

billingRouter.get('/billing/subscriptions', (_req, res) => {
  res.json({ stripeEnabled: !!stripe, plans: PLANS, subscriptions: listSubscriptions(USER) });
});

// POST /api/billing/subscribe  { plan: 'a2p'|'number', ref?, returnUrl? }
billingRouter.post('/billing/subscribe', async (req, res) => {
  const planId = String(req.body?.plan || '');
  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: 'unknown plan' });
  const ref = req.body?.ref ? String(req.body.ref) : null;

  // Dev / no-Stripe fallback so the flow is fully testable without keys.
  if (!stripe) {
    recordSubscription(USER, planId, ref, 'dev');
    return res.json({ url: null, stub: true, status: 'dev',
      note: 'STRIPE_SECRET_KEY not set — subscription recorded without charge.' });
  }

  recordSubscription(USER, planId, ref, 'pending');
  const base = String(req.body?.returnUrl || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  try {
    // A one-time price_data line item in a subscription-mode checkout is
    // billed on the FIRST invoice only — that's how the setup fee rides along
    // with the recurring charge in a single checkout.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        recurring: { interval: 'month' },
        unit_amount: plan.monthly * 100,
        product_data: { name: `WrkPhn — ${plan.label}` },
      },
    }];
    if (plan.setupFee) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: plan.setupFee * 100,
          product_data: { name: `WrkPhn — ${plan.label} (one-time setup)` },
        },
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${base}/admin?sub=1`,
      cancel_url: `${base}/admin?sub=canceled`,
      metadata: { userId: USER, plan: planId, ref: ref || '' },
      subscription_data: { metadata: { userId: USER, plan: planId, ref: ref || '' } },
    });
    res.json({ url: session.url });
  } catch (e: any) {
    log.error('billing/subscribe', 'checkout create failed', e);
    res.status(500).json({ error: e.message });
  }
});
