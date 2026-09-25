import type { createClient } from '@/lib/supabase/server';
import { LIBRARY_FTS_CONFIG } from '@/utils/normalizeArabic';
import {
  nizamTitleFor,
  queryTermWords,
  queryWantsTitleHits,
  rankLawTitleCandidates,
  titlePhrasePattern,
  titlePrefixPattern,
  titleStemPatterns,
  type LawTitleCandidate,
} from './searchPlan';

type LibraryClient = Awaited<ReturnType<typeof createClient>>;

const CANDIDATES_PER_QUERY = 25;
const LAW_TITLE_COLUMNS = 'slug, title, type, description, section_code';

export interface LawTitleHitOptions {
  /** The string handed to textSearch (a tsquery for search, raw words for autocomplete). */
  ftsQuery: string;
  /** 'plain' → plainto_tsquery (autocomplete); undefined → raw tsquery (search). */
  ftsType?: 'plain';
  rawQuery: string;
  terms: readonly string[];
  max: number;
  /** Bare section code ('06'), already normalised. */
  sectionCode?: string;
  lawType?: string;
  signal?: AbortSignal;
  /**
   * Search only: a single-word query whose word is in more than this many law
   * titles gets no title hits (searchPlan.SINGLE_TERM_TITLE_MAX). Also skips
   * single document-type words («نظام») without a query. Autocomplete leaves
   * it unset, so «العمل» still suggests «نظام العمل».
   */
  broadSingleTermMax?: number;
}

export interface LawTitleHitsResult {
  hits: LawTitleCandidate[];
  /**
   * false when a lookup failed or the broad-word count is unknown: `hits` may
   * then differ from what the same request returns next time. section=laws
   * pages 2+ need the same hit count as page 1, so they fail on this.
   */
  complete: boolean;
}

/**
 * Laws whose TITLE carries the query, best first (LIB-11), and whether every
 * lookup answered.
 *
 * library.laws is small (5,901 rows), so a few cheap lookups gather
 * candidates: full-text matches of type «نظام», full-text matches of any
 * type, a title-phrase ILIKE (which also catches «لنظام العمل», a token the
 * `simple` config does not split), titles that start with the phrase, the
 * exact title «نظام <phrase>», and titles holding every query word without
 * its «ال» («الجرائم المعلوماتية» → «نظام مكافحة جرائم المعلوماتية»).
 * Every lookup has a deterministic order, so the same query yields the same
 * candidates (and the same hits) on every request. searchPlan.rankLawTitleCandidates
 * scores them in JS.
 */
export async function fetchLawTitleHitsChecked(
  supabase: LibraryClient,
  opts: LawTitleHitOptions,
): Promise<LawTitleHitsResult> {
  if (opts.max <= 0) return { hits: [], complete: true };

  const singleTerm = queryTermWords(opts.terms).length === 1;
  const guardBroad = opts.broadSingleTermMax !== undefined && singleTerm;
  if (guardBroad && !queryWantsTitleHits(opts.terms)) return { hits: [], complete: true };

  const base = (withCount = false) => {
    let q = supabase
      .schema('library')
      .from('laws')
      .select(LAW_TITLE_COLUMNS, withCount ? { count: 'exact' } : undefined);
    if (opts.sectionCode) q = q.eq('section_code', opts.sectionCode);
    if (opts.lawType) q = q.eq('type', opts.lawType);
    if (opts.signal) q = q.abortSignal(opts.signal);
    return q;
  };
  const tsOpts = opts.ftsType
    ? { config: LIBRARY_FTS_CONFIG, type: opts.ftsType }
    : { config: LIBRARY_FTS_CONFIG };

  const contains = titlePhrasePattern(opts.rawQuery);
  const prefix = titlePrefixPattern(opts.rawQuery);
  const nizamTitle = nizamTitleFor(opts.rawQuery);
  const stems = titleStemPatterns(opts.rawQuery);
  // The broad-word check needs a title count; without a safe ILIKE pattern
  // there is none, so a guarded single-word query gets no title hits.
  if (guardBroad && !contains) return { hits: [], complete: true };

  const lookups = [
    base().textSearch('fts', opts.ftsQuery, tsOpts).eq('type', 'نظام').order('slug').limit(CANDIDATES_PER_QUERY),
    base().textSearch('fts', opts.ftsQuery, tsOpts).order('slug').limit(CANDIDATES_PER_QUERY),
  ];
  // Index 2 when present: the title-contains lookup (counted when guarded).
  if (contains) lookups.push(base(guardBroad).ilike('title', contains).order('title').order('slug').limit(CANDIDATES_PER_QUERY));
  // Shortest-first is not expressible; title order puts «نظام العمل» ahead of
  // «نظام العمل التطوعي» among titles starting with the phrase.
  if (prefix) lookups.push(base().ilike('title', prefix).order('title').order('slug').limit(CANDIDATES_PER_QUERY));
  if (nizamTitle) lookups.push(base().eq('title', nizamTitle).order('slug').limit(CANDIDATES_PER_QUERY));
  if (stems) {
    let q = base();
    for (const p of stems) q = q.ilike('title', p);
    lookups.push(q.order('title').order('slug').limit(CANDIDATES_PER_QUERY));
  }

  const settled = await Promise.allSettled(lookups);

  if (guardBroad) {
    const counted = settled[2];
    const titleCount = counted?.status === 'fulfilled' && !counted.value.error ? counted.value.count : null;
    // Unknown count → no hits (a boost is never worth an arbitrary pick).
    if (typeof titleCount !== 'number') return { hits: [], complete: false };
    if (titleCount > (opts.broadSingleTermMax as number)) return { hits: [], complete: true };
  }

  let complete = true;
  const candidates: LawTitleCandidate[] = [];
  for (const s of settled) {
    if (s.status === 'rejected') {
      console.warn('[Search] law title lookup threw:', s.reason);
      complete = false;
      continue;
    }
    if (s.value.error) {
      console.warn('[Search] law title lookup failed:', s.value.error);
      complete = false;
      continue;
    }
    if (Array.isArray(s.value.data)) candidates.push(...(s.value.data as unknown as LawTitleCandidate[]));
  }
  return { hits: rankLawTitleCandidates(candidates, opts.rawQuery, opts.terms, opts.max), complete };
}

/**
 * Title hits only (autocomplete). This is a boost, never a requirement: a
 * failed lookup is logged and yields fewer or no hits instead of failing.
 */
export async function fetchLawTitleHits(
  supabase: LibraryClient,
  opts: LawTitleHitOptions,
): Promise<LawTitleCandidate[]> {
  return (await fetchLawTitleHitsChecked(supabase, opts)).hits;
}
