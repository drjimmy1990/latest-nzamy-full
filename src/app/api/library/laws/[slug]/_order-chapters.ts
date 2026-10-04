/**
 * Reading order of a law's chapters in the /api/library/laws/[slug] response.
 *
 * The route fetches chapters and articles ordered by (order_index, id) because
 * selectAllPages needs a total order to page them. That order is right for
 * articles (it is their position in the source document) but wrong for
 * chapters, on the self-hosted corpus, for two measured reasons:
 *
 *  - chapters.order_index is a per-level ordinal. «الفرع الأول…», «الفصل الأول…»
 *    and «القسم الأول…» of one law all carry 1, so civil-transactions-law
 *    opened on chapters starting at articles 120, 308, 164…
 *  - the seeder's «__orphan__» chapter (order_index -1, one per law) holds
 *    articles it could not place under a real heading. In most laws those are
 *    the law's opening articles (commercial-papers-law 1-11), in the qadha
 *    editions they are scattered ones (sharia-pleading 48, 60, 74…).
 *
 * So chapters are ordered here by where their articles are, never by
 * chapters.order_index:
 *
 *  1. Every chapter that has articles is placed by the global position of its
 *     first article (articles arrive in document order).
 *  2. The orphan chapter alone is then re-placed by article NUMBER, when it has
 *     one and the real chapters' first numbers already ascend. The qadha
 *     editions gave its scattered articles the first order_index values
 *     (sharia-pleading: 48 is at 0, article 1 at 1), so rule 1 would open the
 *     law on article 48. Placed by number it sits after the chapter starting
 *     at 41. A leading orphan (articles 1-11) still lands first.
 *  3. Chapters with no articles are dropped when the law has any article:
 *     an empty heading has no position of its own. The one exception is a
 *     level-1 heading (migration 20261004_02, «الباب» over «الفصل»): it is
 *     put back right before the first kept chapter that names it as parent.
 *     A law with no articles keeps its headings, in query order.
 *  4. Articles whose chapter_id matches no fetched chapter (or is null) are
 *     kept in a «أحكام عامة» group placed by rule 1. No article is ever dropped.
 *
 * The orphan chapter is relabelled «مواد خارج الأبواب»; the sentinel string
 * never reaches a reader.
 */

export const ORPHAN_CHAPTER_TITLE = '__orphan__';
export const ORPHAN_CHAPTER_LABEL = 'مواد خارج الأبواب';
export const UNGROUPED_CHAPTER_LABEL = 'أحكام عامة';

export interface ChapterRowLike {
  id?: unknown;
  title?: unknown;
  /** 20261004_02: 1 = باب-level heading, 2 = a chapter under it. Absent before the migration. */
  level?: unknown;
  parent_chapter_id?: unknown;
}

export interface ArticleRowLike {
  chapter_id?: unknown;
  number?: unknown;
}

export interface OrderedChapter<A> {
  title: string;
  articles: A[];
  /** Sent only when the row carries them (two-level chapters, 20261004_02). */
  id?: string;
  level?: 1 | 2;
  parentChapterId?: string | null;
}

interface ChapterMeta {
  id?: string;
  level?: 1 | 2;
  parentChapterId?: string | null;
}

/** The optional two-level fields of a chapter row; {} on an older database. */
export function chapterLevelMeta(c: ChapterRowLike): ChapterMeta {
  const out: ChapterMeta = {};
  const lv = Number(c.level);
  if (lv === 1 || lv === 2) {
    if (c.id != null && String(c.id)) out.id = String(c.id);
    out.level = lv;
    if (lv === 2) out.parentChapterId = typeof c.parent_chapter_id === 'string' ? c.parent_chapter_id : null;
  }
  return out;
}

/** Numeric article number, or NaN when there is none (null is NOT 0). */
export function articleNumberValue(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) return Number(raw);
  return NaN;
}

interface Group<A> {
  title: string;
  isOrphan: boolean;
  articles: A[];
  /** Global position of the group's first article. */
  first: number;
  meta: ChapterMeta;
}

function emit<A>(g: Group<A>): OrderedChapter<A> {
  return { title: g.title, articles: g.articles, ...g.meta };
}

