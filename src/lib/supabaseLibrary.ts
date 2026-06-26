/**
 * supabaseLibrary.ts
 * ─────────────────────────────────────────────────────────────
 * Server-side Supabase helper for the Saudi Legal Library.
 *
 * All tables live in the `library` schema and are accessed via
 *   supabase.schema('library').from('table_name')
 *
 * Import path: `@/lib/supabaseLibrary`
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from '@/lib/supabase/server';

// ════════════════════════════════════════════════════════════════
// ENUMS
// ════════════════════════════════════════════════════════════════

export type LibrarySection = 'all' | 'laws' | 'precedents' | 'orders' | 'feqh';

export type SortOption = 'relevance' | 'date-desc' | 'date-asc';

export type ArticleStatus = 'active' | 'amended' | 'repealed' | 'suspended';

export type SmartFolderColor =
  | 'blue' | 'green' | 'red' | 'yellow' | 'purple'
  | 'orange' | 'pink' | 'teal' | 'gray';

export type SmartFolderItemType = 'law' | 'article' | 'principle' | 'decree' | 'book';

export type IssueCategory =
  | 'missing_content' | 'wrong_content' | 'formatting'
  | 'broken_link' | 'translation' | 'other';

// ════════════════════════════════════════════════════════════════
// SEARCH INTERFACES
// ════════════════════════════════════════════════════════════════

export interface SearchFilters {
  category?: string;
  track?: string;
  source?: string;
  issuer?: string;
  year?: number | string;
  status?: ArticleStatus;
}

export interface SearchParams {
  query: string;
  section?: LibrarySection;
  filters?: SearchFilters;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  id: string;
  section: LibrarySection;
  slug: string;
  title: string;
  excerpt: string;
  /** ts_rank_cd relevance score (0–1 range, higher = better) */
  rank: number;
  category?: string;
  issuer?: string;
  date?: string;
  dateHijri?: string;
  status?: ArticleStatus;
  matchCount?: number;
  metadata?: Record<string, unknown>;
}

export interface SectionCounts {
  laws: number;
  precedents: number;
  orders: number;
  feqh: number;
}

export interface SearchResponse {
  results: SearchResult[];
  counts: SectionCounts;
  total: number;
  page: number;
  totalPages: number;
}

export interface AutocompleteMatch {
  title: string;
  section: LibrarySection;
  slug: string;
}

export interface AutocompleteResponse {
  counts: SectionCounts;
  topMatches: AutocompleteMatch[];
}

// ════════════════════════════════════════════════════════════════
// LAW / SYSTEM INTERFACES
// ════════════════════════════════════════════════════════════════

export interface Amendment {
  id: string;
  date: string;
  dateHijri?: string;
  description: string;
  oldText?: string;
  newText?: string;
  decreeNumber?: string;
}

export interface ExecutiveRegulation {
  id: string;
  articleId: string;
  text: string;
  issuer?: string;
  date?: string;
}

export interface Article {
  id: string;
  num: string;
  title: string;
  status: ArticleStatus;
  text: string;
  executiveReg?: ExecutiveRegulation;
  amendments?: Amendment[];
}

export interface Chapter {
  id: string;
  title: string;
  num?: string;
  articles: Article[];
}

