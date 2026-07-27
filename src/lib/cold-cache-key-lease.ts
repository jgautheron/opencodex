/**
 * Cold prompt_cache_key lease (devlog 260727 subagent-cache-audit).
 *
 * A content-based prompt_cache_key (see claude/inbound.ts) makes every request that
 * shares the same resolved model + system + tools agree on the same OpenAI cache
 * cohort. That fixes reuse ACROSS time (a later session hits an earlier one's warm
 * cache) but does nothing for requests that race the SAME key at the SAME time: if
 * two Task-tool subagents of the same persona are dispatched in one message, both
 * requests can be in flight before either has written its cache entry, so both miss
 * even though they'd have shared a hit had one landed first.
 *
 * This module lets the caller opt into serializing that specific race: the first
 * request for a given key proceeds immediately (the "leader"); any request sharing
 * that key while the leader is still in flight awaits the leader's release signal
 * instead of dispatching upstream right away.
 *
 * Deliberately NOT a general single-flight/response-sharing cache (see
 * request-coalescing prior art) — each caller still gets its own real upstream
 * response; only the *dispatch timing* of followers is delayed so they land on a
 * warmer cache.
 */

interface PendingLease {
  release: () => void;
  wait: Promise<void>;
}

const inFlight = new Map<string, PendingLease>();

export interface ColdCacheKeyLease {
  /** Non-null when this caller is a follower — await it before dispatching upstream. */
  waitForLeader: Promise<void> | null;
  /**
   * Leader only (waitForLeader === null): call once, as soon as the leader's request
   * has progressed enough that the cache write should have landed (first output
   * token is a reasonable proxy — by then the model has finished ingesting the
   * prompt). Idempotent; safe to call from both a first-output hook and a
   * finally-block fallback (e.g. the leader errors before producing any output).
   */
  release: () => void;
}

/**
 * Acquire a lease for `key`. The first caller for a given key becomes the leader
 * (waitForLeader: null) and must call `release()` itself once it's safe for
 * followers to proceed. Every subsequent caller for the same key, while the leader
 * hasn't released yet, becomes a follower and receives the leader's `wait` promise.
 */
export function acquireColdCacheKeyLease(key: string): ColdCacheKeyLease {
  const existing = inFlight.get(key);
  if (existing) return { waitForLeader: existing.wait, release: () => {} };

  let resolve: () => void = () => {};
  const wait = new Promise<void>(r => { resolve = r; });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    // Only the current holder for this key clears the map entry — a slow-to-call
    // leader whose key was already superseded (shouldn't happen given the map is
    // keyed by content hash and cleared synchronously below, but cheap to guard)
    // must not evict a newer lease.
    if (inFlight.get(key)?.wait === wait) inFlight.delete(key);
    resolve();
  };
  inFlight.set(key, { release, wait });
  return { waitForLeader: null, release };
}

/** Test isolation / explicit reset. */
export function clearColdCacheKeyLeases(): void {
  inFlight.clear();
}
