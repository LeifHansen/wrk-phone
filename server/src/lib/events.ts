import { EventEmitter } from 'node:events';

// In-process pub/sub. Single instance only — when we go multi-instance
// (Postgres + horizontal scale) this is the seam where Redis pub/sub or
// Fly NATS slots in. For now a plain EventEmitter is the right amount of
// machinery: zero deps, instant fan-out to every connected SSE listener.
const bus = new EventEmitter();
// SSE clients can stack up (every browser tab, every mobile background poll).
// 100 is generous for a single-user-per-instance app; raise if we ever see
// "MaxListenersExceededWarning" in logs.
bus.setMaxListeners(100);

export type WrkEvent =
  | { kind: 'message:new'; conversationId: number; direction: 'in' | 'out'; isSuggestion?: boolean }
  | { kind: 'message:status'; conversationId?: number; sid: string; status: string }
  | { kind: 'voicemail:new'; conversationId: number }
  | { kind: 'call:status'; sid: string; status: string };

export function emit(e: WrkEvent): void {
  bus.emit('wrk', e);
}

export function subscribe(handler: (e: WrkEvent) => void): () => void {
  bus.on('wrk', handler);
  return () => bus.off('wrk', handler);
}
