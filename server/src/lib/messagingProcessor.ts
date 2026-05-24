// ============================================================
// messagingProcessor — concurrent batch sender with round-robin
// ============================================================
// Used by SMS campaigns (`routes/campaigns.ts`) and outbound agent calls
// (`routes/agentCalls.ts`) to push a worklist of recipients through one or
// more sender "lanes" (one per from-number) in parallel. Replaces the prior
// 1-msg/sec serial loop that wouldn't keep up for 10k+ recipient blasts.
//
// Design — per-lane worker pool, not a global one:
//   • Each from-number is its own LANE. A lane runs `concurrencyPerLane`
//     workers in parallel, each pulling the next pending recipient from the
//     lane's queue. Round-robin distribution happens at WORK-ASSIGN time so
//     a lane that hits a transient rate-limit doesn't starve the rest.
//   • Twilio's per-from-number rate limit is the real constraint (1 msg/s on
//     unverified, 30+/s with 10DLC). Per-lane workers let you double or quad
//     up per number while still respecting per-number-per-second budgets.
//   • Per-lane minimum interval is enforced by a "last-fired-at" timestamp.
//     Workers within a lane share the timestamp so two workers can't both
//     fire in the same ms.
//
// Throughput math: lanes × concurrencyPerLane = peak parallel sends.
// Default (4 lanes × 4 workers = 16) handles 10k SMS in ~10 min and stays
// well under Twilio account-wide queueing limits.
//
// Used the same way for both SMS (`twilioClient.messages.create`) and voice
// (`twilioClient.calls.create`) — caller passes a `sendOne(recipient, from)`
// function and the processor handles batching, throttling, recovery hooks,
// and result aggregation.

export interface ProcessorOptions {
  /** From-numbers to round-robin across. Length 1 is fine — degrades to a
   *  single-lane worker pool, same throughput as the old loop × concurrency. */
  fromNumbers: string[];
  /** Workers per lane. Each lane = one from-number. Default 4 = solid for
   *  10DLC-registered numbers; drop to 1 for unverified toll-free. */
  concurrencyPerLane?: number;
  /** Minimum ms between fires WITHIN a single lane. Default 100ms = 10/sec
   *  per number which is the safe ceiling for non-10DLC; 33ms (30/sec) is
   *  fine on 10DLC. Set 0 to disable. */
  perLaneMinIntervalMs?: number;
  /** Optional callback fired after each recipient resolves (success or
   *  failure). Used to update per-row status, refresh counters, etc. */
  onResult?: (r: ProcessorResult<any>) => void;
  /** Optional hook called when a lane goes idle (queue drained). */
  onLaneIdle?: (from: string) => void;
}

export interface ProcessorResult<T> {
  recipient: T;
  from: string;
  ok: boolean;
  result?: any;          // whatever sendOne resolved with (e.g. Twilio message sid)
  error?: string;
}

/** A `sendOne` returns either truthy success (caller can pass back the SID
 *  or any payload) or throws — the processor records the error. */
export type SendOne<T> = (recipient: T, from: string) => Promise<any>;

/**
 * Process `recipients` through `sendOne`, parallelizing within and across
 * lanes. Returns when every recipient has resolved.
 *
 * Recipients are pre-sharded round-robin onto lanes. Shard `n` % `lanes` →
 * lane index. Each lane drains its shard with its own worker pool.
 *
 * For huge lists this is O(recipients) memory (per-lane queues). For 10k it's
 * fine; for 1M+ you'd want to stream from the DB row by row — out of scope.
 */
export async function processBatch<T>(
  recipients: T[],
  sendOne: SendOne<T>,
  opts: ProcessorOptions,
): Promise<ProcessorResult<T>[]> {
  if (recipients.length === 0) return [];
  const lanes = opts.fromNumbers.length;
  if (lanes === 0) {
    throw new Error('processBatch needs at least one fromNumber');
  }
  const workersPerLane = Math.max(1, opts.concurrencyPerLane ?? 4);
  const minIntervalMs = Math.max(0, opts.perLaneMinIntervalMs ?? 100);

  // Shard recipients round-robin → lane queues. Pre-sharding (vs. a single
  // shared queue with lane assignment at pull time) keeps the per-lane
  // throughput predictable and makes the math obvious for the user.
  const queues: T[][] = Array.from({ length: lanes }, () => []);
  for (let i = 0; i < recipients.length; i++) {
    queues[i % lanes].push(recipients[i]);
  }
  const results: ProcessorResult<T>[] = [];

  const runLane = async (laneIdx: number) => {
    const from = opts.fromNumbers[laneIdx];
    const queue = queues[laneIdx];
    let nextSlotAt = 0;

    const runWorker = async () => {
      while (queue.length > 0) {
        const recipient = queue.shift();
        if (recipient === undefined) break;

        // Enforce per-lane minimum interval. nextSlotAt is shared across all
        // workers in this lane — incrementing it BEFORE the await means two
        // workers can never race to the same slot.
        if (minIntervalMs > 0) {
          const now = Date.now();
          const slot = Math.max(now, nextSlotAt);
          nextSlotAt = slot + minIntervalMs;
          const waitMs = slot - now;
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        }

        let r: ProcessorResult<T>;
        try {
          const result = await sendOne(recipient, from);
          r = { recipient, from, ok: true, result };
        } catch (err: any) {
          r = { recipient, from, ok: false, error: (err?.message || 'error').slice(0, 500) };
        }
        results.push(r);
        try { opts.onResult?.(r); } catch { /* don't let a callback kill the loop */ }
      }
    };

    await Promise.all(Array.from({ length: workersPerLane }, () => runWorker()));
    try { opts.onLaneIdle?.(from); } catch { /* swallow */ }
  };

  await Promise.all(queues.map((_, i) => runLane(i)));
  return results;
}
