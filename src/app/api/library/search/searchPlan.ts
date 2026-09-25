/**
 * Pure planning / merging logic for POST /api/library/search.
 *
 * Kept free of Next.js and Supabase imports so node:test can exercise it
 * without a network (see searchPlan.test.ts). route.ts runs the queries and
 * hands the outcomes to these functions.
 */
import { normalizeSearch } from '../../../../utils/normalizeArabic.ts';

export type SearchSectionName = 'laws' | 'precedents' | 'orders' | 'feqh';
export const SEARCH_SECTION_NAMES: readonly SearchSectionName[] = ['laws', 'precedents', 'orders', 'feqh'];

/**
 * PostgREST `count: 'estimated'` counts exactly up to max-rows (1000) and
 * reports max(planner estimate, 1001) above it, so a count above this number
 * means "more than 1000", not an exact total. Sent to clients as
 * `countsExactUpTo` so they can render «أكثر من ١٠٠٠».
 */
export const COUNTS_EXACT_UP_TO = 1000;

/** Result rows per section when section=all (the overview panel). */
export const ALL_SECTION_PREVIEW = 6;

/**
 * The smallest window any section query asks PostgREST for. With
 * `order('id')` a tiny LIMIT (the 6-row preview) makes Postgres walk the
 * primary key and test every row against the full-text match instead of using
 * the GIN index: rare terms («كوفيد», «المعلوماتية») measured 2.4–3.1s and hit
 * the anon statement_timeout, while the same query with a 50-row window took
 * ~100ms. Sections fetch at least this many rows and trim afterwards; the
 * window stays in id order, so paging is unchanged.
 */
export const SEARCH_MIN_FETCH = 50;

/** Rows to fetch for a window that will show `size` rows. */
export function fetchSizeFor(size: number): number {
  return Math.max(size, SEARCH_MIN_FETCH);
}

export interface SearchResultItem {
  id: unknown;
  section: SearchSectionName;
  title: unknown;
  snippet: string;
  locked: boolean;
  meta: Record<string, unknown>;
}

/**
 * `exact` is true only when `count` is proven exact (isSectionCountExact); the
 * response carries it per section as `countsExact` (SEARCH COUNTS CONTRACT).
 */
export type SectionOutcome =
  | { ok: true; results: SearchResultItem[]; count: number; exact: boolean }
  | { ok: false };

/** Arabic, user-facing. The UI shows its own copy by status; this is for API clients. */
export const SEARCH_UNAVAILABLE_MESSAGE = 'تعذّر تنفيذ البحث مؤقتاً. حاول مرة أخرى بعد قليل.';

export interface CombinedSearchResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Count for one section.
 *
 * The route asks PostgREST for `count: 'estimated'`: exact while the match set
 * is under max-rows (1000), the planner's estimate above it. An exact count
 * over a 10^4-10^5-row full-text match set is what pushed cold searches past
 * the anon statement_timeout (LIB-01). The estimate can be off (the planner
 * knows nothing about an embedded-resource filter), so it is clamped to what
 * the page itself proves:
 * - a short page means the end of the match set was reached, so the count is
 *   exactly offset + rows;
 * - otherwise the count is at least offset + rows.
 * `rawRows` is the row count PostgREST returned, before any de-duplication.
 */
export function resolveSectionCount(
  estimate: number | null | undefined,
  offset: number,
  rawRows: number,
  requested: number,
): number {
  const seen = offset + rawRows;
  const est = typeof estimate === 'number' && Number.isFinite(estimate) ? estimate : null;
  // An empty page past the end proves only that the match set is <= offset;
  // PostgREST's own count (exact up to 1000) is the better answer there.
  if (rawRows === 0 && offset > 0) return est !== null ? Math.min(est, offset) : offset;
  if (rawRows < requested) return seen;
  return Math.max(est ?? 0, seen);
}

/**
 * Whether resolveSectionCount's number is proven exact:
 * - a non-empty short page reached the end of the match set (an empty first
 *   page means no match at all);
 * - otherwise only when PostgREST counted it itself, i.e. the `estimated`
 *   count is <= max-rows (COUNTS_EXACT_UP_TO). Above that it is
 *   max(capped count 1001, planner estimate): a floor of 1001, never an exact
 *   total, since the estimate can sit far below or above the truth.
 * A missing count is never exact.
 */
