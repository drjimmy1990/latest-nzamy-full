import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLibraryAccessForUser } from '@/lib/access-control';
import {
  parseSearchQuery,
  SearchQuerySyntaxError,
  LIBRARY_FTS_CONFIG,
} from '@/utils/normalizeArabic';
import { libraryGate } from '@/lib/library-gate';
import { categoryStoredSpellings, validateSearchRequest } from './filters';
import { truncateWithHighlight } from './snippet';
import { isFreeLibraryItem } from '@/lib/library-item-access';
import {
  ALL_SECTION_PREVIEW,
  fetchSizeFor,
  LAW_TITLE_HITS_ALL,
  SEARCH_UNAVAILABLE_MESSAGE,
  SINGLE_TERM_TITLE_MAX,
  combineSearchOutcomes,
  dedupeResults,
  lawFetchWindow,
  lawPageArticles,
  lawTitleSlots,
  orderRowsByIds,
  rankedLawOrderApplies,
  readPage,
  sectionCount,
  shouldRetryLawsWithoutHistory,
  type SearchResultItem,
  type SearchSectionName,
  type SectionOutcome,
} from './searchPlan';
import { fetchLawTitleHitsChecked, type LawTitleHitsResult } from './lawTitleHits';

/**
 * POST /api/library/search
 * Central search endpoint for the Legal Library.
 * Searches across all 4 sections.
 *
 * Scale notes (library ~15x larger since 2026-09-25, LIB-01/LIB-11):
 * - the sections run in parallel, each bounded by SECTION_BUDGET_MS;
 * - counts are `estimated` (exact under 1000 matches, planner estimate above);
 *   searchPlan.sectionCount turns them into what the section lists, and
 *   `countsExact` says per section whether that number is proven exact;
 * - every section query is ordered by `id` (the table's primary key), so a
 *   page is a stable window: the same request returns the same rows and
 *   consecutive pages neither repeat nor skip rows. The ranked RPC orders
 *   only the section=all preview (searchPlan.rankedLawOrderApplies);
 * - a page past the end of the match set is an empty page with the proven
 *   total (PostgREST PGRST103, searchPlan.readPage), never a 503;
 * - section=all degrades: a failed section is reported in `degraded` and the
 *   others are still returned; a single-section request still fails closed;
 * - page depth is capped in filters.ts (SEARCH_MAX_DEPTH) for single-section
 *   requests (section=all ignores `page`);
 * - law title hits count inside `limit` and inside `counts.laws`
 *   (searchPlan.lawTitleSlots / lawFetchWindow / lawPageArticles); the
 *   number of hits is also returned as `lawTitleHits`.
 */

/** Keep section failures opaque and fail closed: never return a partial single-section response. */
function searchUnavailableResponse(status = 503) {
  return NextResponse.json(
    { error: SEARCH_UNAVAILABLE_MESSAGE, code: 'search_unavailable' },
    { status },
  );
}

/**
 * Client-side ceiling per section. The anon role's statement_timeout (~3s)
 * normally cancels a slow query first; this bounds a hung connection.
 */
const SECTION_BUDGET_MS = 4500;

/** Ranked-order RPC (migration 20260925_01); remembered as missing for 10 minutes. */
const RANKED_RPC = 'search_law_articles_ranked';
const RANKED_RPC_RETRY_MS = 10 * 60 * 1000;
const RANKED_RPC_BUDGET_MS = 1500;
let rankedRpcMissingUntil = 0;

type QueryError = { code?: string; message?: string; details?: string | null } | null;
type RowsResult = { data: Record<string, unknown>[] | null; count: number | null; error: QueryError };
type HeadCount = () => PromiseLike<{ count: number | null; error: unknown }>;
type SettledPage = { rows: Record<string, unknown>[]; count: number | null };

/**
 * One section page → its rows and PostgREST count, or null when the section
 * failed. A page past the end (PGRST103) is an empty page whose count is the
 * total from the error, or from a head count with the same filters when the
 * error does not carry it.
 */