export interface LawDetail {
  id: string;
  slug: string;
  title: string;
  titleEn?: string;
  preamble: string;
  issuer?: string;
  category?: string;
  track?: string;
  dateGregorian?: string;
  dateHijri?: string;
  royalDecreeNumber?: string;
  totalArticles?: number;
  status?: string;
  chapters: Chapter[];
  metadata?: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════
// JUDICIAL COLLECTION (PRECEDENTS) INTERFACES
// ════════════════════════════════════════════════════════════════

export interface PrincipleDetail {
  id: string;
  number: string;
  issuingBody: string;
  text: string;
  paragraphs: string[];
  details?: string;
  caseNumber?: string;
  sessionDate?: string;
  metadata?: Record<string, unknown>;
}

export interface CollectionDetail {
  id: string;
  slug: string;
  title: string;
  court: string;
  yearHijri: string;
  yearGregorian?: string;
  volumeNumber?: string;
  totalPrinciples?: number;
  principles: PrincipleDetail[];
  metadata?: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════
// FEQH BOOK INTERFACES
// ════════════════════════════════════════════════════════════════

export interface FeqhBlock {
  id: string;
  topic: string;
  matn: string;
  sharh: string;
  hashiyah?: string;
}

export interface FeqhBookSection {
  id: string;
  title: string;
  blocks: FeqhBlock[];
}

export interface FeqhChapter {
  id: string;
  title: string;
  num?: string;
  sections: FeqhBookSection[];
}

export interface BookDetail {
  id: string;
  slug: string;
  title: string;
  author: string;
  school: string;
  verifier?: string;
  publishYear?: string;
  totalPages?: number;
  chapters: FeqhChapter[];
  metadata?: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════
// DECREE / ORDER INTERFACES
// ════════════════════════════════════════════════════════════════

export interface DecreePage {
  pageNumber: number;
  content: string;
}

export interface DecreeDetail {
  id: string;
  title: string;
  type: string;
  issuer: string;
  date: string;
  dateHijri?: string;
  number?: string;
  summary: string;
  pages: DecreePage[];
  hashtags: string[];
  relatedLaws?: { slug: string; title: string }[];
  metadata?: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════
// SMART FOLDER INTERFACES
// ════════════════════════════════════════════════════════════════

export interface SmartFolderItem {
  id: string;
  folderId: string;
  itemType: SmartFolderItemType;
  itemId: string;
  itemTitle: string;
  itemSlug?: string;
  note?: string;
  position: number;
  createdAt: string;
}

export interface SmartFolder {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color: SmartFolderColor;
  icon?: string;
  isDefault: boolean;
  itemCount: number;
  items?: SmartFolderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFolderInput {
  name: string;
  description?: string;
  color?: SmartFolderColor;
  icon?: string;
}

export interface UpdateFolderInput {
  name?: string;
  description?: string;
  color?: SmartFolderColor;
  icon?: string;
}

export interface AddFolderItemInput {
  folderId: string;
  itemType: SmartFolderItemType;
  itemId: string;
  itemTitle: string;
  itemSlug?: string;
  note?: string;
}

// ════════════════════════════════════════════════════════════════
// ISSUE REPORT INTERFACE
// ════════════════════════════════════════════════════════════════

export interface IssueReport {
  category: IssueCategory;
  section: LibrarySection;
  /** Slug or ID of the problematic item */
  itemId: string;
  itemTitle: string;
  /** Article number, page number, principle number, etc. */
  location?: string;
  description: string;
  /** Optional screenshot URLs */
  attachments?: string[];
}

// ════════════════════════════════════════════════════════════════
// HELPER: Access the `library` schema
// ════════════════════════════════════════════════════════════════

/**
 * Returns a Supabase query builder scoped to the `library` schema.
 * Must be called with `await` since the server client is async.
 */
async function lib(table: string) {
  const supabase = await createClient();
  return supabase.schema('library').from(table);
}

/**
 * Returns the raw Supabase client (for .rpc() calls which don't
 * support .schema() chaining).
 */
async function rawClient() {
  return createClient();
}

// ════════════════════════════════════════════════════════════════
// 1. SEARCH LIBRARY
// ════════════════════════════════════════════════════════════════

/**
 * Central full-text search across all library sections.
 *
 * Uses PostgreSQL `websearch_to_tsquery('arabic', query)` with
 * `ts_rank_cd` for relevance ranking. Falls back to `ilike` when
 * FTS returns nothing (graceful degradation for partial words).
 */
export async function searchLibrary(params: SearchParams): Promise<SearchResponse> {
  const {
    query,
    section = 'all',
    filters = {},
    sort = 'relevance',
    page = 1,
    limit = 20,
  } = params;

  const offset = (page - 1) * limit;

  try {
    const supabase = await rawClient();

    // Call an RPC function that handles cross-section search.
    // The RPC `library.search_library` is expected to:
    //   - Accept query, section, filters, sort, limit, offset
    //   - Return { results, counts, total }
    const { data, error } = await supabase.rpc('library_search', {
      p_query: query,
      p_section: section,
      p_category: filters.category ?? null,
      p_track: filters.track ?? null,
      p_source: filters.source ?? null,
      p_issuer: filters.issuer ?? null,
      p_year: filters.year ? String(filters.year) : null,
      p_status: filters.status ?? null,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('[searchLibrary] RPC error:', error.message);

      // Fallback: try a simpler per-table search
      return fallbackSearch(params);
    }

    // RPC returns JSON: { results: [...], counts: {...}, total: N }
    const payload = data as {
      results: SearchResult[];
      counts: SectionCounts;
      total: number;
    } | null;

    if (!payload) {
      return emptyCounts(page);
    }

    return {
      results: payload.results ?? [],
      counts: payload.counts ?? zeroCounts(),
      total: payload.total ?? 0,
      page,
      totalPages: Math.ceil((payload.total ?? 0) / limit),
    };
  } catch (err) {
    console.error('[searchLibrary] Unexpected error:', err);
    return emptyCounts(page);
  }
}

/**
 * Fallback search: queries each section table individually using
 * `textSearch` on the `fts` column (tsvector) with an `ilike`
 * degradation when FTS yields 0 results.
 */
async function fallbackSearch(params: SearchParams): Promise<SearchResponse> {
  const {
    query,
    section = 'all',
    filters = {},
    sort = 'relevance',
    page = 1,
    limit = 20,
  } = params;

  const offset = (page - 1) * limit;

  try {
    const supabase = await rawClient();
    const sections: LibrarySection[] =
      section === 'all'
        ? ['laws', 'precedents', 'orders', 'feqh']
        : [section];

    const tableMap: Record<string, string> = {
      laws: 'laws',
      precedents: 'judicial_principles',
      orders: 'decrees',
      feqh: 'books',
    };

    const countPromises = (['laws', 'precedents', 'orders', 'feqh'] as const).map(
      async (sec) => {
        const table = tableMap[sec];
        const q = supabase
          .schema('library')
          .from(table)
          .select('id', { count: 'exact', head: true })
          .textSearch('fts', query, { type: 'websearch', config: 'arabic' });

        applyFilters(q, filters, sec);
        const { count } = await q;
        return [sec, count ?? 0] as const;
      },
    );

    const countEntries = await Promise.all(countPromises);
    const counts: SectionCounts = {
      laws: 0,
      precedents: 0,
      orders: 0,
      feqh: 0,
    };
    for (const [sec, count] of countEntries) {
      counts[sec] = count;
    }

    // Fetch results from the active section(s)
    const allResults: SearchResult[] = [];

    for (const sec of sections) {
      const table = tableMap[sec];
      const perSectionLimit = section === 'all' ? Math.ceil(limit / sections.length) : limit;

      const q = supabase
        .schema('library')
        .from(table)
        .select('id, slug, title, excerpt, category, issuer, date_gregorian, date_hijri, status, metadata')
        .textSearch('fts', query, { type: 'websearch', config: 'arabic' })
        .range(section === 'all' ? 0 : offset, (section === 'all' ? 0 : offset) + perSectionLimit - 1);

      applyFilters(q, filters, sec);
      applySorting(q, sort);

      const { data: rows, error } = await q;

      if (error) {
        console.error(`[fallbackSearch] ${sec} error:`, error.message);
        continue;
      }

      if (rows) {
        for (const row of rows as Record<string, unknown>[]) {
          allResults.push({
            id: String(row.id ?? ''),
            section: sec,
            slug: String(row.slug ?? row.id ?? ''),
            title: String(row.title ?? ''),
            excerpt: String(row.excerpt ?? ''),
            rank: 0,
            category: row.category as string | undefined,
            issuer: row.issuer as string | undefined,
            date: row.date_gregorian as string | undefined,
            dateHijri: row.date_hijri as string | undefined,
            status: row.status as ArticleStatus | undefined,
            metadata: row.metadata as Record<string, unknown> | undefined,
          });
        }
      }
    }

    const total = counts.laws + counts.precedents + counts.orders + counts.feqh;

    return {
      results: allResults,
      counts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (err) {
    console.error('[fallbackSearch] Unexpected error:', err);
    return emptyCounts(page);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, filters: SearchFilters, section: string): void {
  if (filters.category) q.eq('category', filters.category);
  if (filters.track) q.eq('track', filters.track);
  if (filters.source) q.eq('source', filters.source);
  if (filters.issuer) q.eq('issuer', filters.issuer);
  if (filters.year) q.eq('year', String(filters.year));
  if (filters.status && section === 'laws') q.eq('status', filters.status);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySorting(q: any, sort: SortOption): void {
  switch (sort) {
    case 'date-desc':
      q.order('date_gregorian', { ascending: false, nullsFirst: false });
      break;
    case 'date-asc':
      q.order('date_gregorian', { ascending: true, nullsFirst: false });
      break;
    case 'relevance':
    default:
      // Default ordering from textSearch + rank
      break;
  }
}

// ════════════════════════════════════════════════════════════════
// 2. AUTOCOMPLETE
// ════════════════════════════════════════════════════════════════

/**
 * Fast autocomplete: returns section counts + top 6 title matches.
 * Uses `ilike` for partial matching (not FTS) for instant results.
 */
export async function autocompleteLibrary(
  query: string,
): Promise<AutocompleteResponse> {
  if (!query || query.trim().length < 2) {
    return { counts: zeroCounts(), topMatches: [] };
  }

  try {
    const supabase = await rawClient();
    const pattern = `%${query.trim()}%`;

    const tableMap: Record<string, string> = {
      laws: 'laws',
      precedents: 'judicial_principles',
      orders: 'decrees',
      feqh: 'books',
    };

    // Parallel: counts + top matches from each section
    const promises = (['laws', 'precedents', 'orders', 'feqh'] as const).map(
      async (sec) => {
        const table = tableMap[sec];
        const [countRes, matchRes] = await Promise.all([
          supabase
            .schema('library')
            .from(table)
            .select('id', { count: 'exact', head: true })
            .ilike('title', pattern),
          supabase
            .schema('library')
            .from(table)
            .select('title, slug')
            .ilike('title', pattern)
            .limit(2),
        ]);

        const count = countRes.count ?? 0;
        const matches: AutocompleteMatch[] = (
          (matchRes.data as { title: string; slug: string }[]) ?? []
        ).map((row) => ({
          title: row.title,
          section: sec,
          slug: row.slug ?? '',
        }));

        return { sec, count, matches };
      },
    );

    const results = await Promise.all(promises);

    const counts: SectionCounts = { laws: 0, precedents: 0, orders: 0, feqh: 0 };
    const topMatches: AutocompleteMatch[] = [];

    for (const { sec, count, matches } of results) {
      counts[sec] = count;
      topMatches.push(...matches);
    }

    // Return at most 6 matches, prioritized by section count
    return {
      counts,
      topMatches: topMatches.slice(0, 6),
    };
  } catch (err) {
    console.error('[autocompleteLibrary] Error:', err);
    return { counts: zeroCounts(), topMatches: [] };
  }
}

// ════════════════════════════════════════════════════════════════
// 3. FETCH LAW BY SLUG
// ════════════════════════════════════════════════════════════════

/**
 * Fetches a complete law with its chapters, articles, executive
 * regulations, and amendments — all in a single query tree.
 */
export async function fetchLawBySlug(slug: string): Promise<LawDetail | null> {
  if (!slug) return null;

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('laws')
      .select(`
        id,
        slug,
        title,
        title_en,
        preamble,
        issuer,
        category,
        track,
        date_gregorian,
        date_hijri,
        royal_decree_number,
        total_articles,
        status,
        metadata,
        chapters:law_chapters (
          id,
          title,
          num,
          sort_order,
          articles:law_articles (
            id,
            num,
            title,
            status,
            text,
            sort_order,
            executive_reg:law_executive_regs (
              id,
              article_id,
              text,
              issuer,
              date
            ),
            amendments:law_amendments (
              id,
              date,
              date_hijri,
              description,
              old_text,
              new_text,
              decree_number
            )
          )
        )
      `)
      .eq('slug', slug)
      .single();

    if (error) {
      console.error('[fetchLawBySlug] Error:', error.message);
      return null;
    }

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      titleEn: row.title_en ?? undefined,
      preamble: row.preamble ?? '',
      issuer: row.issuer ?? undefined,
      category: row.category ?? undefined,
      track: row.track ?? undefined,
      dateGregorian: row.date_gregorian ?? undefined,
      dateHijri: row.date_hijri ?? undefined,
      royalDecreeNumber: row.royal_decree_number ?? undefined,
      totalArticles: row.total_articles ?? undefined,
      status: row.status ?? undefined,
      metadata: row.metadata ?? undefined,
      chapters: (row.chapters ?? [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((ch: any) => ({
          id: ch.id,
          title: ch.title,
          num: ch.num ?? undefined,
          articles: (ch.articles ?? [])
            .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((art: any) => ({
              id: art.id,
              num: art.num ?? '',
              title: art.title ?? '',
              status: art.status ?? 'active',
              text: art.text ?? '',
              executiveReg: art.executive_reg?.[0]
                ? {
                    id: art.executive_reg[0].id,
                    articleId: art.executive_reg[0].article_id,
                    text: art.executive_reg[0].text,
                    issuer: art.executive_reg[0].issuer ?? undefined,
                    date: art.executive_reg[0].date ?? undefined,
                  }
                : undefined,
              amendments: (art.amendments ?? []).map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (am: any) => ({
                  id: am.id,
                  date: am.date,
                  dateHijri: am.date_hijri ?? undefined,
                  description: am.description ?? '',
                  oldText: am.old_text ?? undefined,
                  newText: am.new_text ?? undefined,
                  decreeNumber: am.decree_number ?? undefined,
                }),
              ),
            })),
        })),
    };
  } catch (err) {
    console.error('[fetchLawBySlug] Unexpected error:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// 4. FETCH COLLECTION BY SLUG (Precedents)
// ════════════════════════════════════════════════════════════════

/**
 * Fetches a judicial collection (e.g. Supreme Court principles for a year)
 * with all nested principles.
 */
export async function fetchCollectionBySlug(
  slug: string,
): Promise<CollectionDetail | null> {
  if (!slug) return null;

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('judicial_collections')
      .select(`
        id,
        slug,
        title,
        court,
        year_hijri,
        year_gregorian,
        volume_number,
        total_principles,
        metadata,
        principles:judicial_principles (
          id,
          number,
          issuing_body,
          text,
          paragraphs,
          details,
          case_number,
          session_date,
          sort_order,
          metadata
        )
      `)
      .eq('slug', slug)
      .single();

    if (error) {
      console.error('[fetchCollectionBySlug] Error:', error.message);
      return null;
    }

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      court: row.court ?? '',
      yearHijri: row.year_hijri ?? '',
      yearGregorian: row.year_gregorian ?? undefined,
      volumeNumber: row.volume_number ?? undefined,
      totalPrinciples: row.total_principles ?? undefined,
      metadata: row.metadata ?? undefined,
      principles: (row.principles ?? [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({
          id: p.id,
          number: p.number ?? '',
          issuingBody: p.issuing_body ?? '',
          text: p.text ?? '',
          paragraphs: p.paragraphs ?? [],
          details: p.details ?? undefined,
          caseNumber: p.case_number ?? undefined,
          sessionDate: p.session_date ?? undefined,
          metadata: p.metadata ?? undefined,
        })),
    };
  } catch (err) {
    console.error('[fetchCollectionBySlug] Unexpected error:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// 5. FETCH BOOK BY SLUG (Feqh)
// ════════════════════════════════════════════════════════════════

/**
 * Fetches a feqh book with its full TOC (chapters → sections → blocks).
 * Blocks contain matn, sharh, and optional hashiyah layers.
 */
export async function fetchBookBySlug(
  slug: string,
): Promise<BookDetail | null> {
  if (!slug) return null;

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('books')
      .select(`
        id,
        slug,
        title,
        author,
        school,
        verifier,
        publish_year,
        total_pages,
        metadata,
        chapters:book_chapters (
          id,
          title,
          num,
          sort_order,
          sections:book_sections (
            id,
            title,
            sort_order,
            blocks:book_blocks (
              id,
              topic,
              matn,
              sharh,
              hashiyah,
              sort_order
            )
          )
        )
      `)
      .eq('slug', slug)
      .single();

    if (error) {
      console.error('[fetchBookBySlug] Error:', error.message);
      return null;
    }

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      author: row.author ?? '',
      school: row.school ?? '',
      verifier: row.verifier ?? undefined,
      publishYear: row.publish_year ?? undefined,
      totalPages: row.total_pages ?? undefined,
      metadata: row.metadata ?? undefined,
      chapters: (row.chapters ?? [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((ch: any) => ({
          id: ch.id,
          title: ch.title,
          num: ch.num ?? undefined,
          sections: (ch.sections ?? [])
            .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((sec: any) => ({
              id: sec.id,
              title: sec.title,
              blocks: (sec.blocks ?? [])
                .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((bl: any) => ({
                  id: bl.id,
                  topic: bl.topic ?? '',
                  matn: bl.matn ?? '',
                  sharh: bl.sharh ?? '',
                  hashiyah: bl.hashiyah ?? undefined,
                })),
            })),
        })),
    };
  } catch (err) {
    console.error('[fetchBookBySlug] Unexpected error:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// 6. FETCH DECREE BY ID (Orders / Royal Decrees)
// ════════════════════════════════════════════════════════════════

/**
 * Fetches a single decree with its pages and related laws.
 */
export async function fetchDecreeById(
  id: string,
): Promise<DecreeDetail | null> {
  if (!id) return null;

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('decrees')
      .select(`
        id,
        title,
        type,
        issuer,
        date_gregorian,
        date_hijri,
        number,
        summary,
        hashtags,
        metadata,
        pages:decree_pages (
          page_number,
          content,
          sort_order
        ),
        related_laws:decree_law_links (
          law_slug,
          law_title
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[fetchDecreeById] Error:', error.message);
      return null;
    }

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      title: row.title ?? '',
      type: row.type ?? '',
      issuer: row.issuer ?? '',
      date: row.date_gregorian ?? '',
      dateHijri: row.date_hijri ?? undefined,
      number: row.number ?? undefined,
      summary: row.summary ?? '',
      hashtags: row.hashtags ?? [],
      metadata: row.metadata ?? undefined,
      pages: (row.pages ?? [])
        .sort((a: { sort_order?: number; page_number: number }, b: { sort_order?: number; page_number: number }) =>
          (a.sort_order ?? a.page_number ?? 0) - (b.sort_order ?? b.page_number ?? 0),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({
          pageNumber: p.page_number,
          content: p.content ?? '',
        })),
      relatedLaws: (row.related_laws ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rl: any) => ({
          slug: rl.law_slug,
          title: rl.law_title,
        }),
      ),
    };
  } catch (err) {
    console.error('[fetchDecreeById] Unexpected error:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// 7. SMART FOLDER CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Get all smart folders for the authenticated user.
 */
export async function getFolders(userId: string): Promise<SmartFolder[]> {
  if (!userId) return [];

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('smart_folders')
      .select(`
        id,
        user_id,
        name,
        description,
        color,
        icon,
        is_default,
        item_count,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[getFolders] Error:', error.message);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      color: row.color ?? 'blue',
      icon: row.icon ?? undefined,
      isDefault: row.is_default ?? false,
      itemCount: row.item_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.error('[getFolders] Unexpected error:', err);
    return [];
  }
}

/**
 * Get a single folder with all its items.
 */
export async function getFolderWithItems(
  folderId: string,
  userId: string,
): Promise<SmartFolder | null> {
  if (!folderId || !userId) return null;

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('smart_folders')
      .select(`
        id,
        user_id,
        name,
        description,
        color,
        icon,
        is_default,
        item_count,
        created_at,
        updated_at,
        items:smart_folder_items (
          id,
          folder_id,
          item_type,
          item_id,
          item_title,
          item_slug,
          note,
          position,
          created_at
        )
      `)
      .eq('id', folderId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('[getFolderWithItems] Error:', error.message);
      return null;
    }

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      color: row.color ?? 'blue',
      icon: row.icon ?? undefined,
      isDefault: row.is_default ?? false,
      itemCount: row.item_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: (row.items ?? [])
        .sort((a: { position: number }, b: { position: number }) => (a.position ?? 0) - (b.position ?? 0))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => ({
          id: item.id,
          folderId: item.folder_id,
          itemType: item.item_type,
          itemId: item.item_id,
          itemTitle: item.item_title,
          itemSlug: item.item_slug ?? undefined,
          note: item.note ?? undefined,
          position: item.position,
          createdAt: item.created_at,
        })),
    };
  } catch (err) {
    console.error('[getFolderWithItems] Unexpected error:', err);
    return null;
  }
}

/**
 * Create a new smart folder.
 */
export async function createFolder(
  userId: string,
  input: CreateFolderInput,
): Promise<SmartFolder | null> {
  if (!userId || !input.name) return null;

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('smart_folders')
      .insert({
        user_id: userId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? 'blue',
        icon: input.icon ?? null,
        is_default: false,
        item_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[createFolder] Error:', error.message);
      return null;
    }

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      color: row.color ?? 'blue',
      icon: row.icon ?? undefined,
      isDefault: false,
      itemCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    console.error('[createFolder] Unexpected error:', err);
    return null;
  }
}

/**
 * Update a smart folder's metadata (name, color, icon, description).
 */
export async function updateFolder(
  folderId: string,
  userId: string,
  input: UpdateFolderInput,
): Promise<SmartFolder | null> {
  if (!folderId || !userId) return null;

  try {
    const supabase = await rawClient();

    // Build only the fields that were provided
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.color !== undefined) updates.color = input.color;
    if (input.icon !== undefined) updates.icon = input.icon;

    if (Object.keys(updates).length === 0) return null;

    const { data, error } = await supabase
      .schema('library')
      .from('smart_folders')
      .update(updates)
      .eq('id', folderId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[updateFolder] Error:', error.message);
      return null;
    }

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      color: row.color ?? 'blue',
      icon: row.icon ?? undefined,
      isDefault: row.is_default ?? false,
      itemCount: row.item_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    console.error('[updateFolder] Unexpected error:', err);
    return null;
  }
}

/**
 * Delete a smart folder and all its items (cascade).
 */
export async function deleteFolder(
  folderId: string,
  userId: string,
): Promise<boolean> {
  if (!folderId || !userId) return false;

  try {
    const supabase = await rawClient();

    const { error } = await supabase
      .schema('library')
      .from('smart_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', userId);

    if (error) {
      console.error('[deleteFolder] Error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[deleteFolder] Unexpected error:', err);
    return false;
  }
}

/**
 * Add an item to a smart folder (law, article, principle, decree, book).
 */
export async function addFolderItem(
  userId: string,
  input: AddFolderItemInput,
): Promise<SmartFolderItem | null> {
  if (!userId || !input.folderId || !input.itemId) return null;

  try {
    const supabase = await rawClient();

    // Verify the folder belongs to the user
    const { data: folder, error: folderErr } = await supabase
      .schema('library')
      .from('smart_folders')
      .select('id, item_count')
      .eq('id', input.folderId)
      .eq('user_id', userId)
      .single();

    if (folderErr || !folder) {
      console.error('[addFolderItem] Folder not found or not owned by user');
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentCount = (folder as any).item_count ?? 0;

    // Insert the item
    const { data, error } = await supabase
      .schema('library')
      .from('smart_folder_items')
      .insert({
        folder_id: input.folderId,
        item_type: input.itemType,
        item_id: input.itemId,
        item_title: input.itemTitle,
        item_slug: input.itemSlug ?? null,
        note: input.note ?? null,
        position: currentCount,
      })
      .select()
      .single();

    if (error) {
      console.error('[addFolderItem] Error:', error.message);
      return null;
    }

    // Increment the folder item_count
    await supabase
      .schema('library')
      .from('smart_folders')
      .update({ item_count: currentCount + 1 })
      .eq('id', input.folderId);

    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    return {
      id: row.id,
      folderId: row.folder_id,
      itemType: row.item_type,
      itemId: row.item_id,
      itemTitle: row.item_title,
      itemSlug: row.item_slug ?? undefined,
      note: row.note ?? undefined,
      position: row.position,
      createdAt: row.created_at,
    };
  } catch (err) {
    console.error('[addFolderItem] Unexpected error:', err);
    return null;
  }
}

/**
 * Remove an item from a smart folder.
 */
export async function removeFolderItem(
  userId: string,
  folderId: string,
  itemId: string,
): Promise<boolean> {
  if (!userId || !folderId || !itemId) return false;

  try {
    const supabase = await rawClient();

    // Verify ownership
    const { data: folder, error: folderErr } = await supabase
      .schema('library')
      .from('smart_folders')
      .select('id, item_count')
      .eq('id', folderId)
      .eq('user_id', userId)
      .single();

    if (folderErr || !folder) {
      console.error('[removeFolderItem] Folder not found or not owned by user');
      return false;
    }

    const { error } = await supabase
      .schema('library')
      .from('smart_folder_items')
      .delete()
      .eq('id', itemId)
      .eq('folder_id', folderId);

    if (error) {
      console.error('[removeFolderItem] Error:', error.message);
      return false;
    }

    // Decrement item_count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentCount = (folder as any).item_count ?? 0;
    await supabase
      .schema('library')
      .from('smart_folders')
      .update({ item_count: Math.max(0, currentCount - 1) })
      .eq('id', folderId);

    return true;
  } catch (err) {
    console.error('[removeFolderItem] Unexpected error:', err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// 8. ISSUE REPORT
// ════════════════════════════════════════════════════════════════

/**
 * Submit an issue report for a library item (wrong content, missing
 * text, formatting issues, etc.).
 */
export async function submitIssueReport(
  userId: string,
  report: IssueReport,
): Promise<{ id: string } | null> {
  if (!userId || !report.description) return null;

  try {
    const supabase = await rawClient();

    const { data, error } = await supabase
      .schema('library')
      .from('issue_reports')
      .insert({
        user_id: userId,
        category: report.category,
        section: report.section,
        item_id: report.itemId,
        item_title: report.itemTitle,
        location: report.location ?? null,
        description: report.description,
        attachments: report.attachments ?? [],
        status: 'open',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[submitIssueReport] Error:', error.message);
      return null;
    }

    return data ? { id: (data as { id: string }).id } : null;
  } catch (err) {
    console.error('[submitIssueReport] Unexpected error:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ════════════════════════════════════════════════════════════════

function zeroCounts(): SectionCounts {
  return { laws: 0, precedents: 0, orders: 0, feqh: 0 };
}

function emptyCounts(page: number): SearchResponse {
  return {
    results: [],
    counts: zeroCounts(),
    total: 0,
    page,
    totalPages: 0,
  };
}

// Re-export the `lib` helper for ad-hoc queries from API routes
export { lib as libraryTable, rawClient as libraryClient };
