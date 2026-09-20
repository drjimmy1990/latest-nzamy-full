import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLibraryAccessForUser } from '@/lib/access-control';
import {
  parseSearchQuery,
  SearchQuerySyntaxError,
  LIBRARY_FTS_CONFIG,
} from '@/utils/normalizeArabic';
import { libraryGate } from '@/lib/library-gate';
import { validateSearchRequest } from './filters';
import { truncateWithHighlight } from './snippet';
import { isFreeLibraryItem } from '@/lib/library-item-access';

/**
 * POST /api/library/search
 * Central search endpoint for the Legal Library.
 * Searches across all 4 sections.
 */

/** Keep section failures opaque and fail closed: never return partial search data. */
function searchUnavailableResponse(status = 503) {
  return NextResponse.json(
    { error: 'Search temporarily unavailable', code: 'search_unavailable' },
    { status },
  );
}

export async function POST(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const requestValidation = validateSearchRequest(await request.json());
    if (!requestValidation.ok) {
      return NextResponse.json(
        { error: requestValidation.error, code: requestValidation.code },
        { status: 400 },
      );
    }
    const { query, section, filters, page, limit } = requestValidation.request;

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      );
    }

    let parsed;
    try {
      parsed = parseSearchQuery(query);
    } catch (error) {
      if (error instanceof SearchQuerySyntaxError) {
        return NextResponse.json(
          {
            error: 'Invalid search syntax',
            code: error.code,
            index: error.index,
          },
          { status: 400 },
        );
      }
      throw error;
    }

    const supabase = await createClient();
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
    // defined in 20260626_legal_library_schema.sql. `parseSearchQuery` emits a
    // quoted, operator-safe PostgreSQL tsquery. Omitting `type` is deliberate:
    // supabase-js then sends the raw `fts` operator; `type: 'plain'` would call
    // plainto_tsquery and silently turn +, /, -, phrases and prefix operators
    // back into a bag of words. LIBRARY_FTS_CONFIG remains `simple`, matching
    // the lexemes stored by the schema-qualified `library.arabic` config.
    const ftsQuery = parsed.tsquery;

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
            .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

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
        // The fallback is exhausted: do not turn a failed required section
        // into a successful empty or partial search response.
        if (lawError) {
          console.error('[Search] laws query failed:', lawError);
          return searchUnavailableResponse();
        }
        if (!Array.isArray(lawResults)) {
          console.error('[Search] laws query returned invalid data');
          return searchUnavailableResponse();
        }
          results.laws = lawResults.map((r: Record<string, unknown>) => {
            const lawSlug = r.law_slug as string;
            const isFree = isFreeLibraryItem({ contentType: 'laws', itemId: lawSlug, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs });
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
      } catch (e) {
        console.error('[Search] Laws error:', e);
        return searchUnavailableResponse();
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
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

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
        if (precError) {
          console.error('[Search] precedents query failed:', precError);
          return searchUnavailableResponse();
        }
        if (!Array.isArray(precResults)) {
          console.error('[Search] precedents query returned invalid data');
          return searchUnavailableResponse();
        }
          results.precedents = precResults.map((r: Record<string, unknown>) => {
            const isFree = isFreeLibraryItem({ contentType: 'principles', itemId: r.id as string, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs });
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
      } catch (e) {
        console.error('[Search] Precedents error:', e);
        return searchUnavailableResponse();
      }
    }

    // --- ORDERS/DECREES SEARCH ---
    if (section === 'all' || section === 'orders') {
      try {
        let orderQuery = supabase
          .schema('library')
          .from('decrees_circulars')
          .select('id, title, type, issuer, ref, date, summary_brief, category, hashtags', { count: 'exact' })
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

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
        if (orderError) {
          console.error('[Search] orders query failed:', orderError);
          return searchUnavailableResponse();
        }
        if (!Array.isArray(orderResults)) {
          console.error('[Search] orders query returned invalid data');
          return searchUnavailableResponse();
        }
          results.orders = orderResults.map((r: Record<string, unknown>) => {
            const isFree = isFreeLibraryItem({ contentType: 'decrees', itemId: r.id as string, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs });
            const brief = r.summary_brief as string || '';
            return {
              id: r.id,
              section: 'orders',
              title: r.title,
              snippet: truncateWithHighlight(brief, parsed.plainTerms, snippetLen(isFree)),
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
      } catch (e) {
        console.error('[Search] Orders error:', e);
        return searchUnavailableResponse();
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
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

        if (section === 'feqh') {
          feqhQuery = feqhQuery.range(offset, offset + limit - 1);
        } else {
          feqhQuery = feqhQuery.limit(6);
        }

        const { data: feqhResults, count: feqhCount, error: feqhError } = await feqhQuery;
        if (feqhError) {
          console.error('[Search] feqh query failed:', feqhError);
          return searchUnavailableResponse();
        }
        if (!Array.isArray(feqhResults)) {
          console.error('[Search] feqh query returned invalid data');
          return searchUnavailableResponse();
        }
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
      } catch (e) {
        console.error('[Search] Feqh error:', e);
        return searchUnavailableResponse();
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
    return searchUnavailableResponse(500);
  }
}