export function isSectionCountExact(
  estimate: number | null | undefined,
  offset: number,
  rawRows: number,
  requested: number,
): boolean {
  const est = typeof estimate === 'number' && Number.isFinite(estimate) ? estimate : null;
  if (rawRows < requested && (rawRows > 0 || offset === 0)) return true;
  return est !== null && est <= COUNTS_EXACT_UP_TO;
}

/**
 * A section's count and whether it is exact («the number equals what the
 * section lists», SEARCH COUNTS CONTRACT).
 *
 * - `offset`/`rawRows`/`requested` describe the rows PostgREST returned
 *   (before de-duplication), as for resolveSectionCount.
 * - `extra`: rows the section lists besides the counted ones (law title hits,
 *   the same number on every page), added to the count.
 * - `listedWhenComplete`: what the section lists when this one response holds
 *   the WHOLE match set (offset 0, short page): after de-duplication, plus
 *   `extra`. The count is then that number, since dedupe runs after
 *   PostgREST counted («الحسابات البنكية»: 28 counted, 27 listed).
 */
export function sectionCount(opts: {
  estimate: number | null | undefined;
  offset: number;
  rawRows: number;
  requested: number;
  extra?: number;
  listedWhenComplete?: number;
}): { count: number; exact: boolean } {
  const extra = opts.extra ?? 0;
  if (opts.offset === 0 && opts.rawRows < opts.requested) {
    return { count: opts.listedWhenComplete ?? opts.rawRows + extra, exact: true };
  }
  return {
    count: resolveSectionCount(opts.estimate, opts.offset, opts.rawRows, opts.requested) + extra,
    exact: isSectionCountExact(opts.estimate, opts.offset, opts.rawRows, opts.requested),
  };
}

/**
 * PostgREST answers a `.range()` that starts past the last row with HTTP 416
 * PGRST103 when a count is requested (an offset equal to the total still gets
 * 206 with []). That is a proven-empty page, not a failure.
 */
export function isPastEndError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'PGRST103';
}

/**
 * The total PostgREST reports with PGRST103. supabase-js sets `count` to null
 * on any non-2xx response, so the number only survives in the error body:
 * details «An offset of 50 was requested, but there are only 28 rows.».
 * The search depth cap keeps every offset <= 1000 (filters.SEARCH_MAX_DEPTH),
 * so a total below the offset is inside PostgREST's exact range. null when
 * the wording is not recognised (the route then runs a head count).
 */
export function pastEndTotal(error: unknown): number | null {
  if (!isPastEndError(error)) return null;
  const e = error as { details?: unknown; message?: unknown };
  const text = `${typeof e.details === 'string' ? e.details : ''} ${typeof e.message === 'string' ? e.message : ''}`;
  const m = /only\s+(\d+)\s+rows?/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * The laws query retries without `original_text` only when the select itself
 * may have been rejected: never on a timeout (it would fail the same way,
 * twice as slowly) and never on PGRST103 (a page past the end, not a column
 * problem).
 */
export function shouldRetryLawsWithoutHistory(error: unknown): boolean {
  return !!error && !isTimeoutError(error) && !isPastEndError(error);
}

export type PageRead<T> =
  | { kind: 'rows'; rows: T[]; count: number | null }
  | { kind: 'past_end'; total: number | null }
  | { kind: 'failed' };

/**
 * One section query's response → rows, a proven-empty page past the end
 * (PGRST103; `total` null when it must be counted separately), or a failure.
 * A failure is never turned into an empty page.
 */
export function readPage<T>(res: { data: unknown; count: number | null | undefined; error: unknown }): PageRead<T> {
  if (res.error) {
    if (isPastEndError(res.error)) return { kind: 'past_end', total: pastEndTotal(res.error) };
    return { kind: 'failed' };
  }
  if (!Array.isArray(res.data)) return { kind: 'failed' };
  return { kind: 'rows', rows: res.data as T[], count: typeof res.count === 'number' ? res.count : null };
}

/** True for a Postgres statement_timeout (57014) or a client-side abort. */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; name?: unknown };
  if (e.code === '57014') return true;
  const text = `${typeof e.name === 'string' ? e.name : ''} ${typeof e.message === 'string' ? e.message : ''}`;
  return /statement timeout|AbortError|TimeoutError|aborted/i.test(text);
}

