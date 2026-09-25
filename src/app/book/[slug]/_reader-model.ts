/**
 * _reader-model.ts — the fiqh reader's data model, built from the books API.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * /api/library/books/[slug] returns a TOC — chapters[].sections[] carrying only
 * {id, title} — plus ONE page of blocks at the top level (blocks[], each with a
 * sectionId). The reader was written for an older shape with blocks nested in
 * chapters[].sections[].blocks[], and read `sec.blocks.filter(...)` straight
 * off the API JSON: a TypeError as soon as a section existed, so no book from
 * the database could be read. It also only ever asked for page 1 (50 of up to
 * 4,031 blocks).
 *
 * The reader now keeps the TOC and the blocks apart:
 *   - chapters / sections come from the TOC (complete for every book);
 *   - blocksBySection holds what has been loaded, keyed by section id;
 *   - a section is "complete" once all of its blocks are known — fetched with
 *     ?section_id= when it is opened from the TOC, or bracketed by other
 *     sections inside an ordered run (see linkRun);
 *   - «التالي / السابق» walk BOOK order (order_index), not TOC order: links
 *     between adjacent blocks come from ordered runs (page 1, and windows of
 *     ?from_order= / ?before_order=), so one request covers a whole window of
 *     blocks instead of one request per section.
 *
 * Every array is defaulted, and matn/sharh are always strings, so no field the
 * database leaves NULL (sharh is NULL on many rows; hashiyah is `{}`) can throw.
 *
 * Pure and import-free so node:test can load it.
 */

export interface ReaderBlock {
  id: string;
  topic: string;
  vol: number | null;
  page: number | null;
  volLabel: string | null;
  pageLabel: string | null;
  matn: string;
  sharh: string;
  hashiyah: string[];
  sectionId: string;
  orderIndex: number | null;
  locked: boolean;
}

export interface ReaderSection {
  id: string;
  title: string;
}

export interface ReaderChapter {
  id: string;
  title: string;
  sections: ReaderSection[];
}

export interface ReaderBook {
  id: string;
  title: string;
  author: string;
  school: string;
  investigator: string;
  publisher: string;
  totalVolumes: number;
  chapters: ReaderChapter[];
}

export type BlocksBySection = Record<string, ReaderBlock[]>;
export type CompleteSections = Record<string, true>;

type Row = Record<string, unknown>;

const str = (v: unknown): string =>
  typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const rows = (v: unknown): Row[] =>
  Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === "object") : [];

export function normalizeHashiyah(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((h): h is string => typeof h === "string" && h.trim() !== "");
  }
  if (typeof value === "string") return value.trim() ? [value] : [];
  return [];
}

export function normalizeBlock(raw: Row, fallbackSectionId = ""): ReaderBlock {
  return {
    id: str(raw.id),
    topic: str(raw.topic),
    vol: numOrNull(raw.vol),
    page: numOrNull(raw.page),
    volLabel: strOrNull(raw.volLabel),
    pageLabel: strOrNull(raw.pageLabel),
    matn: str(raw.matn),
    sharh: str(raw.sharh),
    hashiyah: normalizeHashiyah(raw.hashiyah),
    sectionId: str(raw.sectionId) || fallbackSectionId,
    orderIndex: numOrNull(raw.orderIndex),
    locked: raw.locked === true,
  };
}

function bookMeta(api: Row, chapters: ReaderChapter[]): ReaderBook {
  return {
    id: str(api.id),
    title: str(api.title),
    author: str(api.author),
    school: str(api.school),
    investigator: str(api.investigator),
    publisher: str(api.publisher),
    totalVolumes: numOrNull(api.totalVolumes) ?? 0,
    chapters,
  };
}

