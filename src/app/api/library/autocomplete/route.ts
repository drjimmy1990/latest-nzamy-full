import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { libraryGate } from '@/lib/library-gate';
import { LIBRARY_FTS_CONFIG, parseAutocompleteQuery } from '@/utils/normalizeArabic';
import { fetchLawTitleHits } from '../search/lawTitleHits';
import { fetchBookTitleHits } from '../search/bookTitleHits';
import { fetchCollectionTitleHits } from '../search/collectionTitleHits';
import { isMissingFunctionError, rpcPageResult } from '../search/searchPlan';
import { buildAutocompleteBody, uniformCountsExact, type FacetResult, type TopMatch } from './facets';

/**
 * Client-side ceiling. It only ends this route's wait: aborting does not stop
 * the query in Postgres. The anon statement_timeout (~3s) bounds the queries
 * on the request client (decrees, laws, catalogue titles) — NOT the articles
 * and fiqh counts, which run as the service role with no statement_timeout
 * (20261004_01, 20261018_02, 20261025_41). What keeps those cheap is the
 * tsquery itself: parseAutocompleteQuery sends positive words only, AND-ed,
 * with no short prefix — always a GIN-index lookup. The principles count and
 * top two go through a principles window function with its own 4s limit
 * (PRINCIPLES_RPCS).
 */
const AUTOCOMPLETE_BUDGET_MS = 4000;

/**
 * Principles windows with their own 4s statement_timeout, in the order tried:
 * the relevance window (20261026_52: one GIN scan, its top two the most
 * relevant), then the id window (20261017_20, whose collection join reads
 * every principle once the library holds hundreds of collections). Each is
 * remembered as missing for 10 minutes after a PGRST202 / 42883.
 */
const PRINCIPLES_RPCS = ['search_principles_relevance', 'search_principles_page'] as const;
const PRINCIPLES_RPC_RETRY_MS = 10 * 60 * 1000;
const principlesRpcMissingUntil: Record<(typeof PRINCIPLES_RPCS)[number], number> = {
  search_principles_relevance: 0,
  search_principles_page: 0,
};

/**
 * GET /api/library/autocomplete?q=بطلان
 * Fast cross-section autocomplete with faceted counts.
 * Returns section counts + top 6 matching items.
 *
 * Counts are `estimated` (exact under 1000 matches, planner estimate above):
 * four exact counts over 10^4-10^5-row match sets cost 1-3.5s. The principles
 * count is the exact total from library.search_principles_page (4s limit);
 * it is still reported exact only up to 1000. A count whose query FAILED is returned as
 * null, never as 0 (LIB-10): 0 claims "no results in this section".
 * `countsExact[section]` is true only for a proven-exact count (<= 1000);
 * a failed section is also listed in `degraded` (SEARCH COUNTS CONTRACT).
 * Top matches are ordered by primary key, so they are stable per query.
 */
