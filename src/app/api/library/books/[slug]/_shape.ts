/**
 * Pure helpers for GET /api/library/books/[slug] (no imports, so node:test can
 * load them without the `@/` alias).
 */

export const BLOCKS_DEFAULT_LIMIT = 50;
export const BLOCKS_MAX_LIMIT = 500;

function toInt(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * page / limit for the blocks window. `parseInt` on garbage gave NaN, and a
 * NaN offset reached `.range()`; an unbounded limit only hit max-rows. Both are
 * clamped here.
 */
export function planBlocksPage(searchParams: URLSearchParams): { page: number; limit: number; offset: number } {
  const rawLimit = toInt(searchParams.get('limit'));
  const limit = rawLimit === null || rawLimit < 1 ? BLOCKS_DEFAULT_LIMIT : Math.min(rawLimit, BLOCKS_MAX_LIMIT);
  const rawPage = toInt(searchParams.get('page'));
  const page = rawPage === null || rawPage < 1 ? 1 : rawPage;
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * The reader renders hashiyah as a list of footnotes. The column arrives as a
 * JSON object (`{}`) for every row in the current corpus, and has been a string
 * or an array in older imports; only a list of non-empty strings is a list.
 */
export function normalizeHashiyah(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((h): h is string => typeof h === 'string' && h.trim() !== '');
  }
  if (typeof value === 'string') return value.trim() ? [value] : [];
  return [];
}

type Row = Record<string, unknown>;

export interface TocChapter {
  id: unknown;
  title: unknown;
  volumeNumber: unknown;
  sections: Array<{ id: unknown; title: unknown }>;
}

/**
 * `{section_id, order_index}` rows for a whole book → each section's lowest
 * order_index (its first block's position in book order). Order-independent:
 * it takes the min per section rather than trusting the rows arrived sorted.
 * Rows with a non-finite order_index or no section_id are ignored.
 */
export function firstBlockOrderBySection(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const sid = r.section_id;
    const oi = r.order_index;
    if (typeof sid !== 'string' || sid === '' || typeof oi !== 'number' || !Number.isFinite(oi)) continue;
    if (!(sid in out) || oi < out[sid]) out[sid] = oi;
  }
  return out;
}

/**
 * Chapters (already fetched in order_index, id order) → the TOC the reader
 * consumes.
 *
 * Sections are sorted by the order_index of their OWN FIRST BLOCK, not by
 * feqh_sections.order_index: 78,303 of 139,404 sections carry the sentinel
 * 999 for that column (see route.ts), while «السابق/التالي» walks the book's
 * real block order_index. Sorting the TOC by the sentinel put a chapter's
 * sections in an order that did not match reading order, so opening a
 * section from the sidebar highlighted a different block than the one that
 * scrolled into view a moment later — the sidebar's own row for the active
 * block "jumped" once its true position was learned by paging forward.
 *
 * `firstBlockOrder` is optional: when the per-book lookup that builds it
 * fails or is skipped, sections fall back to their own order_index (the
 * previous behaviour) so a TOC still renders. A section with no blocks (no
 * entry in the map) sorts after every section that has one, within its
 * chapter — it has no reading-order position to place it by.
 */
export function shapeToc(chapters: Row[], firstBlockOrder?: Record<string, number>): TocChapter[] {
  const sortKey = (s: Row): number => {
    if (firstBlockOrder) {
      const sid = String(s.id);
      return Object.prototype.hasOwnProperty.call(firstBlockOrder, sid)
        ? firstBlockOrder[sid]
        : Number.MAX_SAFE_INTEGER;
    }
    return (s.order_index as number) ?? 0;
  };
  return chapters.map((ch) => {
    const sections = Array.isArray(ch.feqh_sections) ? (ch.feqh_sections as Row[]) : [];
    return {
      id: ch.id,
      title: ch.title,
      volumeNumber: ch.volume_number,
      sections: [...sections]
        .sort((a, b) => sortKey(a) - sortKey(b) || String(a.id).localeCompare(String(b.id)))
        .map((s) => ({ id: s.id, title: s.title })),
    };
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** feqh_sections.id is a uuid; anything else is a client error, not a query. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * How the blocks of a request are selected:
 *   page   — ?page=&limit= (the default; also used with ?section_id=).
 *   after  — ?from_order=N: blocks with order_index >= N, ascending.
 *   before — ?before_order=N: blocks with order_index <= N, descending (the
 *            route reverses them to book order).
 * The cursors walk the book in its own block order (order_index is book-global),
 * which is the reading order; the TOC's section order_index is not (78,303 of
 * 139,404 sections carry the sentinel 999). The cursor is an integer on
 * purpose: block ids are free-form varchar and never go into a filter string.
 * The anchor block and any order_index ties come back too; the reader drops
 * the blocks it already holds.
 */
export type BlocksSelection =
  | { mode: 'page' }
  | { mode: 'after'; order: number }
  | { mode: 'before'; order: number };

export type BlocksRequestPlan =
  | { ok: true; sectionId: string | null; selection: BlocksSelection }
  | { ok: false; error: string };

function toCursor(value: string | null): number | null | 'bad' {
  if (value === null) return null;
  if (!/^\d{1,9}$/.test(value.trim())) return 'bad';
  return Number(value.trim());
}

export function planBlocksRequest(searchParams: URLSearchParams): BlocksRequestPlan {
  const rawSection = searchParams.get('section_id');
  const sectionId = rawSection === null || rawSection.trim() === '' ? null : rawSection.trim();
  if (sectionId !== null && !isUuid(sectionId)) {
    return { ok: false, error: 'معرّف القسم غير صالح' };
  }
  const after = toCursor(searchParams.get('from_order'));
  const before = toCursor(searchParams.get('before_order'));
  if (after === 'bad' || before === 'bad') {
    return { ok: false, error: 'موضع القراءة المطلوب غير صالح' };
  }
  if (after !== null && before !== null) {
    return { ok: false, error: 'لا يمكن طلب ما قبل الموضع وما بعده معاً' };
  }
  if ((after !== null || before !== null) && sectionId !== null) {
    return { ok: false, error: 'لا يمكن الجمع بين القسم وموضع القراءة' };
  }
  if (after !== null) return { ok: true, sectionId, selection: { mode: 'after', order: after } };
  if (before !== null) return { ok: true, sectionId, selection: { mode: 'before', order: before } };
  return { ok: true, sectionId, selection: { mode: 'page' } };
}
