/**
 * LIB-15 pagination planning, pulled out of route.ts so it is testable
 * without a network call. `parseLibraryListParams` turns the raw
 * `?page&limit` query string values into a safe (page, limit, offset,
 * rangeTo) tuple: page below 1 (or non-numeric) is treated as 1, and limit is
 * clamped to [1, MAX_LIMIT] so one request can never ask PostgREST for an
 * unbounded page (the bug this finding fixes) or an absurdly large one.
 *
 * `planLibraryWindows` decides WHICH tables to read for a page and with what
 * range, from head counts taken first. PostgREST answers 416 PGRST103 when an
 * offset passes a table's row count; in «الكل» mode every table gets the same
 * offset, so feqh_books (185 rows) failed every page from 5 on and any small
 * search result failed from page 2 — and the route turned that into a 500.
 *
 * Search is ONE rule for every table: a case-insensitive substring match
 * (ilike) on the table's title/text column. Round 1 had switched principles
 * to full-text search on the `simple` config, which drops words carrying an
 * attached prefix (ال/بال/وال): «تعويض» lost 1,828 of 3,159 matches.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface LibraryListParams {
  page: number;
  limit: number;
  offset: number;
  rangeTo: number;
}

export function parseLibraryListParams(
  rawPage: string | null,
  rawLimit: string | null,
  { defaultLimit = DEFAULT_PAGE_SIZE, maxLimit = MAX_PAGE_SIZE }: { defaultLimit?: number; maxLimit?: number } = {},
): LibraryListParams {
  const parsedPage = parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedLimit = parseInt(rawLimit ?? String(defaultLimit), 10);
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit));

  const offset = (page - 1) * limit;
  const rangeTo = offset + limit - 1;

  return { page, limit, offset, rangeTo };
}

/**
 * `search` as a literal ILIKE substring pattern: `%`, `_` and `\` in the
 * admin's input match themselves instead of acting as wildcards.
 *
 * `*` is stripped outright rather than escaped: PostgREST's ilike/like
 * operators treat an unescaped `*` in the filter value as a shorthand alias
 * for `%` (its own wildcard, applied before this string ever reaches a SQL
 * LIKE pattern), and that translation cannot be defeated with a backslash —
 * there is no way to send PostgREST a literal, matching `*`. Left in place,
 * a search of exactly "*" would widen `%<term>%` into `%%%` and match every
 * row in every table; "نظام*العمل" would act as a real wildcard instead of
 * the literal substring the admin typed. Dropping it keeps the rest of the
 * term a true literal substring match.
 */
export function toIlikeSubstring(search: string): string {
  const withoutWildcardAlias = search.replace(/\*/g, "");
  return `%${withoutWildcardAlias.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * How many pages the client can page through with `page`/`limit`.
 *
 * `total` (the SUM of the four tables' count:"exact" reads) is the right
 * number for "N من M سجل" — it is the true combined row count. It is the
 * WRONG number to derive page count from in "الكل" mode: the route pages
 * each table independently by the SAME window (see the comment above the
 * query branches in route.ts), so a page beyond the largest active table's
 * own last page returns nothing from every table at once, while
 * `ceil(total / limit)` keeps claiming there are more pages (with laws
 * 5,901 + decrees 3,318 + principles 18,983 + feqh_books 185 = 28,387 rows
 * and limit 50, `ceil(total/limit)` says 568 pages, but principles — the
 * largest table — runs out at page 380; pages 381-568 would render
 * "لا توجد نتائج" under a page count that still climbs to 568).
 *
 * The correct bound is the LARGEST of the counts actually being fetched:
 * once that one table is exhausted, so is the combined view. A count that
 * was never fetched (category filter narrowed it out) is always 0 by
 * construction, so passing all four counts unconditionally is safe: an
 * inactive table can only pull the max down, never up, past what an active
 * table already set.
 */
export function computeTotalPages(counts: number[], limit: number): number {
  const maxCount = counts.reduce((max, c) => Math.max(max, c), 0);
  return Math.max(1, Math.ceil(maxCount / Math.max(1, limit)));
}

export const LIBRARY_TABLE_KEYS = ["laws", "decrees", "principles", "feqh"] as const;
export type LibraryTableKey = (typeof LIBRARY_TABLE_KEYS)[number];

export interface TableWindow {
  table: LibraryTableKey;
  /** Inclusive .range() bounds, always inside [0, count - 1]. */
  from: number;
  to: number;
}

/**
 * The ranged reads to make for one page, given each active table's (filtered)
 * row count. A table is read only when the page's offset is below its count,
 * and its window never runs past its last row — so no request can draw a 416
 * PGRST103. A table absent from `counts` (filtered out by category) is not
 * read. Order follows LIBRARY_TABLE_KEYS so the page's row order is stable.
 */
export function planLibraryWindows(
  counts: Partial<Record<LibraryTableKey, number>>,
  offset: number,
  limit: number,
): TableWindow[] {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.floor(limit));
  const windows: TableWindow[] = [];
  for (const table of LIBRARY_TABLE_KEYS) {
    const count = counts[table];
    if (typeof count !== "number" || !(count > safeOffset)) continue;
    windows.push({ table, from: safeOffset, to: Math.min(safeOffset + safeLimit, count) - 1 });
  }
  return windows;
}

/**
 * PGRST103 ("Requested range not satisfiable") means the window started past
 * the table's last row — e.g. rows deleted between the head count and the
 * read. That is an empty window, not a failure.
 */
export function isRangeNotSatisfiable(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "PGRST103";
}