export async function GET(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const parsed = query && query.length >= 2 ? parseAutocompleteQuery(query) : null;

    if (!query || query.length < 2 || !parsed || !parsed.tsquery) {
      return NextResponse.json({
        counts: { laws: 0, precedents: 0, orders: 0, feqh: 0 },
        countsExact: uniformCountsExact(true),
        degraded: [],
        topMatches: [],
      });
    }

    const supabase = await createClient();
    const signal = AbortSignal.timeout(AUTOCOMPLETE_BUDGET_MS);
    // Full-text search on the generated `fts` tsvector columns (GIN-indexed),
    // built with `to_tsvector('library.arabic', ...)`. `parseAutocompleteQuery`
    // emits the POSITIVE words only, AND-ed, each with its Arabic spellings and
    // both numeral forms (٠-٩ ↔ 0-9): no `!`, no `|` between words, no prefix
    // on a 1–2 letter stem — a `-word` is dropped, never searched for.
    const ftsQuery = parsed.tsquery;
    const plainTerms = parsed.plainTerms;
    // The title lookups read the raw text: give them the kept words only, so
    // a negated word («-نظام») never surfaces a title either.
    const titleQuery = plainTerms.join(' ');

    const serverOnly = await createServiceClient();

    const count = (table: string, client: typeof supabase | typeof serverOnly = supabase) => client
      .schema('library')
      .from(table)
      .select('id', { count: 'estimated', head: true })
      .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG })
      .abortSignal(signal);

    // Principles: the count and the top two in one call through a principles
    // window function (PRINCIPLES_RPCS), under its own 4s statement_timeout.
    // The inline id-ordered limit-2 query below made a rare word walk the
    // whole primary key as the service role (no statement_timeout) — measured
    // in Docker on 110k rows: 109,991 rows removed by the filter. The inline
    // pair stays only while both functions are missing (PGRST202 / 42883).
    // The window's count is exact: for a common word it costs what the
    // search's precedents count costs (bounded at 4s), on every keystroke.
    const principlesFacet = async (): Promise<{ count: FacetResult; top: FacetResult<Record<string, unknown>> }> => {
      for (const fn of PRINCIPLES_RPCS) {
        if (Date.now() < principlesRpcMissingUntil[fn]) continue;
        const rpc = await serverOnly
          .schema('library')
          .rpc(fn, { p_tsquery: ftsQuery, p_offset: 0, p_fetch: 2 })
          .abortSignal(signal);
        if (!isMissingFunctionError(rpc.error)) {
          const page = rpcPageResult(rpc);
          const error = page.error ?? (page.data && page.count !== null ? null : { message: `invalid ${fn} answer` });
          return { count: { count: page.count, error }, top: { data: page.data, error } };
        }
        principlesRpcMissingUntil[fn] = Date.now() + PRINCIPLES_RPC_RETRY_MS;
      }
      const [principlesCount, principlesTop] = await Promise.all([
        count('principles', serverOnly),
        // Top 2 principle matches (server-only since 20261016_01)
        serverOnly
          .schema('library')
          .from('principles')
          .select('id, principle_number, issuing_body, text')
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG })
          .order('id')
          .limit(2)
          .abortSignal(signal),
      ]);
      return { count: principlesCount, top: principlesTop as FacetResult<Record<string, unknown>> };
    };

    // Run all queries in parallel for speed. Round trips per request: 3 counts
    // + 1 principles call (count and top two; 2 round trips while its
    // function is missing)
    // + law titles (≤ 6 lookups, ≤ 14 when the query has digits — see
    // MAX_TITLE_DIGIT_VARIANTS — plus 1 full-text fallback, run after them,
    // when fewer than 2 title hits)
    // + 1 decrees + 1 book titles + 1 collection titles.
    // Without digits ≤ 14; with ≤ 22.
    const [lawsCount, principles, ordersCount, feqhCount, topLaws, topOrders, topBooks, topCollections] = await Promise.all([
      count('articles', serverOnly),
      principlesFacet(),
      count('decrees_circulars'),
      count('feqh_blocks', serverOnly),

      // Top 2 law matches — title-first (the Labor Law for «نظام العمل»),
      // falling back to full-text matches when no title carries the query.
      (async (): Promise<FacetResult<Record<string, unknown>>> => {
        const ranked = await fetchLawTitleHits(supabase, {
          ftsQuery,
          rawQuery: titleQuery,
          terms: plainTerms,
          max: 2,
          signal,
        }).catch(() => []);
        if (ranked.length >= 2) return { data: ranked as unknown as Record<string, unknown>[], error: null };
        const plain = await supabase
          .schema('library')
          .from('laws')
          .select('slug, title, type')
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG })
          .order('slug')
          .limit(4)
          .abortSignal(signal);
        return {
          data: [...(ranked as unknown as Record<string, unknown>[]), ...((plain.data as Record<string, unknown>[] | null) ?? [])],
          error: ranked.length > 0 ? null : plain.error,
        };
      })(),

      // Top 2 decree matches
      supabase
        .schema('library')
        .from('decrees_circulars')
        .select('id, title, type, ref')
        .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG })
        .order('id')
        .limit(4)
        .abortSignal(signal),

      // Books whose title carries the query. Public catalogue columns.
      fetchBookTitleHits(supabase, titleQuery, 2, signal),

      // Judicial collections whose title carries the query («المبادئ والقرارات»).
      fetchCollectionTitleHits(supabase, titleQuery, { max: 2, signal }),
    ]);
    const precedentsCount = principles.count;
    const topPrecedents = principles.top;

    const lawMatches: TopMatch[] = ((topLaws.data ?? []) as Record<string, unknown>[]).map((law) => ({
      title: law.title as string,
      section: 'laws',
      slug: law.slug as string,
    }));
    const collectionMatches: TopMatch[] = topCollections.hits.map((col) => ({
      title: col.title,
      section: 'precedents',
      slug: col.id,
      snippet: col.court || undefined,
    }));
    const precedentMatches: TopMatch[] = ((topPrecedents.data ?? []) as Record<string, unknown>[]).map((p) => {
      const text = p.text as string;
      return {
        title: `مبدأ رقم ${p.principle_number} — ${p.issuing_body}`,
        section: 'precedents',
        slug: p.id as string,
        snippet: text?.slice(0, 120) + (text?.length > 120 ? '...' : ''),
      };
    });
    const orderMatches: TopMatch[] = ((topOrders.data ?? []) as Record<string, unknown>[]).map((o) => ({
      title: o.title as string,
      section: 'orders',
      slug: o.id as string,
    }));

    const bookMatches: TopMatch[] = topBooks.hits.map((b) => ({
      title: b.title,
      section: 'feqh',
      slug: b.slug,
      snippet: [b.author, b.volumesLabel].filter(Boolean).join(' · ') || undefined,
    }));

    const mergedPrecedentsCount = precedentsCount.error
      ? precedentsCount
      : { count: (precedentsCount.count ?? 0) + topCollections.hits.length, error: null };

    const built = buildAutocompleteBody({
      counts: {
        laws: lawsCount,
        precedents: mergedPrecedentsCount,
        orders: ordersCount,
        feqh: feqhCount,
      },
      matches: [
        // Catalogue titles named by the query are the strongest suggestions: first.
        { result: { count: null, error: topBooks.error }, items: bookMatches },
        { result: { count: null, error: topCollections.error }, items: collectionMatches },
        { result: topLaws, items: lawMatches },
        { result: topPrecedents, items: precedentMatches },
        { result: topOrders, items: orderMatches },
      ],
    });
    return NextResponse.json(built.body, { status: built.status });
  } catch (error) {
    console.error('[Autocomplete] Error:', error);
    return NextResponse.json(
      {
        error: 'تعذّر جلب اقتراحات البحث.',
        counts: { laws: null, precedents: null, orders: null, feqh: null },
        countsExact: uniformCountsExact(false),
        degraded: ['laws', 'precedents', 'orders', 'feqh'],
        topMatches: [],
      },
      { status: 500 }
    );
  }
}
