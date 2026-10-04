/**
 * Pure assembly of the GET /api/library/autocomplete body (tested in
 * facets.test.ts without a network).
 */

export type FacetSection = 'laws' | 'precedents' | 'orders' | 'feqh';

export interface FacetResult<T = unknown> {
  data?: T[] | null;
  count?: number | null;
  error: unknown;
}

export interface TopMatch {
  title: string;
  section: string;
  slug: string;
  snippet?: string;
}

export const AUTOCOMPLETE_UNAVAILABLE_MESSAGE = 'تعذّر جلب اقتراحات البحث.';
export const FACET_SECTIONS: readonly FacetSection[] = ['laws', 'precedents', 'orders', 'feqh'];
/** PostgREST max-rows: an `estimated` count at or below it is exact. */
export const FACET_COUNT_EXACT_UP_TO = 1000;
const MATCHES_PER_SECTION = 2;
const MAX_MATCHES = 6;

/**
 * A facet count, or null when its query failed. Before LIB-10 the route read
 * `.count || 0` and never looked at `.error`, so a statement timeout came back
 * as "0 results in this section". The /laws page only formats a count behind
 * `> 0` and otherwise falls back to its own local count, so null is safe there.
 */
export function facetCount(result: FacetResult | undefined): number | null {
  if (!result || result.error) return null;
  return typeof result.count === 'number' && Number.isFinite(result.count) ? result.count : 0;
}

/**
 * SEARCH COUNTS CONTRACT: true only when the count is proven exact. A
 * head-only `estimated` count has no page to prove anything, so only a
 * count PostgREST computed itself (<= max-rows) is exact; a failed (null)
 * count is never exact.
 */
export function facetCountExact(count: number | null): boolean {
  return typeof count === 'number' && count <= FACET_COUNT_EXACT_UP_TO;
}

/** countsExact for a body whose counts are all 0 or all null (no query ran / all failed). */
export function uniformCountsExact(value: boolean): Record<FacetSection, boolean> {
  return { laws: value, precedents: value, orders: value, feqh: value };
}

export function buildAutocompleteBody(input: {
  counts: Record<FacetSection, FacetResult>;
  matches: Array<{ result: FacetResult; items: TopMatch[] }>;
}): { status: number; body: Record<string, unknown> } {
  const counts: Record<FacetSection, number | null> = {
    laws: facetCount(input.counts.laws),
    precedents: facetCount(input.counts.precedents),
    orders: facetCount(input.counts.orders),
    feqh: facetCount(input.counts.feqh),
  };
  for (const [section, result] of Object.entries(input.counts)) {
    if (result?.error) console.error(`[Autocomplete] ${section} count failed:`, result.error);
  }
  const countsExact = {} as Record<FacetSection, boolean>;
  for (const k of FACET_SECTIONS) countsExact[k] = facetCountExact(counts[k]);
  // Same meaning as the search route's `degraded`: sections whose count failed.
  const degraded = FACET_SECTIONS.filter((k) => counts[k] === null);

  // The same title under two slugs (83 law titles are duplicated) showed up
  // twice in the dropdown; keep one per section + title.
  const seen = new Set<string>();
  const topMatches: TopMatch[] = [];
  let failedMatchQueries = 0;
  for (const { result, items } of input.matches) {
    if (result.error) {
      failedMatchQueries += 1;
      console.error('[Autocomplete] top-match query failed:', result.error);
    }
    let taken = 0;
    for (const item of items) {
      if (taken >= MATCHES_PER_SECTION) break;
      if (!item.title || !item.slug) continue;
      const key = `${item.section}\u0000${item.title.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      topMatches.push(item);
      taken += 1;
    }
  }

  const everyCountFailed = Object.values(counts).every((c) => c === null);
  if (everyCountFailed && failedMatchQueries === input.matches.length) {
    return {
      status: 503,
      body: {
        error: AUTOCOMPLETE_UNAVAILABLE_MESSAGE,
        code: 'autocomplete_unavailable',
        counts,
        countsExact,
        degraded,
        topMatches: [],
      },
    };
  }

  return {
    status: 200,
    body: {
      counts,
      topMatches: topMatches.slice(0, MAX_MATCHES), // Max 6 results for autocomplete
      countsExact,
      degraded,
      countsEstimated: true,
      // Counts above this are "more than 1000" (PostgREST estimated count).
      countsExactUpTo: 1000,
    },
  };
}
