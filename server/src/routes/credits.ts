import { Router } from 'express';
import { getCredits, addCredits } from '../lib/db.js';

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

creditsRouter.get('/credits', (_req, res) => {
  res.json({ balance: getCredits(USER), packages: PACKAGES, rates: RATES });
});

// STUB checkout — no payment processor wired yet. Adds the credits immediately.
// Replace with Stripe Checkout + webhook before charging real money.
creditsRouter.post('/credits/purchase', (req, res) => {
  const pkg = PACKAGES.find((p) => p.id === String(req.body?.packageId));
  if (!pkg) return res.status(400).json({ error: 'unknown package' });
  const balance = addCredits(USER, pkg.credits);
  res.json({ ok: true, added: pkg.credits, balance, stub: true });
});