/**
 * Title key for de-duplication: Arabic-normalised, with the seeder's
 * `_0`/`_1` copy suffix removed («نظام العمل التطوعي_0» is the same law as
 * «نظام العمل التطوعي»).
 */
export function dedupeTitleKey(title: string): string {
  return normalizeSearch(title.replace(/_\d+(?=\s*(?:—|$))/gu, '')).replace(/\s+/g, ' ');
}

/** Metadata that tells two same-titled decrees apart (orders only). */
const IDENTITY_META_KEYS = ['ref', 'date'] as const;
/** Metadata counted when choosing which of two duplicate hits to keep. */
const COMPLETENESS_META_KEYS = ['ref', 'date', 'issuer', 'type', 'hashtags'] as const;

function metaText(item: SearchResultItem, key: string): string {
  const v = item.meta?.[key];
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.length > 0 ? JSON.stringify(v) : '';
  return String(v).trim();
}

/** Same key → same record, unless an identity field is set on both and differs (orders only). */
function sameRecord(a: SearchResultItem, b: SearchResultItem): boolean {
  if (a.section !== 'orders') return true;
  return IDENTITY_META_KEYS.every((k) => {
    const x = metaText(a, k);
    const y = metaText(b, k);
    return !x || !y || x === y;
  });
}

function completeness(item: SearchResultItem): number {
  return COMPLETENESS_META_KEYS.reduce((n, k) => n + (metaText(item, k) ? 1 : 0), 0);
}

/**
 * Drop repeated hits. The library holds 83 law titles under more than one slug
 * (84 extra rows), so the same circular's article came back twice with two
 * different ids; de-duplicating by id does nothing. Two hits are the same when
 * their section, title and snippet are the same after Arabic normalisation.
 *
 * Decrees: every summary_brief is empty, so the key is effectively the title.
 * Two same-titled decrees whose ref or date differ (both set) are different
 * decrees and both stay. When one copy lacks ref/date, the copy with the more
 * complete metadata is kept, in the first copy's position: «الحسابات البنكية»
 * used to keep the row with an empty ref and date and drop the row carrying
 * ref 482004268.
 */