async function settlePage(label: SearchSectionName, res: RowsResult, headCount: HeadCount): Promise<SettledPage | null> {
  const read = readPage<Record<string, unknown>>(res);
  if (read.kind === 'failed') {
    console.error(`[Search] ${label} query failed:`, res.error ?? 'invalid data');
    return null;
  }
  if (read.kind === 'rows') return { rows: read.rows, count: read.count };
  let total = read.total;
  if (total === null) {
    const head = await headCount();
    total = !head.error && typeof head.count === 'number' ? head.count : null;
  }
  if (total === null) {
    console.error(`[Search] ${label}: page past the end, and the total could not be counted`);
    return null;
  }
  return { rows: [], count: total };
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
        { error: 'اكتب حرفين على الأقل للبحث.', code: 'query_too_short' },
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
            error: 'صيغة البحث غير صحيحة. راجع علامات التنصيص والأقواس والعوامل.',
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

    // Law title hits (LIB-11): at most `titleMax`, from the request alone.
    // section=all looks them up with the same bound as section=laws so both
    // report the same counts.laws; its preview shows LAW_TITLE_HITS_ALL.
    const titleMax = lawTitleSlots({
      hasStatusFilter: Boolean(filters.status),
      terms: parsed.plainTerms,
      limit: section === 'laws' ? limit : Number.MAX_SAFE_INTEGER,
    });

    // section=all shows a 6-row preview per section from offset 0; a single
    // section shows the requested page. section=laws fetches its article
    // window independently of how many title hits exist (lawFetchWindow)
    // and places the rows once the hits are known (lawPageArticles).
    const window = (name: SearchSectionName) => {
      if (section !== name) return { from: 0, size: ALL_SECTION_PREVIEW };
      if (name === 'laws') return lawFetchWindow(page, limit, titleMax);
      return { from: offset, size: limit };
    };

    // Filled by runLaws: the title hits counted in counts.laws.
    let lawTitleHitCount = 0;

    // --- LAWS SEARCH ---
    const runLaws = async (): Promise<SectionOutcome> => {
      const signal = AbortSignal.timeout(SECTION_BUDGET_MS);
      const { from, size } = window('laws');
      try {
        // Only the columns the mapping below reads: an article `text` can be a
        // whole scanned page, and 50 rows with executive_reg_text as well
        // measured 2.3 MB from PostgREST.
        // `original_text` arrives with migration 20260729_article_history_columns.
        // PostgREST rejects the WHOLE query when a selected column is missing,
        // so the select is retried without it rather than made a hard deploy
        // ordering dependency. Drop this fallback once the migration is applied
        // everywhere.
        const LAW_COLUMNS = (withHistory: boolean) => `
            id, number, number_text, status, text,${withHistory ? ' original_text,' : ''} law_slug,
            laws!inner ( slug, title, type, section_code, section_name )
          `;

        const lawQuery = (withHistory: boolean, head = false) => {
          let q = supabase
            .schema('library')
            .from('articles')
            .select(LAW_COLUMNS(withHistory), { count: 'estimated', head })
            .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

          // Apply filters (category arrives as the bare stored code, filters.ts)
          if (filters.category) q = q.eq('laws.section_code', filters.category);
          if (filters.status) q = q.eq('status', filters.status);
          if (filters.lawType) q = q.eq('laws.type', filters.lawType);
          return q;
        };

        const runLawQuery = async (withHistory: boolean): Promise<RowsResult> => {
          // Primary-key order: a stable window for every page.
          const res = await lawQuery(withHistory).order('id').range(from, from + fetchSizeFor(size) - 1).abortSignal(signal);
          // A computed select string defeats PostgREST's literal-based row
          // inference, so the shape is declared here instead.
          return res as unknown as RowsResult;
        };

        // Ranked ids: the section=all preview only. section=laws keeps the
        // id order on every page (a ranked page 1 would not continue into an
        // id-ordered page 2). null → use the plain order.
        const rankedIds = async (): Promise<string[] | null> => {
          if (!rankedLawOrderApplies(section) || from !== 0 || Date.now() < rankedRpcMissingUntil) return null;
          const { data, error } = await supabase
            .schema('library')
            .rpc(RANKED_RPC, {
              p_tsquery: ftsQuery,
              p_section_code: filters.category ?? null,
              p_status: filters.status ?? null,
              p_law_type: filters.lawType ?? null,
              p_limit: size,
              p_offset: from,
            })
            // Ranking is an improvement, not a requirement: give it a short
            // budget of its own so it can never hold the section near the
            // statement timeout (the plain order is used instead).
            .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(RANKED_RPC_BUDGET_MS)]));
          if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') {
              rankedRpcMissingUntil = Date.now() + RANKED_RPC_RETRY_MS;
            } else {
              console.warn('[Search] ranked law search failed; using unranked order:', error);
            }
            return null;
          }
          if (!Array.isArray(data)) return null;
          return (data as Array<{ id?: unknown }>).map((r) => String(r.id)).filter(Boolean);
        };

        const [base, ranked, title] = await Promise.all([
          (async () => {
            let res = await runLawQuery(true);
            // Retry without original_text on a rejected select — never on a
            // timeout (it only doubles the wait) and never on a page past the
            // end (PGRST103 is not a column problem).
            if (shouldRetryLawsWithoutHistory(res.error)) {
              console.warn('[Search] laws query failed with original_text — retrying without it. Apply migration 20260729_article_history_columns.sql to remove this round-trip. Cause:', res.error);
              res = await runLawQuery(false);
            }
            return res;
          })(),
          rankedIds().catch((e) => {
            console.warn('[Search] ranked law search threw; using unranked order:', e);
            return null;
          }),
          fetchLawTitleHitsChecked(supabase, {
            ftsQuery,
            rawQuery: parsed.raw,
            terms: parsed.plainTerms,
            max: titleMax,
            sectionCode: filters.category,
            lawType: filters.lawType,
            signal,
            // «نظام» alone is in ~1,000 titles: no arbitrary title hits.
            broadSingleTermMax: SINGLE_TERM_TITLE_MAX,
          }).catch((e): LawTitleHitsResult => {
            console.warn('[Search] law title hits threw:', e);
            return { hits: [], complete: false };
          }),
        ]);

        // Pages 2+ place their articles by the number of title hits, which
        // page 1 listed: an unanswered lookup could shift the window.
        if (section === 'laws' && page > 1 && !title.complete) {
          console.error('[Search] law title lookups failed on a later page; its window cannot be placed');
          return { ok: false };
        }

        const settled = await settlePage('laws', base, () =>
          lawQuery(false, true).abortSignal(signal) as unknown as ReturnType<HeadCount>);
        if (!settled) return { ok: false };
        const lawResults = settled.rows;

        let articleRows: Record<string, unknown>[] = lawResults;
        if (ranked && ranked.length > 0) {
          const byIds = await supabase
            .schema('library')
            .from('articles')
            .select(LAW_COLUMNS(true))
            .in('id', ranked)
            .abortSignal(signal);
          if (!byIds.error && Array.isArray(byIds.data)) {
            articleRows = orderRowsByIds(byIds.data as unknown as Record<string, unknown>[], ranked);
          } else {
            console.warn('[Search] ranked rows fetch failed; using unranked order:', byIds.error);
          }
        }

        const titleHits = title.hits;
        const lawTitleItems: SearchResultItem[] = titleHits.map((law) => {
          const isFree = isFreeLibraryItem({ contentType: 'laws', itemId: law.slug, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs });
          return {
            id: `law:${law.slug}`,
            section: 'laws',
            title: law.title,
            snippet: truncateWithHighlight(law.description || '', parsed.plainTerms, snippetLen(isFree)),
            locked: !isFree,
            meta: {
              kind: 'law',
              lawTitle: law.title,
              lawSlug: law.slug,
              lawType: law.type,
              sectionCode: law.section_code ? `SA-${law.section_code}` : undefined,
            },
          };
        });

        const articleItems: SearchResultItem[] = articleRows.map((r: Record<string, unknown>) => {
          const lawSlug = r.law_slug as string;
          const law = r.laws as Record<string, unknown> | undefined;
          const isFree = isFreeLibraryItem({ contentType: 'laws', itemId: lawSlug, hasFullAccess, freeItemsByType, whitelistedLawSlugs: whitelistedSlugs });
          return {
            id: r.id,
            section: 'laws',
            title: `${law?.title} — ${r.number_text || `المادة ${r.number}`}`,
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
              kind: 'article',
              lawTitle: law?.title,
              articleNumber: r.number,
              status: r.status,
              lawSlug: r.law_slug,
              lawType: law?.type,
              sectionCode: law?.section_code ? `SA-${law.section_code}` : undefined,
            },
          };
        });

        // section=laws: page 1 lists the hits then limit - hits articles; a
        // later page lists the articles after them (lawPageArticles). Never
        // more rows than requested. section=all: a 2-hit preview.
        const k = titleHits.length;
        const shownHits = section === 'laws'
          ? (page === 1 ? lawTitleItems : [])
          : lawTitleItems.slice(0, LAW_TITLE_HITS_ALL);
        const shownArticles = section === 'laws'
          ? lawPageArticles(articleItems, page, limit, titleMax, k)
          : articleItems;
        const results = dedupeResults([...shownHits, ...shownArticles])
          .slice(0, section === 'laws' ? limit : ALL_SECTION_PREVIEW);
        // counts.laws is what the section lists: the article matches plus the
        // title hits, on every page (lawTitleHits carries the hits alone).
        lawTitleHitCount = k;
        return {
          ok: true,
          results,
          ...sectionCount({
            estimate: settled.count,
            offset: from,
            rawRows: lawResults.length,
            requested: fetchSizeFor(size),
            extra: k,
            listedWhenComplete: k + dedupeResults(articleItems).length,
          }),
        };
      } catch (e) {
        console.error('[Search] Laws error:', e);
        return { ok: false };
      }
    };

    // --- PRECEDENTS/PRINCIPLES SEARCH ---
    const runPrecedents = async (): Promise<SectionOutcome> => {
      const { from, size } = window('precedents');
      const signal = AbortSignal.timeout(SECTION_BUDGET_MS);
      try {
        const precQuery = (head = false) => {
          let q = supabase
            .schema('library')
            .from('principles')
            .select(`
            id, principle_number, issuing_body, text, session_date,
            decision_number, year_hijri,
            judicial_collections!inner ( id, title, court, track, source_id )
          `, { count: 'estimated', head })
            .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

          if (filters.track) q = q.eq('judicial_collections.track', filters.track);
          if (filters.source) q = q.eq('judicial_collections.source_id', filters.source);
          if (filters.year) q = q.eq('year_hijri', filters.year);
          if (filters.court) q = q.eq('judicial_collections.court', filters.court);
          return q;
        };

        const res = await precQuery()
          .order('id')
          .range(from, from + fetchSizeFor(size) - 1)
          .abortSignal(signal);
        const settled = await settlePage('precedents', res as unknown as RowsResult, () => precQuery(true).abortSignal(signal));
        if (!settled) return { ok: false };
        const precResults = settled.rows;
        const results: SearchResultItem[] = precResults.map((r: Record<string, unknown>) => {
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
        const deduped = dedupeResults(results);
        return {
          ok: true,
          results: deduped.slice(0, size),
          ...sectionCount({ estimate: settled.count, offset: from, rawRows: precResults.length, requested: fetchSizeFor(size), listedWhenComplete: deduped.length }),
        };
      } catch (e) {
        console.error('[Search] Precedents error:', e);
        return { ok: false };
      }
    };

    // --- ORDERS/DECREES SEARCH ---
    const runOrders = async (): Promise<SectionOutcome> => {
      const { from, size } = window('orders');
      const signal = AbortSignal.timeout(SECTION_BUDGET_MS);
      try {
        const orderQuery = (head = false) => {
          let q = supabase
            .schema('library')
            .from('decrees_circulars')
            .select('id, title, type, issuer, ref, date, summary_brief, category, hashtags', { count: 'estimated', head })
            .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

          if (filters.issuer) q = q.eq('issuer', filters.issuer);
          if (filters.type) q = q.eq('type', filters.type);
          // Some decrees store the unpadded code ('8' next to '08').
          if (filters.category) q = q.in('category', categoryStoredSpellings(filters.category));
          return q;
        };

        const res = await orderQuery()
          .order('id')
          .range(from, from + fetchSizeFor(size) - 1)
          .abortSignal(signal);
        const settled = await settlePage('orders', res as unknown as RowsResult, () => orderQuery(true).abortSignal(signal));
        if (!settled) return { ok: false };
        const orderResults = settled.rows;
        const results: SearchResultItem[] = orderResults.map((r: Record<string, unknown>) => {
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
        // De-duplication runs after PostgREST counted: when this page is the
        // whole match set, the count is what it lists («الحسابات البنكية» 27).
        const deduped = dedupeResults(results);
        return {
          ok: true,
          results: deduped.slice(0, size),
          ...sectionCount({ estimate: settled.count, offset: from, rawRows: orderResults.length, requested: fetchSizeFor(size), listedWhenComplete: deduped.length }),
        };
      } catch (e) {
        console.error('[Search] Orders error:', e);
        return { ok: false };
      }
    };

    // --- FEQH SEARCH ---
    const runFeqh = async (): Promise<SectionOutcome> => {
      const { from, size } = window('feqh');
      const signal = AbortSignal.timeout(SECTION_BUDGET_MS);
      try {
        const feqhQuery = (head = false) => supabase
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
          `, { count: 'estimated', head })
          .textSearch('fts', ftsQuery, { config: LIBRARY_FTS_CONFIG });

        const res = await feqhQuery()
          .order('id')
          .range(from, from + fetchSizeFor(size) - 1)
          .abortSignal(signal);
        const settled = await settlePage('feqh', res as unknown as RowsResult, () => feqhQuery(true).abortSignal(signal));
        if (!settled) return { ok: false };
        const feqhResults = settled.rows;
        const results: SearchResultItem[] = feqhResults.map((r: Record<string, unknown>) => {
          const sec = r.feqh_sections as Record<string, unknown>;
          const chapter = sec?.feqh_chapters as Record<string, unknown>;
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
        const deduped = dedupeResults(results);
        return {
          ok: true,
          results: deduped.slice(0, size),
          ...sectionCount({ estimate: settled.count, offset: from, rawRows: feqhResults.length, requested: fetchSizeFor(size), listedWhenComplete: deduped.length }),
        };
      } catch (e) {
        console.error('[Search] Feqh error:', e);
        return { ok: false };
      }
    };

    // All requested sections run in parallel. A slow or failed section no
    // longer fails section=all (it is named in `degraded`); a single-section
    // request with a failed section still gets a 503 (combineSearchOutcomes).
    const runners: Record<SearchSectionName, () => Promise<SectionOutcome>> = {
      laws: runLaws,
      precedents: runPrecedents,
      orders: runOrders,
      feqh: runFeqh,
    };
    const names: SearchSectionName[] = section === 'all'
      ? ['laws', 'precedents', 'orders', 'feqh']
      : [section];
    const settled = await Promise.all(names.map((name) => runners[name]()));
    const outcomes: Partial<Record<SearchSectionName, SectionOutcome>> = {};
    names.forEach((name, i) => { outcomes[name] = settled[i]; });

    const combined = combineSearchOutcomes(section, outcomes, { page, query: parsed.raw });
    if (combined.status !== 200) return searchUnavailableResponse(combined.status);
    // counts.laws already includes these; the separate number lets a client
    // label law-level hits apart from article hits.
    const lawsOk = outcomes.laws?.ok === true;
    return NextResponse.json({ ...combined.body, lawTitleHits: lawsOk ? lawTitleHitCount : 0 });
  } catch (error) {
    console.error('[Search] Unexpected error:', error);
    return searchUnavailableResponse(500);
  }
}
