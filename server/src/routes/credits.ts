import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { getCredits, addCredits, recordSubscription, setSubscriptionStatusByStripeId } from '../lib/db.js';

export const creditsRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';

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
  });
});

// Free package (or no Stripe configured) → grant immediately. Clearly a stub.
creditsRouter.post('/credits/purchase', (req, res) => {
  const pkg = PACKAGES.find((p) => p.id === String(req.body?.packageId));
  if (!pkg) return res.status(400).json({ error: 'unknown package' });
  if (pkg.price > 0 && stripe) {
    return res.status(409).json({ error: 'Paid package — use /credits/checkout.' });
  }
  const balance = addCredits(USER, pkg.credits);
  res.json({ ok: true, added: pkg.credits, balance, stub: true });
});

// Real Stripe Checkout. body: { packageId, returnUrl }
creditsRouter.post('/credits/checkout', async (req, res) => {
  const pkg = PACKAGES.find((p) => p.id === String(req.body?.packageId));
  if (!pkg) return res.status(400).json({ error: 'unknown package' });
  if (pkg.price === 0) {
    const balance = addCredits(USER, pkg.credits);
    return res.json({ url: null, stub: true, balance });
  }
  if (!stripe) {
    // Dev fallback so the flow is testable without Stripe keys.
    const balance = addCredits(USER, pkg.credits);
    return res.json({ url: null, stub: true, balance, note: 'STRIPE_SECRET_KEY not set — credited without charge.' });
  }
  const base = String(req.body?.returnUrl || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pkg.price * 100,
          product_data: { name: `Wrk Phone — ${pkg.label} (${pkg.credits} credits)` },
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
  let event: Stripe.Event;
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
    if (credits > 0) addCredits(uid, credits);
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