function firstNumber<A extends ArticleRowLike>(group: Group<A>): number {
  for (const a of group.articles) {
    const n = articleNumberValue(a.number);
    if (!Number.isNaN(n)) return n;
  }
  return NaN;
}

function minNumber<A extends ArticleRowLike>(group: Group<A>): number {
  let min = NaN;
  for (const a of group.articles) {
    const n = articleNumberValue(a.number);
    if (!Number.isNaN(n) && (Number.isNaN(min) || n < min)) min = n;
  }
  return min;
}

/**
 * @param chapters the law's chapter rows, in query order
 * @param articles the law's article rows, in document (query) order
 */
export function orderLawChapters<A extends ArticleRowLike>(
  chapters: readonly ChapterRowLike[],
  articles: readonly A[],
): OrderedChapter<A>[] {
  const isOrphan = (c: ChapterRowLike) => c.title === ORPHAN_CHAPTER_TITLE;
  const label = (c: ChapterRowLike) =>
    isOrphan(c) ? ORPHAN_CHAPTER_LABEL : String(c.title ?? '');

  if (articles.length === 0) {
    return chapters.map((c) => ({ title: label(c), articles: [], ...chapterLevelMeta(c) }));
  }

  const byId = new Map<string, Group<A>>();
  for (const c of chapters) {
    const id = c.id == null ? '' : String(c.id);
    if (!id || byId.has(id)) continue;
    byId.set(id, { title: label(c), isOrphan: isOrphan(c), articles: [], first: Infinity, meta: chapterLevelMeta(c) });
  }

  const ungrouped: Group<A> = {
    title: UNGROUPED_CHAPTER_LABEL, isOrphan: false, articles: [], first: Infinity, meta: {},
  };
  for (let index = 0; index < articles.length; index++) {
    const article = articles[index];
    const id = article.chapter_id == null ? '' : String(article.chapter_id);
    const group = (id && byId.get(id)) || ungrouped;
    if (group.articles.length === 0) group.first = index;
    group.articles.push(article);
  }

  const groups = [...byId.values(), ungrouped]
    .filter((g) => g.articles.length > 0)
    .sort((a, b) => a.first - b.first);

  // Rule 2: re-place each orphan chapter by article number, only when the
  // other chapters' first numbers ascend (else there is no numeric scale to
  // place it on and rule 1's position stands).
  const orphans = groups.filter((g) => g.isOrphan);
  if (orphans.length === 0) return withParentHeadings(groups, byId).map(emit);

  const rest = groups.filter((g) => !g.isOrphan);
  let ascending = true;
  let previous = -Infinity;
  for (const g of rest) {
    const n = firstNumber(g);
    if (Number.isNaN(n)) continue;
    if (n < previous) { ascending = false; break; }
    previous = n;
  }

  let ordered = groups;
  if (ascending) {
    ordered = [...rest];
    for (const orphan of orphans) {
      const min = minNumber(orphan);
      if (Number.isNaN(min)) {
        // No number to place it by: rule 1 — before the first group whose
        // first article comes after it.
        const at = ordered.findIndex((g) => g.first > orphan.first);
        ordered.splice(at === -1 ? ordered.length : at, 0, orphan);
        continue;
      }
      const at = ordered.findIndex((g) => !g.isOrphan && firstNumber(g) > min);
      ordered.splice(at === -1 ? ordered.length : at, 0, orphan);
    }
  }

  return withParentHeadings(ordered, byId).map(emit);
}

/**
 * Rule 3's exception: an article-less level-1 heading goes back in right
 * before the first kept chapter whose parent it is. Nothing else moves.
 */
function withParentHeadings<A>(ordered: Group<A>[], byId: Map<string, Group<A>>): Group<A>[] {
  const placed = new Set<string>();
  const out: Group<A>[] = [];
  for (const g of ordered) {
    if (g.meta.id) placed.add(g.meta.id);
    const parentId = g.meta.level === 2 ? g.meta.parentChapterId : null;
    if (parentId && !placed.has(parentId)) {
      const parent = byId.get(parentId);
      if (parent && parent.articles.length === 0 && parent.meta.level === 1) {
        out.push(parent);
        placed.add(parentId);
      }
    }
    out.push(g);
  }
  return out;
}
