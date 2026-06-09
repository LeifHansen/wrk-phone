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
    label: 'Dedicated phone number',
    monthly: 2,
    setupFee: 2,
    tier: 'addon',
    blurb: 'Your own local number. Joins our registered marketing campaign automatically — full carrier deliverability, no registration steps.',
    throughput: '',
  },
};

billingRouter.get('/billing/subscriptions', (_req, res) => {
  res.json({ stripeEnabled: !!stripe, plans: PLANS, subscriptions: listSubscriptions(USER) });
});

/**
 * Create a Stripe subscription checkout for a plan. Shared by the generic
 * subscribe endpoint and the number-purchase flow (numbers.ts), which needs
 * its own success URL + metadata so the webhook can fulfill the purchase.
 *
 * Without a usable Stripe key this records a 'dev' subscription and returns
 * { stub: true } so callers can fulfill immediately — the whole flow stays
 * testable end-to-end with no keys.
 */
export async function createPlanCheckout(opts: {
  userId: string;
  planId: string;
  ref?: string | null;
  returnBase?: string;                   // origin override (e.g. from the client)
  successPath?: string;                  // appended to base; default /admin?sub=1
  cancelPath?: string;
  metadata?: Record<string, string>;     // extra session/subscription metadata
}): Promise<{ url: string | null; stub?: boolean; note?: string }> {
  const plan = PLANS[opts.planId];
  if (!plan) throw new Error('unknown plan');
  const ref = opts.ref ?? null;

  // Dev / no-Stripe fallback so the flow is fully testable without keys.
  if (!stripe) {
    recordSubscription(opts.userId, opts.planId, ref, 'dev');
    return { url: null, stub: true,
      note: 'STRIPE_SECRET_KEY not set — subscription recorded without charge.' };
  }

  recordSubscription(opts.userId, opts.planId, ref, 'pending');
  const base = String(opts.returnBase || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  const metadata = { userId: opts.userId, plan: opts.planId, ref: ref || '', ...(opts.metadata || {}) };

  // line_items in subscription mode MUST all be recurring — Stripe rejects
  // any one-time price_data here with "You cannot combine one-time payments
  // and subscriptions in the same Checkout Session." Setup fees go via
  // subscription_data.invoice_items below (the supported pattern).
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
    quantity: 1,
    price_data: {
      currency: 'usd',
      recurring: { interval: 'month' },
      unit_amount: plan.monthly * 100,
      product_data: { name: `WrkPhn — ${plan.label}` },
    },
  }];

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: lineItems,
    success_url: `${base}${opts.successPath || '/admin?sub=1'}`,
    cancel_url: `${base}${opts.cancelPath || '/admin?sub=canceled'}`,
    metadata,
    subscription_data: { metadata },
  };

  // One-time setup fee: ride along on the first invoice via Stripe's
  // invoice-items mechanism. Requires a real Price (Stripe doesn't accept
  // ad-hoc price_data on invoice items the way it does on line_items),
  // so we create or reuse a Price scoped to a Product with a stable
  // lookup_key. This keeps the setup-fee SKUs idempotent across calls.
  if (plan.setupFee) {
    try {
      const lookupKey = `wrkphn_setup_${opts.planId}_${plan.setupFee}usd`;
      const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
      let priceId: string;
      if (existing.data[0]) {
        priceId = existing.data[0].id;
      } else {
        const product = await stripe.products.create({
          name: `WrkPhn — ${plan.label} (one-time setup)`,
        });
        const price = await stripe.prices.create({
          product: product.id,
          currency: 'usd',
          unit_amount: plan.setupFee * 100,
          lookup_key: lookupKey,
        });
        priceId = price.id;
      }
      (sessionParams.subscription_data as any).invoice_items = [
        { price: priceId, quantity: 1 },
      ];
    } catch (e: any) {
      // Setup fee plumbing failed — log it but DON'T block the checkout.
      // The user still gets billed monthly; we'll catch up on the setup
      // fee later or eat it. Better than a hard 500 with no recourse.
      log.warn('billing/checkout', `setup-fee invoice-item attach failed: ${e.message}`);
    }
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url };
}

// POST /api/billing/subscribe  { plan: 'a2p'|'number', ref?, returnUrl? }
billingRouter.post('/billing/subscribe', async (req, res) => {
  const planId = String(req.body?.plan || '');
  if (!PLANS[planId]) return res.status(400).json({ error: 'unknown plan' });
  const ref = req.body?.ref ? String(req.body.ref) : null;
  try {
    const r = await createPlanCheckout({
      userId: USER, planId, ref,
      returnBase: req.body?.returnUrl ? String(req.body.returnUrl) : undefined,
    });
    if (r.stub) return res.json({ url: null, stub: true, status: 'dev', note: r.note });
    res.json({ url: r.url });
  } catch (e: any) {
    log.error('billing/subscribe', 'checkout create failed', e);
    res.status(500).json({ error: e.message });
  }
});
