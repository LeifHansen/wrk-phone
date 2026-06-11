import { Router } from 'express';

export const a2pRouter = Router();

// ── RETIRED (2026-06): per-user 10DLC registration ───────────────────────────
//
// WrkPhn numbers now ride the platform's approved A2P campaign (the marketing
// Messaging Service every purchased number joins — see numbers.ts
// purchaseAndProvision). Users never file 10DLC themselves: buying a number
// includes carrier registration with zero steps.
//
// The old wizard (draft → submit → verify-otp) registered per-user brands via
// TrustHub. It never worked reliably, and on the shared Twilio account it
// would create stray customer profiles, so the endpoints are retired rather
// than left callable. The a2p_registrations table is kept for historical rows.
//
// 410 Gone (not 404) so any cached client gets a truthful, permanent answer.
const RETIRED = {
  error: 'Business registration is no longer needed — every WrkPhn number is pre-registered on our approved A2P campaign when you buy it.',
  retired: true,
};

a2pRouter.all(['/a2p', '/a2p/*'], (_req, res) => res.status(410).json(RETIRED));
