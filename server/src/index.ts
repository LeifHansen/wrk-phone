import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokenRouter } from './routes/token.js';
import { voiceRouter } from './routes/voice.js';
import { smsRouter } from './routes/sms.js';
import { conversationsRouter } from './routes/conversations.js';
import { agentRouter } from './routes/agent.js';
import { campaignsRouter } from './routes/campaigns.js';
import { pushRouter } from './routes/push.js';
import { routingRouter } from './routes/routing.js';
import { diagRouter } from './routes/diag.js';
import { numbersRouter } from './routes/numbers.js';
import { contactsRouter } from './routes/contacts.js';
import { mediaRouter, MEDIA_DIR } from './routes/media.js';
import { creditsRouter, stripeWebhookHandler } from './routes/credits.js';
import { voicesRouter } from './routes/voices.js';
import { billingRouter } from './routes/billing.js';
import { a2pRouter } from './routes/a2p.js';
import { analyticsRouter } from './routes/analytics.js';
import { blogRouter } from './routes/blog.js';
import { aiRouter } from './routes/ai.js';
import { prankRouter } from './routes/prank.js';
import { rateLimit } from './lib/ratelimit.js';
import { startBlogScheduler } from './lib/blog.js';
import { listBlogPosts } from './lib/db.js';
import { log } from './lib/log.js';
import { twilioWebhook } from './lib/twilioVerify.js';
import { authContext, requireOwner } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import './lib/db.js'; // ensure migrations run

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(morgan('dev'));
// Stripe webhook needs the RAW body for signature verification — must be
// registered before the json parser.
app.post('/api/credits/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.urlencoded({ extended: false })); // Twilio webhooks
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Detailed access + error logging for every /api request. Captures the JSON
// body on non-2xx so any route that does `res.status(4xx/5xx).json(...)` in
// its own catch is logged centrally — without touching each route.
app.use('/api', (req, res, next) => {
  const started = Date.now();
  const origJson = res.json.bind(res);
  (res as any).json = (body: any) => {
    (res as any).__body = body;
    return origJson(body);
  };
  res.on('finish', () => {
    const ms = Date.now() - started;
    const line = `${req.method} ${req.originalUrl} → ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) {
      log.error('api', line, { body: (res as any).__body, userId: (req as any).userId });
    } else if (res.statusCode >= 400) {
      log.warn('api', line, { body: (res as any).__body, userId: (req as any).userId });
    } else {
      log.info('api', line);
    }
  });
  next();
});

// Resolve req.userId (bearer token → user, else OWNER) for every request.
app.use(authContext);
app.use('/api', authRouter);

// Verify Twilio signature on Twilio-originated webhooks only (NOT /api/sms/send,
// which is client-originated). Must run after body parsing, before the routers.
app.use('/api/voice', twilioWebhook);
app.use('/api/sms/inbound', twilioWebhook);
app.use('/api/sms/status', twilioWebhook);

// Shared-line authorization. Runs after /api/auth (login/register/me) and the
// Twilio/Stripe signature checks. No-op unless AUTH_REQUIRED=1; webhooks have
// no bearer so they resolve to OWNER and pass. Blocks logged-in non-owners
// from the shared inbox/campaign/telephony surface.
app.use('/api', requireOwner);

app.use('/api', tokenRouter);
app.use('/api', voiceRouter);
app.use('/api', smsRouter);
app.use('/api', conversationsRouter);
app.use('/api', agentRouter);
app.use('/api', campaignsRouter);
app.use('/api', pushRouter);
// Cost/abuse guards on the OpenAI- and Twilio-billed surfaces. NOTE: the
// Twilio-driven prank voice loop (/api/voice/prank*) is intentionally NOT
// limited here — Twilio hits it repeatedly during a legitimate prank call.
app.use('/api/ai', rateLimit({ windowMs: 60_000, max: 20, name: 'ai' }));
app.use('/api/prank', rateLimit({ windowMs: 60_000, max: 10, name: 'prank' }));
app.use('/api/_diag', rateLimit({ windowMs: 60_000, max: 10, name: 'diag' }));
app.use('/api/analytics', rateLimit({ windowMs: 60_000, max: 30, name: 'analytics' }));

app.use('/api', routingRouter);
app.use('/api', diagRouter);
app.use('/api', numbersRouter);
app.use('/api', contactsRouter);
app.use('/api', mediaRouter);
app.use('/api', creditsRouter);
app.use('/api', voicesRouter);
app.use('/api', billingRouter);
app.use('/api', a2pRouter);
app.use('/api', analyticsRouter);
app.use('/api', blogRouter);
app.use('/api', aiRouter);
app.use('/api', prankRouter);
app.use('/media', express.static(MEDIA_DIR));

// Unknown API routes must return JSON 404 (not the SPA HTML fallback) so the
// client's fetch wrapper gets a parseable error.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// Dynamic sitemap — core marketing pages + every published blog post, so
// new AI-written posts get indexed without redeploying. Registered before
// the SPA fallback so it wins over a stale static file.
app.get('/sitemap.xml', (_req, res) => {
  const base = (process.env.PUBLIC_BASE_URL || 'https://wrkphn.com').replace(/\/$/, '');
  const core = [
    { loc: '/', pri: '1.0', f: 'weekly' },
    { loc: '/lp', pri: '0.9', f: 'weekly' },
    { loc: '/register', pri: '0.8', f: 'monthly' },
    { loc: '/login', pri: '0.5', f: 'monthly' },
    { loc: '/blog', pri: '0.8', f: 'daily' },
  ];
  let urls = core.map((u) =>
    `  <url><loc>${base}${u.loc}</loc><changefreq>${u.f}</changefreq><priority>${u.pri}</priority></url>`);
  try {
    for (const p of listBlogPosts({ includeDrafts: false })) {
      const lm = new Date(p.published_at || p.updated_at).toISOString().slice(0, 10);
      urls.push(`  <url><loc>${base}/blog/${p.slug}</loc><lastmod>${lm}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
    }
  } catch { /* table may be empty */ }
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  );
});

// In production, the same container serves the built web SPA.
// Dockerfile copies the Vite build into ./public next to dist/.
const webDistCandidates = [
  process.env.WEB_DIST_PATH,
  path.resolve(__dirname, '../public'),       // production layout (dist/index.js + public/)
  path.resolve(__dirname, '../../web/dist'),  // local dev: server/dist/index.js + web/dist
].filter(Boolean) as string[];

const webDist = webDistCandidates.find((p) => p && fs.existsSync(path.join(p, 'index.html')));
if (webDist) {
  console.log(`Serving SPA from ${webDist}`);
  app.use(express.static(webDist));
  // SPA fallback — anything that didn't match an /api route returns index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  console.log('No web build found — running API-only.');
}

// Global error handler — nothing should crash silently.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error('express', `unhandled error on ${req.method} ${req.path}`, err);
  if (!res.headersSent) res.status(500).json({ error: err?.message || 'internal error' });
});
process.on('unhandledRejection', (r) => log.error('process', 'unhandledRejection', r));
process.on('uncaughtException', (e) => log.error('process', 'uncaughtException', e));

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`WrkPhn server listening on :${port}`);
  if (!process.env.PUBLIC_BASE_URL) {
    console.warn('Warning: PUBLIC_BASE_URL not set. Twilio webhooks need a public URL.');
  }
  startBlogScheduler();
});
