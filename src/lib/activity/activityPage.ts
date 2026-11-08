/**
 * activityPage.ts — one page of an activity feed merged from several streams,
 * and the cursor for the next one (final review of batch 2026-11-08, item 1).
 *
 * The routes (/api/v1/lawyer/activity, /api/v1/firm/activity) read each stream
 * newest-first with `created_at < before` and `limit(pageSize)`, merge them,
 * and answer `pageSize` rows plus a `nextCursor` (the `createdAt` the client
 * sends back as `before`). The old rule set the cursor only when ONE stream
 * came back full: two half-full streams merge to more than `pageSize` rows,
 * the page is cut, the cursor was null, and the rows past the cut could never
 * be reached.
 *
 * WHY THIS IS RIGHT FOR EVERY STREAM. A full stream A (pageSize rows, oldest
 * at T_A) alone holds pageSize rows at or after T_A, so every row of the
 * merged page is at or after T_A; A's unseen rows are at or before T_A. The
 * next request asks every stream for rows strictly older than the cursor, so:
 *   - no row is fetched twice: the cursor is the OLDEST row of the page;
 *   - no row is skipped: every row not on the page, and every unseen row of a
 *     full stream, is older than the cursor — EXCEPT rows sharing the
 *     cursor's exact timestamp. So when the cut, or a full stream's last row,
 *     falls on the page's oldest timestamp, that whole tie group is left for
 *     the next page (the cursor moves to the next newer timestamp). Only a
 *     page made entirely of one timestamp keeps it (it must make progress);
 *     those ties past the page are the one documented loss (> pageSize events
 *     in one microsecond).
 *
 * Timestamps are compared to the microsecond (Postgres keeps micros; JS Date
 * keeps millis, and two events in one millisecond are common under a batch).
 *
 * Pure — `node --test` loads it directly.
 */

export interface ActivityStream<T extends { createdAt: string }> {
  /** The rows the stream returned for this request, any order. */
  items: readonly T[];
  /** True when the stream returned its full limit: it may hold more past it. */
  full: boolean;
}

export interface ActivityPage<T> {
  page: T[];
  nextCursor: string | null;
}

/**
 * Microseconds since the epoch, from an ISO / PostgREST timestamp
 * ("2026-11-08T10:00:00.123456+00:00"). NaN for an unparsable string.
 * Fits in a double exactly (≈1.8e15 < 2^53).
 */
export function timestampMicros(iso: string): number {
  const m = /^(.*?T\d{2}:\d{2}:\d{2})(?:[.,](\d+))?(.*)$/.exec(iso);
  if (!m) return Date.parse(iso) * 1000;
  const fraction = (m[2] ?? "").padEnd(6, "0");
  const ms = Date.parse(`${m[1]}.${fraction.slice(0, 3)}${m[3]}`);
  return ms * 1000 + Number(fraction.slice(3, 6));
}

/** Newest first; an unparsable time sorts last. */
function compareNewestFirst(a: number, b: number): number {
  const an = Number.isNaN(a), bn = Number.isNaN(b);
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  return b - a;
}

export function mergeActivityPage<T extends { createdAt: string }>(
  streams: ReadonlyArray<ActivityStream<T>>,
  pageSize: number,
): ActivityPage<T> {
  const keyed = streams
    .flatMap((s) => s.items)
    .map((item) => ({ item, key: timestampMicros(item.createdAt) }))
    .sort((a, b) => compareNewestFirst(a.key, b.key));

  let cut = keyed.slice(0, pageSize);
  const more = keyed.length > pageSize || streams.some((s) => s.full);
  if (!more || cut.length === 0) return { page: cut.map((k) => k.item), nextCursor: null };

  const boundary = cut[cut.length - 1].key;
  const tieAtCut = keyed.length > pageSize && keyed[pageSize].key === boundary;
  const tieInFullStream = streams.some(
    (s) => s.full && s.items.length > 0 && Math.min(...s.items.map((i) => timestampMicros(i.createdAt))) === boundary,
  );
  if (tieAtCut || tieInFullStream) {
    const before = cut.filter((k) => k.key !== boundary);
    if (before.length > 0) cut = before;
  }
  return { page: cut.map((k) => k.item), nextCursor: cut[cut.length - 1].item.createdAt };
}
