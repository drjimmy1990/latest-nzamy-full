/**
 * Window planning for GET /api/library/precedents/[slug].
 *
 * A collection can hold 2,323 principles, above PostgREST's max-rows (1000), so
 * the route serves one window at a time. The client advances by OFFSET (the
 * number of principles it already holds), which keeps a bulk load at a larger
 * limit from skipping rows the way `page × limit` would when the limit changes
 * between requests. `page` is still honoured for callers that send it.
 *
 * Pure (no imports) so node:test can exercise it without the `@/` alias.
 */

export const PRINCIPLES_DEFAULT_LIMIT = 100;
export const PRINCIPLES_MAX_LIMIT = 500;

function toInt(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function planPrincipleWindow(searchParams: URLSearchParams): { offset: number; limit: number } {
  const rawLimit = toInt(searchParams.get('limit'));
  const limit = rawLimit === null || rawLimit < 1
    ? PRINCIPLES_DEFAULT_LIMIT
    : Math.min(rawLimit, PRINCIPLES_MAX_LIMIT);

  const rawOffset = toInt(searchParams.get('offset'));
  if (rawOffset !== null) return { offset: Math.max(0, rawOffset), limit };

  const rawPage = toInt(searchParams.get('page'));
  const page = rawPage === null || rawPage < 1 ? 1 : rawPage;
  return { offset: (page - 1) * limit, limit };
}

/**
 * The paywall for one principle of a window. `globalIndex` is its position in
 * the WHOLE collection (offset + index in the window), so a later window never
 * re-unlocks the free first N; freeLimit -1 means unlimited (Pro+/whitelisted).
 */
export function isPrincipleLocked(isFree: boolean, freeLimit: number, globalIndex: number): boolean {
  return !isFree && freeLimit !== -1 && globalIndex >= freeLimit;
}