function compareBlocks(a: ReaderBlock, b: ReaderBlock): number {
  if (a.orderIndex !== null && b.orderIndex !== null && a.orderIndex !== b.orderIndex) {
    return a.orderIndex - b.orderIndex;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merge blocks into the per-section map: de-duplicated by id, each section
 * sorted by the book-global order_index (then id). Returns a new map.
 */
export function mergeSectionBlocks(map: BlocksBySection, blocks: ReaderBlock[]): BlocksBySection {
  if (blocks.length === 0) return map;
  const next: BlocksBySection = { ...map };
  const touched = new Set<string>();
  for (const b of blocks) {
    if (!b.id || !b.sectionId) continue;
    const list = touched.has(b.sectionId) ? next[b.sectionId] : [...(next[b.sectionId] ?? [])];
    touched.add(b.sectionId);
    const at = list.findIndex((x) => x.id === b.id);
    if (at >= 0) list[at] = b;
    else list.push(b);
    next[b.sectionId] = list;
  }
  for (const id of touched) next[id].sort(compareBlocks);
  return next;
}

/**
 * Reading-order links between blocks: next[id] / prev[id] is the adjacent
 * block in BOOK order (the book-global order_index), null at the book's edge,
 * and absent while unknown. They are only ever recorded from an ordered run —
 * page 1 or a from_order / before_order window — never from the TOC: the TOC
 * orders sections by feqh_sections.order_index, and 78,303 of 139,404 sections
 * carry the sentinel 999, so walking it put footnotes before their matn
 * (الشرح الكبير ج04: 0, 2, 1, 5, 3, 4 …).
 */
export interface BookLinks {
  next: Record<string, string | null>;
  prev: Record<string, string | null>;
}

export const emptyLinks = (): BookLinks => ({ next: {}, prev: {} });

/** Blocks that are adjacent in book order, plus whether the run touches either end of the book. */
export interface OrderedRun {
  blocks: ReaderBlock[];
  startsBook: boolean;
  endsBook: boolean;
}

/**
 * Record an ordered run: link its neighbours, and mark as complete every
 * section whose blocks the run brackets on both sides — by a block of another
 * section or by the edge of the book. (Sections are contiguous in book order:
 * measured 0 non-contiguous sections on ج04 and ج01.) The first page therefore
 * completes every section on it except the last one, which may continue on
 * page 2; stepping «التالي» from those blocks needs no request at all.
 */
export function linkRun(
  links: BookLinks,
  complete: CompleteSections,
  run: OrderedRun,
  held: BlocksBySection = {},
): { links: BookLinks; complete: CompleteSections } {
  const blocks = [...run.blocks].sort(compareBlocks).filter((b, i, a) => i === 0 || a[i - 1].id !== b.id);
  const next = { ...links.next };
  const prev = { ...links.prev };
  for (let i = 0; i + 1 < blocks.length; i++) {
    next[blocks[i].id] = blocks[i + 1].id;
    prev[blocks[i + 1].id] = blocks[i].id;
  }
  if (blocks.length > 0) {
    if (run.startsBook) prev[blocks[0].id] = null;
    if (run.endsBook) next[blocks[blocks.length - 1].id] = null;
  }

  const done: CompleteSections = { ...complete };
  // Maximal groups of consecutive blocks from one section.
  const groups: Array<{ sectionId: string; first: number; last: number }> = [];
  blocks.forEach((b, i) => {
    const g = groups[groups.length - 1];
    if (g && g.sectionId === b.sectionId) g.last = i;
    else groups.push({ sectionId: b.sectionId, first: i, last: i });
  });
  // An edge group is still closed when links recorded by EARLIER runs lead,
  // through blocks of the same section, to the book's edge or to another
  // section (a section that spans two windows).
  const sectionOf = new Map<string, string>();
  for (const list of Object.values(held)) for (const b of list) sectionOf.set(b.id, b.sectionId);
  for (const b of blocks) sectionOf.set(b.id, b.sectionId);
  const closedVia = (fromId: string, sectionId: string, step: Record<string, string | null>) => {
    let id = fromId;
    for (let guard = 0; guard < 10000; guard++) {
      if (!Object.prototype.hasOwnProperty.call(step, id)) return false; // unknown
      const nextId = step[id];
      if (nextId === null) return true; // the book's edge
      const s = sectionOf.get(nextId);
      if (s === undefined) return false;
      if (s !== sectionId) return true; // another section
      id = nextId;
    }
    return false;
  };
  groups.forEach((g, gi) => {
    const openBefore = gi === 0 && !run.startsBook && !closedVia(blocks[g.first].id, g.sectionId, prev);
    const openAfter = gi === groups.length - 1 && !run.endsBook && !closedVia(blocks[g.last].id, g.sectionId, next);
    if (!openBefore && !openAfter && g.sectionId) done[g.sectionId] = true;
  });
  return { links: { next, prev }, complete: done };
}

export interface ReaderState {
  book: ReaderBook;
  blocksBySection: BlocksBySection;
  complete: CompleteSections;
  links: BookLinks;
  firstBlockId: string;
}

/** The books API response → reader state. */
export function fromApiBook(api: Row): ReaderState {
  const chapters: ReaderChapter[] = rows(api.chapters).map((ch, ci) => ({
    id: str(ch.id) || `chapter-${ci}`,
    title: str(ch.title),
    sections: rows(ch.sections)
      .map((s) => ({ id: str(s.id), title: str(s.title) }))
      .filter((s) => s.id !== ""),
  }));
  const blocks = rows(api.blocks).map((b) => normalizeBlock(b)).filter((b) => b.id && b.sectionId);
  const blocksBySection = mergeSectionBlocks({}, blocks);

  const pagination = (api.pagination ?? {}) as Row;
  const total = numOrNull(pagination.total);
  const page = numOrNull(pagination.page) ?? 1;
  const wholeBook = total !== null && blocks.length >= total && page === 1;
  // The first page is an ordered run from the start of the book.
  const linked = linkRun(emptyLinks(), {}, { blocks, startsBook: page === 1, endsBook: wholeBook });
  const complete = linked.complete;
  // When the first page already holds every block of the book, every section
  // is complete (sections without blocks are complete and empty).
  if (wholeBook) {
    for (const ch of chapters) for (const s of ch.sections) complete[s.id] = true;
  }
  return {
    book: bookMeta(api, chapters),
    blocksBySection,
    complete,
    links: linked.links,
    firstBlockId: [...blocks].sort(compareBlocks)[0]?.id ?? "",
  };
}

/**
 * A from_order / before_order response → the ordered run it proves. The window
 * starts at the first block at-or-past the cursor (ties included), so the whole
 * response is contiguous in book order; `hasMore: false` means it reaches the
 * book's end (after) or start (before).
 */
export function runFromCursorResponse(api: Row, dir: 1 | -1): OrderedRun {
  const blocks = rows(api.blocks).map((b) => normalizeBlock(b)).filter((b) => b.id && b.sectionId);
  const pagination = (api.pagination ?? {}) as Row;
  const reachesEdge = pagination.hasMore === false;
  return {
    blocks,
    startsBook: dir === -1 && reachesEdge,
    endsBook: dir === 1 && reachesEdge,
  };
}

/**
 * A book in the legacy nested shape (the bundled demo and JSON fallbacks):
 * chapters[].sections[].blocks[], with no ids on chapters or sections.
 */
export function fromNestedBook(nested: Row): ReaderState {
  const allBlocks: ReaderBlock[] = [];
  const complete: CompleteSections = {};
  const chapters: ReaderChapter[] = rows(nested.chapters).map((ch, ci) => ({
    id: str(ch.id) || `chapter-${ci}`,
    title: str(ch.title),
    sections: rows(ch.sections).map((s, si) => {
      const id = str(s.id) || `c${ci}-s${si}`;
      complete[id] = true;
      rows(s.blocks).forEach((b) => {
        const block = normalizeBlock(b, id);
        block.sectionId = id;
        if (block.orderIndex === null) block.orderIndex = allBlocks.length;
        allBlocks.push(block);
      });
      return { id, title: str(s.title) };
    }),
  }));
  // The nested book is the whole book, already in reading order.
  const { links } = linkRun(emptyLinks(), {}, { blocks: allBlocks, startsBook: true, endsBook: true });
  return {
    book: bookMeta(nested, chapters),
    blocksBySection: mergeSectionBlocks({}, allBlocks),
    complete,
    links,
    firstBlockId: allBlocks[0]?.id ?? "",
  };
}

/** Section ids in TOC order (the sidebar's order — not necessarily reading order). */
export function orderedSectionIds(chapters: ReaderChapter[]): string[] {
  return chapters.flatMap((ch) => ch.sections.map((s) => s.id));
}

export function findBlock(map: BlocksBySection, blockId: string): ReaderBlock | null {
  if (!blockId) return null;
  for (const list of Object.values(map)) {
    const hit = list.find((b) => b.id === blockId);
    if (hit) return hit;
  }
  return null;
}

/** Every loaded block, in book order (the book-global order_index, then id). */
export function loadedBlocks(map: BlocksBySection): ReaderBlock[] {
  return Object.values(map).flat().sort(compareBlocks);
}

export type Neighbour =
  | { kind: "block"; id: string }
  | { kind: "load"; dir: 1 | -1; order: number }
  | null;

/**
 * The block after (dir = 1) or before (dir = -1) the active one, in BOOK order.
 * Follows a recorded link when there is one (null = the book's edge). When the
 * link is unknown, returns { kind: "load", dir, order } — the caller fetches
 * the window from_order / before_order = the active block's order_index,
 * records it with linkRun, and asks again.
 */
export function neighbour(
  map: BlocksBySection,
  links: BookLinks,
  activeId: string,
  dir: 1 | -1,
): Neighbour {
  const known = dir === 1 ? links.next : links.prev;
  if (Object.prototype.hasOwnProperty.call(known, activeId)) {
    const id = known[activeId];
    return id ? { kind: "block", id } : null;
  }
  const active = findBlock(map, activeId);
  if (!active || active.orderIndex === null) return null;
  return { kind: "load", dir, order: active.orderIndex };
}

const norm = (s: string) =>
  s.replace(/[أإآا]/g, "ا").replace(/[ةه]/g, "ه").replace(/[يى]/g, "ي").toLowerCase();

/**
 * Filter the TOC by a query: a chapter whose title matches keeps all its
 * sections; otherwise a section stays when its title or one of its LOADED
 * blocks matches. Blocks not loaded yet cannot be searched on the client.
 */
export function filterToc(chapters: ReaderChapter[], map: BlocksBySection, query: string): ReaderChapter[] {
  const q = norm(query.trim());
  if (!q) return chapters;
  const blockHit = (b: ReaderBlock) =>
    norm(b.topic).includes(q) || norm(b.matn).includes(q) || norm(b.sharh).includes(q);
  const out: ReaderChapter[] = [];
  for (const ch of chapters) {
    if (norm(ch.title).includes(q)) {
      out.push(ch);
      continue;
    }
    const sections = ch.sections.filter(
      (s) => norm(s.title).includes(q) || (map[s.id] ?? []).some(blockHit),
    );
    if (sections.length > 0) out.push({ ...ch, sections });
  }
  return out;
}

/** The chapter that holds a section (for the header of the active block). */
export function chapterOfSection(chapters: ReaderChapter[], sectionId: string): ReaderChapter | null {
  return chapters.find((ch) => ch.sections.some((s) => s.id === sectionId)) ?? null;
}