export function dedupeResults<T extends SearchResultItem>(items: readonly T[]): T[] {
  const buckets = new Map<string, number[]>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.section}\u0000${dedupeTitleKey(String(item.title ?? ''))}\u0000${normalizeSearch(item.snippet ?? '')}`;
    const positions = buckets.get(key) ?? [];
    const dupAt = positions.find((i) => sameRecord(out[i], item));
    if (dupAt === undefined) {
      positions.push(out.length);
      buckets.set(key, positions);
      out.push(item);
    } else if (completeness(item) > completeness(out[dupAt])) {
      out[dupAt] = item;
    }
  }
  return out;
}

/**
 * Merge per-section outcomes into the HTTP response.
 *
 * - A single-section request whose section failed: 503, no partial data.
 * - section=all with SOME sections failed: 200. The failed sections carry no
 *   results and a count of 0 (the UI sums counts as numbers) and are named in
 *   `degraded`, so one slow table no longer fails the whole search.
 * - section=all with EVERY section failed: 503.
 *
 * `countsExact[section]` is true only for a proven-exact count (SEARCH COUNTS
 * CONTRACT); `false` means a floor of 1001 (shown as «أكثر من ١٬٠٠٠») or, for
 * a section in `degraded`, no count at all. `total` is then a floor too.
 * `countsEstimated`/`countsExactUpTo` are the round-1 fields, kept for older
 * clients.
 */
export function combineSearchOutcomes(
  section: 'all' | SearchSectionName,
  outcomes: Partial<Record<SearchSectionName, SectionOutcome>>,
  meta: { page: number; query: string },
): CombinedSearchResponse {
  const requested = section === 'all' ? SEARCH_SECTION_NAMES : [section];
  const counts: Record<SearchSectionName, number> = { laws: 0, precedents: 0, orders: 0, feqh: 0 };
  // A section the request did not search keeps 0 / true: it is no match count
  // at all, and `false` would render as «أكثر من ١٬٠٠٠».
  const countsExact: Record<SearchSectionName, boolean> = { laws: true, precedents: true, orders: true, feqh: true };
  const results: SearchResultItem[] = [];
  const degraded: SearchSectionName[] = [];

  for (const name of requested) {
    const outcome = outcomes[name];
    if (!outcome || !outcome.ok) {
      degraded.push(name);
      // Its 0 means "unknown", never "no matches": the UI must not print it.
      countsExact[name] = false;
      continue;
    }
    counts[name] = outcome.count;
    countsExact[name] = outcome.exact === true;
    results.push(...outcome.results);
  }

  if (degraded.length === requested.length) {
    return {
      status: 503,
      body: { error: SEARCH_UNAVAILABLE_MESSAGE, code: 'search_unavailable' },
    };
  }

  return {
    status: 200,
    body: {
      results,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      page: meta.page,
      query: meta.query,
      degraded,
      countsExact,
      countsEstimated: true,
      countsExactUpTo: COUNTS_EXACT_UP_TO,
    },
  };
}

// ─── Law title ranking (LIB-11, PostgREST-only) ──────────────────────────────

export interface LawTitleCandidate {
  slug: string;
  title: string;
  type?: string | null;
  description?: string | null;
  section_code?: string | null;
}

const PRIMARY_LAW_TYPE = 'نظام';
const REGULATION_LAW_TYPE = 'لائحة تنفيذية';

function words(text: string): string[] {
  return normalizeSearch(text).split(/\s+/).filter(Boolean);
}

const TITLE_WORD_PREFIXES = ['ال', 'لل', 'ل', 'و', 'ب', 'وال', 'بال'];

/**
 * A query word without its definite article («الجرائم» → «جرائم»), or null
 * when it has none. Words of three letters or fewer keep their «ال».
 * Expects a normalizeSearch'd word.
 */
export function stripDefiniteArticle(term: string): string | null {
  return term.startsWith('ال') && term.length > 3 ? term.slice(2) : null;
}

function matchesWithTitlePrefix(word: string, term: string): boolean {
  if (word === term) return true;
  return TITLE_WORD_PREFIXES.some((prefix) => word === prefix + term);
}

/**
 * A title word matches a term when equal, or equal after a clitic prefix on
 * the title word (ل/ال/لل/و/ب), or — the query side — after dropping the
 * term's own «ال»: «الجرائم» matches the title word «جرائم» in «نظام مكافحة
 * جرائم المعلوماتية».
 */
function wordMatches(word: string, term: string): boolean {
  if (matchesWithTitlePrefix(word, term)) return true;
  const bare = stripDefiniteArticle(term);
  return bare !== null && matchesWithTitlePrefix(word, bare);
}

const NIZAM_WORD = normalizeSearch(PRIMARY_LAW_TYPE);

/**
 * Score a law title against the query. Returns null when the title does not
 * contain every term (a description-only match is not a title hit).
 */
export function scoreLawTitle(candidate: LawTitleCandidate, rawQuery: string, terms: readonly string[]): number | null {
  const title = normalizeSearch(candidate.title ?? '');
  const phrase = normalizeSearch(rawQuery.replace(/["*+/()-]/g, ' '));
  const normTerms = terms.map((t) => normalizeSearch(t)).filter(Boolean);
  if (!title || normTerms.length === 0) return null;

  const titleWords = words(candidate.title ?? '');
  const termWords = normTerms.flatMap((t) => t.split(/\s+/));
  const allTermsInTitle = termWords.every((term) => titleWords.some((w) => wordMatches(w, term)));
  if (!allTermsInTitle) return null;

  let score = 100;
  if (phrase && title === phrase) score += 1000;
  // «نظام <phrase>» of type نظام is the law the query names («العمل» →
  // «نظام العمل»): above any title that merely starts with the phrase
  // («العمل أثناء الدراسة», a قرار).
  else if (phrase && candidate.type === PRIMARY_LAW_TYPE && title === `${NIZAM_WORD} ${phrase}`) score += 900;
  else if (phrase && title.startsWith(phrase)) score += 500;
  else if (phrase && title.includes(phrase)) score += 300;

  if (candidate.type === PRIMARY_LAW_TYPE) score += 60;
  else if (candidate.type === REGULATION_LAW_TYPE) score += 20;

  // Prefer the concise title: «نظام العمل» over «دليل إجرائي ... نظام العمل».
  score -= Math.min(titleWords.length, 40);
  return score;
}

/** The query's words, Arabic-normalised («نظام العمل» → ['نظام', 'العمل']). */
export function queryTermWords(terms: readonly string[]): string[] {
  return terms.flatMap((t) => normalizeSearch(t).split(/\s+/)).filter(Boolean);
}

/**
 * Document-type words. On its own, such a word is in hundreds or thousands
 * of titles («نظام» 962, «لائحة» 1,219, «قرار» 1,682 on the self-hosted
 * library), so a single-word query made of one of them gets no title hits:
 * any few titles picked from that set would be arbitrary.
 */
const GENERIC_TITLE_WORDS = new Set(
  [
    'نظام', 'النظام', 'انظمة', 'الانظمة', 'لائحة', 'اللائحة', 'لوائح', 'اللوائح',
    'قرار', 'القرار', 'قرارات', 'القرارات', 'مرسوم', 'المرسوم', 'تعميم', 'التعميم',
    'دليل', 'الدليل', 'اتفاقية', 'الاتفاقية', 'امر', 'الامر', 'قواعد', 'القواعد',
    'ضوابط', 'الضوابط', 'تنفيذية', 'التنفيذية', 'ملكي', 'الملكي', 'وزاري', 'الوزاري',
  ].map((w) => normalizeSearch(w)),
);

/**
 * Whether a query can have law title hits at all (independent of the data):
 * not empty, not only one- or two-letter words («من», «في»), and not a single
 * document-type word («نظام»).
 */
export function queryWantsTitleHits(terms: readonly string[]): boolean {
  const termWords = queryTermWords(terms);
  if (termWords.length === 0 || termWords.every((w) => w.length <= 2)) return false;
  if (termWords.length === 1 && GENERIC_TITLE_WORDS.has(termWords[0])) return false;
  return true;
}

/**
 * A single-word query whose word is in more than this many law titles gets
 * no title hits in the search results (checked with a count on library.laws,
 * see lawTitleHits.ts). «العمل» (197 titles) keeps «نظام العمل» on top.
 */
export const SINGLE_TERM_TITLE_MAX = 250;

/** Law title hits shown on page 1 of section=laws / section=all. */
export const LAW_TITLE_HITS_LAWS = 3;
export const LAW_TITLE_HITS_ALL = 2;

/**
 * The most law title hits a section=laws list can hold (0 or
 * LAW_TITLE_HITS_LAWS), derived from the request only. The hits actually
 * found (`hits`, 0..maxSlots) come from deterministic lookups and are
 * re-fetched on every page, so every page agrees on them: page 1 lists the
 * `hits` title hits then articles [0, limit - hits); page n lists articles
 * [(n-1)*limit - hits, n*limit - hits). No slot is reserved for a hit that
 * does not exist («بطلان»: 50 articles on page 1, not 47).
 */
export function lawTitleSlots(opts: { hasStatusFilter: boolean; terms: readonly string[]; limit: number }): number {
  if (opts.hasStatusFilter || !queryWantsTitleHits(opts.terms)) return 0;
  return opts.limit > LAW_TITLE_HITS_LAWS ? LAW_TITLE_HITS_LAWS : 0;
}

/**
 * The article rows one section=laws page FETCHES. It does not depend on how
 * many title hits exist, so the article query runs in parallel with the
 * title lookups: page 1 fetches [0, limit); page n fetches `maxSlots` rows
 * early, [(n-1)*limit - maxSlots, n*limit), and lawPageArticles drops the
 * ones the hits did not displace.
 */
export function lawFetchWindow(page: number, limit: number, maxSlots: number): { from: number; size: number } {
  if (page <= 1) return { from: 0, size: limit };
  return { from: (page - 1) * limit - maxSlots, size: limit + maxSlots };
}

/** The fetched rows (lawFetchWindow) this page lists, given the `hits` title hits found (<= maxSlots). */
export function lawPageArticles<T>(rows: readonly T[], page: number, limit: number, maxSlots: number, hits: number): T[] {
  const k = Math.max(0, Math.min(hits, maxSlots));
  if (page <= 1) return rows.slice(0, limit - k);
  const skip = maxSlots - k;
  return rows.slice(skip, skip + limit);
}

/**
 * The ranked-order RPC (migration 20260925_01) orders only the section=all
 * preview. section=laws pages must all come from one order (`id`): a ranked
 * page 1 followed by id-ordered pages 2+ would repeat and skip rows.
 */
export function rankedLawOrderApplies(section: 'all' | SearchSectionName): boolean {
  return section === 'all';
}

/**
 * Title-first law hits: every candidate whose title holds all the terms,
 * best score first, one per normalised title (duplicate slugs collapse).
 * Queries made only of one- or two-letter words («من», «في») produce no title
 * hits: they appear in most titles and would push noise above the articles.
 */
export function rankLawTitleCandidates(
  candidates: readonly LawTitleCandidate[],
  rawQuery: string,
  terms: readonly string[],
  max: number,
): LawTitleCandidate[] {
  if (max <= 0) return [];
  const termWords = queryTermWords(terms);
  if (termWords.length === 0 || termWords.every((w) => w.length <= 2)) return [];

  const bySlug = new Map<string, LawTitleCandidate>();
  for (const c of candidates) if (c && c.slug && c.title && !bySlug.has(c.slug)) bySlug.set(c.slug, c);

  const scored: Array<{ c: LawTitleCandidate; score: number }> = [];
  for (const c of bySlug.values()) {
    const score = scoreLawTitle(c, rawQuery, terms);
    if (score !== null) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score || a.c.title.length - b.c.title.length || a.c.slug.localeCompare(b.c.slug));

  const seenTitles = new Set<string>();
  const out: LawTitleCandidate[] = [];
  for (const { c } of scored) {
    const key = dedupeTitleKey(c.title);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * ILIKE pattern for a title-phrase lookup, or null when the query holds
 * characters that are wildcards or syntax to ILIKE/PostgREST. Only letters,
 * digits and spaces go through.
 */
export function titlePhrasePattern(rawQuery: string): string | null {
  const phrase = rawQuery.trim().replace(/\s+/g, ' ');
  if (phrase.length < 2 || phrase.length > 80) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(phrase)) return null;
  return `%${phrase}%`;
}

/** ILIKE pattern for titles that START with the phrase («نظام العمل…»), or null (see titlePhrasePattern). */
export function titlePrefixPattern(rawQuery: string): string | null {
  const contains = titlePhrasePattern(rawQuery);
  return contains ? contains.slice(1) : null;
}

/**
 * One ILIKE pattern per query word with its «ال» dropped («الجرائم
 * المعلوماتية» → ['%جرائم%', '%معلوماتية%'], ANDed by the caller), so a title
 * that carries the word without the article («نظام مكافحة جرائم المعلوماتية»)
 * becomes a candidate. null when no word has an «ال» to drop or the query is
 * not a plain phrase (titlePhrasePattern).
 */
export function titleStemPatterns(rawQuery: string): string[] | null {
  if (!titlePhrasePattern(rawQuery)) return null;
  const words = rawQuery.trim().split(/\s+/).filter(Boolean);
  let stripped = false;
  const patterns = words.map((w) => {
    const bare = w.startsWith('ال') && w.length > 3 ? w.slice(2) : null;
    if (bare) stripped = true;
    return `%${bare ?? w}%`;
  });
  return stripped ? patterns : null;
}

/**
 * The exact title «نظام <phrase>» for an equality lookup, so the law the
 * query names is always among the candidates (scoreLawTitle ranks it above
 * starts-with matches). null when the phrase already starts with «نظام» or is
 * not a plain phrase.
 */
export function nizamTitleFor(rawQuery: string): string | null {
  if (!titlePhrasePattern(rawQuery)) return null;
  const phrase = rawQuery.trim().replace(/\s+/g, ' ');
  if (normalizeSearch(phrase.split(' ')[0]) === NIZAM_WORD) return null;
  return `${PRIMARY_LAW_TYPE} ${phrase}`;
}

/** Reorder rows to follow `ids` (the ranked order); rows whose id is not listed are dropped. */
export function orderRowsByIds<T extends { id?: unknown }>(rows: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(String(row.id), row);
  const out: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}
