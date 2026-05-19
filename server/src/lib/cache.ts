// Minimal single-flight TTL memo for expensive idempotent fetches (e.g. the
// Twilio messages.list behind /api/analytics, polled frequently). Concurrent
// callers within the TTL share one in-flight promise instead of each hitting
// the upstream API.
const store = new Map<string, { at: number; val: Promise<any> }>();

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.val as Promise<T>;
  const val = fn().catch((e) => { store.delete(key); throw e; });
  store.set(key, { at: now, val });
  return val;
}
