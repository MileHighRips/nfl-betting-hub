/**
 * Tiny in-process memo for read-only data aggregators (results, ratings, odds,
 * injuries). Survives across requests within the server process, so navigating
 * between pages reuses freshly-computed data instead of re-hitting slow upstream
 * APIs. Locks and placed bets are NEVER routed through here — they must always
 * read live. The Refresh Picks action calls clearMemo() to force a fresh pull.
 */

interface Entry {
  at: number;
  ttl: number;
  val: unknown;
}

const store = new Map<string, Entry>();

export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.val as T;
  const val = await fn();
  store.set(key, { at: Date.now(), ttl: ttlMs, val });
  return val;
}

/** Drop all memoized data — used by the Refresh Picks action for a fresh pull. */
export function clearMemo(): void {
  store.clear();
}
