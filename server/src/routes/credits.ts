import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { getCredits, addCredits, getLedger, recordSubscription, setSubscriptionStatusByStripeId } from '../lib/db.js';

export const creditsRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';

// Free for now. Future: $0.99/mo covers the phone line; credits are à la carte.
export const PACKAGES = [
  { id: 'starter', credits: 100,  price: 0,  label: 'Starter', note: 'Free while in beta' },
  { id: 'p500',    credits: 500,  price: 5,  label: '500 credits' },
  { id: 'p1200',   credits: 1200, price: 10, label: '1,200 credits', note: 'Best value' },
  { id: 'p3000',   credits: 3000, price: 20, label: '3,000 credits' },
];

const RATES = {
  sms: '1 credit per 160-character segment',
  mms: '3 credits — image/gif/video + up to 560 characters',
};

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

creditsRouter.get('/credits', (_req, res) => {
  res.json({
    balance: getCredits(USER),
    packages: PACKAGES,
    rates: RATES,
    stripeEnabled: !!stripe,
    testMode: (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test'),
  });
});

// Token ledger — every grant + spend, most recent first. Powers the
// Tokens page's "where did my tokens go" view + spend-by-action chart.
// Default 200 rows; pass ?limit= to override (capped at 1000 to keep
// the response tame on heavy accounts).
creditsRouter.get('/credits/ledger', (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
  res.json({ entries: getLedger(USER, limit) });
});

// Free package (or no Stripe configured) → grant immediately. Clearly a stub.
creditsRouter.post('/credits/purchase', (req, res) => {
  const pkg = PACKAGES.find((p) => p.id === String(req.body?.packageId));
  if (!pkg) return res.status(400).json({ error: 'unknown package' });
  if (pkg.price > 0 && stripe) {
    return res.status(409).json({ error: 'Paid package — use /credits/checkout.' });
  }
  const balance = addCredits(USER, pkg.credits, 'topup', { packageId: pkg.id, stub: true });
  res.json({ ok: true, added: pkg.credits, balance, stub: true });
});

// Real Stripe Checkout. body: { packageId, returnUrl }
creditsRouter.post('/credits/checkout', async (req, res) => {
  const pkg = PACKAGES.find((p) => p.id === String(req.body?.packageId));
  if (!pkg) return res.status(400).json({ error: 'unknown package' });
  if (pkg.price === 0) {
    const balance = addCredits(USER, pkg.credits, 'topup', { packageId: pkg.id, free: true });
    return res.json({ url: null, stub: true, balance });
  }
  if (!stripe) {
    // Dev fallback so the flow is testable without Stripe keys.
    const balance = addCredits(USER, pkg.credits, 'topup', { packageId: pkg.id, stub: true });
    return res.json({ url: null, stub: true, balance, note: 'STRIPE_SECRET_KEY not set — credited without charge.' });
  }
  const base = String(req.body?.returnUrl || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pkg.price * 100,
          product_data: { name: `WrkPhn — ${pkg.label} (${pkg.credits} credits)` },
        },
      }],
      success_url: `${base}/credits?paid=1`,
      cancel_url: `${base}/credits?canceled=1`,
      metadata: { userId: USER, credits: String(pkg.credits), packageId: pkg.id },
    });
    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe webhook — credits the account after a confirmed payment.
// Mounted in index.ts with express.raw() BEFORE express.json (signature needs raw body).
export function stripeWebhookHandler(req: Request, res: Response) {
  if (!stripe) return res.status(503).send('stripe not configured');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  // STRIPE_WEBHOOK_INSECURE is a DEV-ONLY escape hatch. Hard-refuse it in
  // production: if it's ever set with NODE_ENV=production, the only safe
  // behavior is to reject the webhook outright (anything else lets an attacker
  // forge a 'checkout.session.completed' and credit themselves).
  if (process.env.NODE_ENV === 'production' && process.env.STRIPE_WEBHOOK_INSECURE === '1') {
    return res.status(500).send('refusing STRIPE_WEBHOOK_INSECURE in production');
  }
  let event: Stripe.Event;
  if (!secret) {
    // No signature secret = cannot prove the request is really Stripe. An
    // unsigned fallback lets anyone forge "payment completed" and self-
    // credit, so we fail CLOSED regardless of NODE_ENV. Local testing must
    // explicitly opt in via STRIPE_WEBHOOK_INSECURE=1 (never set in prod).
    if (process.env.STRIPE_WEBHOOK_INSECURE !== '1') {
      return res.status(503).send('stripe webhook secret not configured');
    }
  }
  try {
    if (secret) {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, secret);
    } else {
      event = JSON.parse(req.body.toString()); // dev only — no signature check
    }
  } catch (e: any) {
    return res.status(400).send(`Webhook signature error: ${e.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    const uid = s.metadata?.userId || USER;
    const credits = Number(s.metadata?.credits || 0);
    if (credits > 0) addCredits(uid, credits, 'topup', { stripeSession: s.id, packageId: s.metadata?.packageId });
    // Subscription checkout (numbers $2/mo, A2P line $10/mo) also lands here.
    if (s.mode === 'subscription' && s.metadata?.plan) {
      recordSubscription(uid, s.metadata.plan, s.metadata.ref || null, 'active',
        typeof s.subscription === 'string' ? s.subscription : undefined);
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    setSubscriptionStatusByStripeId(sub.id, 'canceled');
  } else if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    setSubscriptionStatusByStripeId(sub.id, sub.status === 'active' ? 'active' : sub.status);
  }
  res.json({ received: true });
}
