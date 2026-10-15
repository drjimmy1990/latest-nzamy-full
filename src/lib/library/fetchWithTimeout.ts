/**
 * A fetch that gives up after `ms`. Used by scripts/seed-library-from-owner.mjs.
 *
 * The owner's live load of 2026-10-15 sat 45 minutes on the first
 * decree_pages batch: supabase-js calls fetch with no deadline, so one request
 * that never answers blocks the whole run. With this wrapper that request
 * fails after `ms` like any other error, and the loader's existing
 * row-by-row fallback takes over.
 *
 * A signal the caller passes is kept: either one aborts the request.
 */
export const LOADER_REQUEST_TIMEOUT_MS = 120_000;

export function fetchWithTimeout(
  ms: number = LOADER_REQUEST_TIMEOUT_MS,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  if (!Number.isFinite(ms) || ms <= 0) throw new Error(`fetchWithTimeout: bad timeout ${ms}`);
  return (input, init = {}) => {
    const deadline = AbortSignal.timeout(ms);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return baseFetch(input, { ...init, signal });
  };
}
