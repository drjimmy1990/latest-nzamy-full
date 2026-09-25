import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { libraryGate } from '@/lib/library-gate';
import { LIBRARY_FTS_CONFIG } from '@/utils/normalizeArabic';
import { fetchLawTitleHits } from '../search/lawTitleHits';
import { buildAutocompleteBody, uniformCountsExact, type FacetResult, type TopMatch } from './facets';

/** Client-side ceiling; the anon statement_timeout (~3s) normally fires first. */
const AUTOCOMPLETE_BUDGET_MS = 4000;

/**
 * GET /api/library/autocomplete?q=بطلان
 * Fast cross-section autocomplete with faceted counts.
 * Returns section counts + top 6 matching items.
 *
 * Counts are `estimated` (exact under 1000 matches, planner estimate above):
 * four exact counts over 10^4-10^5-row match sets cost 1-3.5s under the anon
 * role's ~3s statement_timeout. A count whose query FAILED is returned as
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

    if (!query || query.length < 2) {
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
    // built with `to_tsvector('library.arabic', ...)`. Queried with
    // LIBRARY_FTS_CONFIG, which yields the same lexemes as that config but is
    // expressible in a PostgREST filter — 'library.arabic' itself is a parse
    // error and made every autocomplete return nothing. The config does not
    // normalize Arabic forms, so the raw query is used as-is.
    const ftsQuery = query;
    const plainTerms = query.split(/\s+/).filter(Boolean);

    const count = (table: string) => supabase
      .schema('library')
      .from(table)
      .select('id', { count: 'estimated', head: true })
      .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' })
      .abortSignal(signal);

    // Run all queries in parallel for speed
    const [lawsCount, precedentsCount, ordersCount, feqhCount, topLaws, topPrecedents, topOrders] = await Promise.all([
      count('articles'),
      count('principles'),
      count('decrees_circulars'),
      count('feqh_blocks'),

      // Top 2 law matches — title-first (the Labor Law for «نظام العمل»),
      // falling back to plain full-text matches when no title carries the query.
      (async (): Promise<FacetResult<Record<string, unknown>>> => {
        const ranked = await fetchLawTitleHits(supabase, {
          ftsQuery,
          ftsType: 'plain',
          rawQuery: query,
          terms: plainTerms,
          max: 2,
          signal,
        }).catch(() => []);
        if (ranked.length >= 2) return { data: ranked as unknown as Record<string, unknown>[], error: null };
        const plain = await supabase
          .schema('library')
          .from('laws')
          .select('slug, title, type')
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' })
          .order('slug')
          .limit(4)
          .abortSignal(signal);
        return {
          data: [...(ranked as unknown as Record<string, unknown>[]), ...((plain.data as Record<string, unknown>[] | null) ?? [])],
          error: ranked.length > 0 ? null : plain.error,
        };
      })(),

      // Top 2 principle matches
      supabase
        .schema('library')
        .from('principles')
        .select('id, principle_number, issuing_body, text')
        .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' })
        .order('id')
        .limit(2)
        .abortSignal(signal),

      // Top 2 decree matches
      supabase
        .schema('library')
        .from('decrees_circulars')
        .select('id, title, type, ref')
        .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' })
        .order('id')
        .limit(4)
        .abortSignal(signal),
    ]);

    const lawMatches: TopMatch[] = ((topLaws.data ?? []) as Record<string, unknown>[]).map((law) => ({
      title: law.title as string,
      section: 'laws',
      slug: law.slug as string,
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

    const built = buildAutocompleteBody({
      counts: {
        laws: lawsCount,
        precedents: precedentsCount,
        orders: ordersCount,
        feqh: feqhCount,
      },
      matches: [
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
