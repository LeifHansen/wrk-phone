// Singleton SSE connection shared across the app. Browser EventSource
// auto-reconnects on disconnect, so the only thing we own is fanning out the
// `wrk` events to interested components and tearing the socket down when no
// one's listening (saves a connection slot while the user is logged out or
// stuck on a chromeless page like /lp).

export type WrkEvent =
  | { kind: 'message:new'; conversationId: number; direction: 'in' | 'out'; isSuggestion?: boolean }
  | { kind: 'message:status'; conversationId?: number; sid: string; status: string }
  | { kind: 'voicemail:new'; conversationId: number }
  | { kind: 'call:status'; sid: string; status: string };

type Handler = (e: WrkEvent) => void;
const listeners = new Set<Handler>();
let es: EventSource | null = null;

function ensureOpen() {
  if (es || typeof EventSource === 'undefined') return;
  es = new EventSource('/api/events', { withCredentials: true });
  es.onmessage = (m) => {
    try {
      const data = JSON.parse(m.data) as WrkEvent;
      listeners.forEach((l) => { try { l(data); } catch { /* listener bug shouldn't kill stream */ } });
    } catch { /* heartbeat / malformed */ }
  };
  // The browser handles reconnection automatically on error — no manual
  // backoff needed. Logging would just be noise during a deploy bounce.
}

function close() {
  es?.close();
  es = null;
}

export function subscribeEvents(handler: Handler): () => void {
  listeners.add(handler);
  ensureOpen();
  return () => {
    listeners.delete(handler);
    if (listeners.size === 0) close();
  };
}
