import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLibraryAccessForUser } from '@/lib/access-control';
import { parseSearchQuery, normalizeSearch, LIBRARY_FTS_CONFIG } from '@/utils/normalizeArabic';
import { libraryGate } from '@/lib/library-gate';

/**
 * POST /api/library/search
 * Central search endpoint for the Legal Library.
 * Searches across all 4 sections with operator support.
 */

interface SearchRequest {
  query: string;
  section: 'all' | 'laws' | 'precedents' | 'orders' | 'feqh';
  filters?: {
    category?: string;    // SA-XX category code
    track?: string;       // ordinary / admin / semi
    source?: string;      // sourceId for principles
    issuer?: string;      // decree issuer
    year?: number;        // Hijri year
    status?: string;      // active / amended / repealed
    type?: string;        // royal / cabinet / circular
    dateFrom?: string;    // Hijri date from
    dateTo?: string;      // Hijri date to
    lawType?: string;     // نظام / لائحة / etc
    court?: string;       // court name
    legalBranch?: string; // legal branch code
  };
  sort?: 'relevance' | 'date-desc' | 'date-asc' | 'alpha';
  page?: number;
  limit?: number;
}

export async function POST(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const body: SearchRequest = await request.json();
    const { query, section = 'all', filters = {}, sort = 'relevance', page = 1, limit = 10 } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const parsed = parseSearchQuery(query);
    const offset = (page - 1) * limit;

    // ── Paywall: read optional session + library access (guests → free tier).
    // Free users get a 100-char snippet (parity with /api/library/laws/[slug]'s
    // locked snippet); pro+ and whitelisted/free items get the full 200 chars.
    // Every result carries a `locked` flag so the client can show a lock icon.
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    const { hasFullAccess, whitelistedSlugs, freeItemsByType } = await getLibraryAccessForUser(userId);
    const freeItems = (type: string): string[] => (freeItemsByType[type] as string[]) ?? [];
    const snippetLen = (isFree: boolean) => (isFree ? 200 : 100);

    // Full-text search uses the generated `fts` tsvector columns (GIN-indexed)
    // defined in 20260626_legal_library_schema.sql, built with
    // `to_tsvector('library.arabic', ...)`. The query is tokenized with
    // LIBRARY_FTS_CONFIG, which produces the same lexemes as that config while
    // remaining expressible in a PostgREST filter — passing 'library.arabic'
    // itself is a parse error and was returning zero results for every search.
    // See the constant's own comment for the measurements.
    // Tokens preserve original Arabic forms, so the RAW query is passed here,
    // not the normalizeSearch-processed one; normalizeSearch is still applied
    // below for snippet highlighting.
    const ftsQuery = parsed.raw;

    // Collect results from each section
    const results: Record<string, unknown[]> = { laws: [], precedents: [], orders: [], feqh: [] };
    const counts: Record<string, number> = { laws: 0, precedents: 0, orders: 0, feqh: 0 };

    // --- LAWS SEARCH ---
    if (section === 'all' || section === 'laws') {
      try {
        // `original_text` arrives with migration 20260729_article_history_columns.
        // PostgREST rejects the WHOLE query when a selected column is missing,
        // and the catch below would turn that into a silent "0 law results" —
        // so the select is retried without it rather than made a hard deploy
        // ordering dependency. Drop this fallback once the migration is applied
        // everywhere.
        const LAW_COLUMNS = (withHistory: boolean) => `
            id, number, number_text, title, status, text,${withHistory ? ' original_text,' : ''}
            executive_reg_text, executive_reg_ref, law_slug,
            laws!inner ( slug, title, type, section_code, section_name )
          `;

        // A computed select string defeats PostgREST's literal-based row
        // inference, so the shape is declared here instead.
        type LawQueryResult = {
          data: Record<string, unknown>[] | null;
          count: number | null;
          error: { code?: string; message?: string } | null;
        };

        const runLawQuery = async (withHistory: boolean): Promise<LawQueryResult> => {
          let q = supabase
            .schema('library')
            .from('articles')
            .select(LAW_COLUMNS(withHistory), { count: 'exact' })
            .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' });

          // Apply filters
          if (filters.category) q = q.eq('laws.section_code', filters.category);
          if (filters.status) q = q.eq('status', filters.status);
          if (filters.lawType) q = q.eq('laws.type', filters.lawType);

          const res = section === 'laws'
            ? await q.range(offset, offset + limit - 1)
            : await q.limit(6);
          return res as unknown as LawQueryResult;
        };

        let { data: lawResults, count: lawCount, error: lawError } = await runLawQuery(true);
        // Retry on ANY error, not just code 42703. The same missing-column
        // rejection sometimes reaches the client as `{ message: 'Bad Request' }`
        // with no `code`, so matching on the code alone silently skipped the
        // retry. The fallback selects a strict subset of these columns, so
        // retrying is always safe; if it fails too, that error is reported below.
        if (lawError) {
          console.warn('[Search] laws query failed with original_text — retrying without it. Apply migration 20260729_article_history_columns.sql to remove this round-trip. Cause:', lawError);
          ({ data: lawResults, count: lawCount, error: lawError } = await runLawQuery(false));
        }
        // Surfaced, not swallowed. A silent `if (!error)` is what hid the
        // PGRST100 text-search-config failure: every query errored, every
        // section returned [], and the endpoint answered 200 with 0 results.
        if (lawError) console.error('[Search] laws query failed:', lawError);
        if (!lawError && lawResults) {
          results.laws = lawResults.map((r: Record<string, unknown>) => {
            const lawSlug = r.law_slug as string;
            const isFree = hasFullAccess || whitelistedSlugs.includes(lawSlug) || freeItems('laws').includes(lawSlug);
            return {
              id: r.id,
              section: 'laws',
              title: `${(r.laws as Record<string, unknown>)?.title} — ${r.number_text || `المادة ${r.number}`}`,
              // A repealed article has an empty `text` — its wording lives in
              // original_text (1,613 of the 1,862 repealed articles). Without
              // this fallback every repealed hit renders a blank snippet.
              // snippetLen(isFree) still applies, so the paywall is unchanged.
              snippet: truncateWithHighlight(
                (r.text as string) || (r.original_text as string) || '',
                parsed.plainTerms,
                snippetLen(isFree),
              ),
              locked: !isFree,
              meta: {
                lawTitle: (r.laws as Record<string, unknown>)?.title,
                articleNumber: r.number,
                status: r.status,
                lawSlug: r.law_slug,
              },
            };
          });
          counts.laws = lawCount || 0;
        }
      } catch (e) {
        console.error('[Search] Laws error:', e);
      }
    }

    // --- PRECEDENTS/PRINCIPLES SEARCH ---
    if (section === 'all' || section === 'precedents') {
      try {
        let precQuery = supabase
          .schema('library')
          .from('principles')
          .select(`
            id, principle_number, issuing_body, text, session_date, 
            decision_number, year_hijri,
            judicial_collections!inner ( id, title, court, track, source_id )
          `, { count: 'exact' })
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' });

        if (filters.track) {
          precQuery = precQuery.eq('judicial_collections.track', filters.track);
        }
        if (filters.source) {
          precQuery = precQuery.eq('judicial_collections.source_id', filters.source);
        }
        if (filters.year) {
          precQuery = precQuery.eq('year_hijri', filters.year);
        }
        if (filters.court) {
          precQuery = precQuery.eq('judicial_collections.court', filters.court);
        }

        if (section === 'precedents') {
          precQuery = precQuery.range(offset, offset + limit - 1);
        } else {
          precQuery = precQuery.limit(6);
        }

        const { data: precResults, count: precCount, error: precError } = await precQuery;
        // Surfaced, not swallowed. A silent `if (!error)` is what hid the
        // PGRST100 text-search-config failure: every query errored, every
        // section returned [], and the endpoint answered 200 with 0 results.
        if (precError) console.error('[Search] precedents query failed:', precError);
        if (!precError && precResults) {
          results.precedents = precResults.map((r: Record<string, unknown>) => {
            const isFree = hasFullAccess || freeItems('precedents').includes(r.id as string);
            return {
              id: r.id,
              section: 'precedents',
              title: `مبدأ رقم ${r.principle_number} — ${r.issuing_body}`,
              snippet: truncateWithHighlight(r.text as string, parsed.plainTerms, snippetLen(isFree)),
              locked: !isFree,
              meta: {
                court: (r.judicial_collections as Record<string, unknown>)?.court,
                sessionDate: r.session_date,
                decisionNumber: r.decision_number,
                collectionSlug: (r.judicial_collections as Record<string, unknown>)?.id,
                year: r.year_hijri,
              },
            };
          });
          counts.precedents = precCount || 0;
        }
      } catch (e) {
        console.error('[Search] Precedents error:', e);
      }
    }

    // --- ORDERS/DECREES SEARCH ---
    if (section === 'all' || section === 'orders') {
      try {
        let orderQuery = supabase
          .schema('library')
          .from('decrees_circulars')
          .select('id, title, type, issuer, ref, date, summary_brief, category, hashtags', { count: 'exact' })
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' });

        if (filters.issuer) {
          orderQuery = orderQuery.eq('issuer', filters.issuer);
        }
        if (filters.type) {
          orderQuery = orderQuery.eq('type', filters.type);
        }
        if (filters.category) {
          orderQuery = orderQuery.eq('category', filters.category);
        }

        if (section === 'orders') {
          orderQuery = orderQuery.range(offset, offset + limit - 1);
        } else {
          orderQuery = orderQuery.limit(6);
        }

        const { data: orderResults, count: orderCount, error: orderError } = await orderQuery;
        // Surfaced, not swallowed. A silent `if (!error)` is what hid the
        // PGRST100 text-search-config failure: every query errored, every
        // section returned [], and the endpoint answered 200 with 0 results.
        if (orderError) console.error('[Search] orders query failed:', orderError);
        if (!orderError && orderResults) {
          results.orders = orderResults.map((r: Record<string, unknown>) => {
            const isFree = hasFullAccess || freeItems('orders').includes(r.id as string);
            const brief = r.summary_brief as string || '';
            return {
              id: r.id,
              section: 'orders',
              title: r.title,
              snippet: isFree ? brief : brief.slice(0, 100) + (brief.length > 100 ? '...' : ''),
              locked: !isFree,
              meta: {
                type: r.type,
                issuer: r.issuer,
                ref: r.ref,
                date: r.date,
                hashtags: r.hashtags,
              },
            };
          });
          counts.orders = orderCount || 0;
        }
      } catch (e) {
        console.error('[Search] Orders error:', e);
      }
    }

    // --- FEQH SEARCH ---
    if (section === 'all' || section === 'feqh') {
      try {
        let feqhQuery = supabase
          .schema('library')
          .from('feqh_blocks')
          .select(`
            id, topic, matn, sharh, volume_number, page_number,
            feqh_sections!inner ( 
              id, title,
              feqh_chapters!inner (
                id, title,
                feqh_books!inner ( id, title, author, school, type )
              )
            )
          `, { count: 'exact' })
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG, type: 'plain' });

        if (section === 'feqh') {
          feqhQuery = feqhQuery.range(offset, offset + limit - 1);
        } else {
          feqhQuery = feqhQuery.limit(6);
        }

        const { data: feqhResults, count: feqhCount, error: feqhError } = await feqhQuery;
        // Surfaced, not swallowed. A silent `if (!error)` is what hid the
        // PGRST100 text-search-config failure: every query errored, every
        // section returned [], and the endpoint answered 200 with 0 results.
        if (feqhError) console.error('[Search] feqh query failed:', feqhError);
        if (!feqhError && feqhResults) {
          results.feqh = feqhResults.map((r: Record<string, unknown>) => {
            const section = r.feqh_sections as Record<string, unknown>;
            const chapter = section?.feqh_chapters as Record<string, unknown>;
            const book = chapter?.feqh_books as Record<string, unknown>;
            const isFree = hasFullAccess || freeItems('feqh').includes(r.id as string);
            return {
              id: r.id,
              section: 'feqh',
              title: `${book?.title} — ${r.topic}`,
              snippet: truncateWithHighlight((r.sharh || r.matn) as string, parsed.plainTerms, snippetLen(isFree)),
              locked: !isFree,
              meta: {
                bookTitle: book?.title,
                bookSlug: book?.id,
                chapter: chapter?.title,
                page: r.page_number,
                volume: r.volume_number,
              },
            };
          });
          counts.feqh = feqhCount || 0;
        }
      } catch (e) {
        console.error('[Search] Feqh error:', e);
      }
    }

    // Sort results
    const allResults = section === 'all'
      ? [...results.laws, ...results.precedents, ...results.orders, ...results.feqh]
      : results[section] || [];

    return NextResponse.json({
      results: allResults,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      page,
      query: parsed.raw,
    });
  } catch (error) {
    console.error('[Search] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** Truncate text around the first match, preserving word boundaries.
 *  Matching is done on normalized text (أ→ا, ة→ه, ى→ي, digits) so that a query
 *  for `الإثبات` centers the snippet on stored `الاثبات`. Slice indices map
 *  back to the original text because normalization is 1:1 per character. */
function truncateWithHighlight(text: string | null, terms: string[], maxLength: number): string {
  if (!text) return '';
  if (!terms.length) return text.slice(0, maxLength);

  const normText = normalizeSearch(text);
  const firstTerm = normalizeSearch(terms[0]);
  const matchIndex = normText.indexOf(firstTerm);

  if (matchIndex === -1) return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');

  // Center the snippet around the match.
  // Normalization is character-by-character 1:1, so normText indices map
  // directly back to original-text indices.
  const contextBefore = Math.max(0, matchIndex - Math.floor(maxLength / 3));
  const contextAfter = Math.min(text.length, matchIndex + firstTerm.length + Math.floor(maxLength * 2 / 3));

  let snippet = text.slice(contextBefore, contextAfter);
  if (contextBefore > 0) snippet = '...' + snippet;
  if (contextAfter < text.length) snippet = snippet + '...';

  return snippet;
}
