import { Router } from 'express';
import { subscribe } from '../lib/events.js';

export const eventsRouter = Router();

// GET /api/events — Server-Sent Events stream.
//
// Why SSE not WebSockets:
// - It's a one-way push (server → clients) — every client wants the same
//   "something changed" pulse, not a bidirectional channel.
// - Works over the existing HTTP/2 path; no proxy/upgrade dance with Fly.
// - Browsers reconnect automatically (EventSource API).
// - Zero extra dependencies.
//
// Payload is minimal — just enough for clients to know WHICH conversation
// changed, then they refetch via the normal auth-gated endpoints. So the
// event endpoint can sit before `requireOwner` without leaking anything
// sensitive (it never carries message bodies, just IDs).
eventsRouter.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells Fly/Nginx to flush the response immediately instead of buffering.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  const unsubscribe = subscribe((e) => {
    try { res.write(`data: ${JSON.stringify(e)}\n\n`); } catch { /* socket already gone */ }
  });

  // Keep proxies from killing an idle connection. Browsers ignore SSE
  // comments, so a heartbeat costs nothing on the client side.
  const heartbeat = setInterval(() => {
    try { res.write(`: hb ${Date.now()}\n\n`); } catch { /* gone */ }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
