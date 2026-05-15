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
import './lib/db.js'; // ensure migrations run

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: false })); // Twilio webhooks
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api', tokenRouter);
app.use('/api', voiceRouter);
app.use('/api', smsRouter);
app.use('/api', conversationsRouter);
app.use('/api', agentRouter);
app.use('/api', campaignsRouter);
app.use('/api', pushRouter);
app.use('/api', routingRouter);
app.use('/api', diagRouter);
app.use('/api', numbersRouter);
app.use('/api', contactsRouter);

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

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Wrk Phone server listening on :${port}`);
  if (!process.env.PUBLIC_BASE_URL) {
    console.warn('Warning: PUBLIC_BASE_URL not set. Twilio webhooks need a public URL.');
  }
});
