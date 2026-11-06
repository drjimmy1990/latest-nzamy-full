/**
 * Window planning for GET /api/library/precedents/[slug].
 *
 * A collection can hold 2,323 principles, above PostgREST's max-rows (1000), so
 * the route serves one window at a time. The client advances by OFFSET (the
 * number of principles it already holds), which keeps a bulk load at a larger
 * limit from skipping rows the way `page × limit` would when the limit changes
 * between requests. `page` is still honoured for callers that send it.
 *
 * q390-ب: a window is at most 50 principles, so one request never carries more
 * protected text than a reader can see at once. `?target=<principle id>` opens
 * the window that holds that principle (targetWindowOffset); it only moves the
 * window — the paywall still uses the principle's global index.
 *
 * Pure (no imports) so node:test can exercise it without the `@/` alias.
 */

export const PRINCIPLES_DEFAULT_LIMIT = 50;
export const PRINCIPLES_MAX_LIMIT = 50;

/** library.principles.id is varchar(150): a longer target cannot match. */
const PRINCIPLE_ID_MAX_LENGTH = 150;

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

/**
 * The offset of the `limit`-sized window that holds 0-based `position`. A
 * limit below 1 (or not a number) counts as 1: never a division by 0 or NaN.
 */
export function targetWindowOffset(position: number, limit: number): number {
  const size = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
  return Math.floor(Math.max(0, position) / size) * size;
}

/**
 * The `?target=` principle id, trimmed; null when absent, blank or longer than
 * any principle id. It is only ever passed to `.eq()`, never into a filter string.
 */
export function parsePrincipleTarget(raw: string | null): string | null {
  const value = (raw ?? '').trim();
  if (value === '' || value.length > PRINCIPLE_ID_MAX_LENGTH) return null;
  return value;
}
