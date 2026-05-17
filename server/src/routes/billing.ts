import { Router } from 'express';
import Stripe from 'stripe';
import { recordSubscription, listSubscriptions } from '../lib/db.js';
import { log } from '../lib/log.js';

export const billingRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Recurring plans. Prices are created inline (price_data) so there's no
// pre-setup in the Stripe dashboard required.
export const PLANS: Record<string, { label: string; monthly: number }> = {
  a2p:    { label: 'Business line (A2P 10DLC)', monthly: 10 },
  number: { label: 'Additional phone number',  monthly: 2 },
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
  const base = String(req.body?.returnUrl || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          recurring: { interval: 'month' },
          unit_amount: plan.monthly * 100,
          product_data: { name: `WrkPhn — ${plan.label}` },
        },
      }],
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
