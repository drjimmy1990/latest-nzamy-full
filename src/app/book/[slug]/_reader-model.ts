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
 *   - the page reads a continuous STREAM in BOOK order (order_index), not TOC
 *     order (owner note ٠٢, see ReaderStream below): windows of ?from_order= /
 *     ?before_order= extend it, one request per window. Links between adjacent
 *     blocks (linkRun) are still recorded from every ordered run — they tell
 *     which sections are complete.
 *
 * Every array is defaulted, and matn/sharh are always strings, so no field the
 * database leaves NULL (sharh is NULL on many rows; hashiyah is `{}`) can throw.
 *
 * Pure, and imports only pure modules by relative path, so node:test can load it.
 */

import { matchesQuery, parseHighlightQuery } from "../../../lib/search/multiColorSearch.ts";

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

/** One volume of a multi-volume series, as the books API lists it (T28-24). */
export interface ReaderSeriesVolume {
  id: string;
  /** Short switcher label: «الجزء 3», «المقدمة», «الجزء 7 – المجلد 2». */
  label: string;
  /** The volume's full title. */
  title: string;
}

export interface ReaderSeries {
  /** The base title shared by every volume. */
  title: string;
  /** Every volume, in reading order. */
  volumes: ReaderSeriesVolume[];
  currentId: string;
}

export interface ReaderBook {
  id: string;
  title: string;
  author: string;
  school: string;
  investigator: string;
  publisher: string;
  /** Owner ٢٦٣: the book's short summary (feqh_books.description); "" when none. */
  description: string;
  /** feqh_books.total_volumes — this row's own volume number, NOT a series size. */
  totalVolumes: number;
  /** The series this volume belongs to, or null for a single book. */
  series: ReaderSeries | null;
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

/**
 * The API's `series` field → a switcher the reader can trust, or null. A
 * series needs a title, at least two volumes with an id and a label, and must
 * contain the volume being read; anything else is treated as "no series".
 */
export function parseSeries(value: unknown, bookId: string): ReaderSeries | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Row;
  const title = str(s.title).trim();
  const seen = new Set<string>();
  const volumes = rows(s.volumes)
    .map((v) => ({ id: str(v.id), label: str(v.label).trim(), title: str(v.title) }))
    .filter((v) => {
      if (!v.id || !v.label || seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
  const currentId = str(s.currentId) || bookId;
  if (!title || volumes.length < 2 || !volumes.some((v) => v.id === currentId)) return null;
  return { title, volumes, currentId };
}

function bookMeta(api: Row, chapters: ReaderChapter[]): ReaderBook {
  const id = str(api.id);
  return {
    id,
    title: str(api.title),
    author: str(api.author),
    school: str(api.school),
    investigator: str(api.investigator),
    publisher: str(api.publisher),
    description: str(api.description).trim(),
    totalVolumes: numOrNull(api.totalVolumes) ?? 0,
    series: parseSeries(api.series, id),
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

// ── The continuous stream (owner note ٠٢) ───────────────────────────────────
//
// The reader used to show ONE block (activeBlock) and walk the book with
// «الموضع التالي / السابق» — on الوسيط ج1 page 1 that was a single line of
// author and publisher. It now shows a stream: a run of blocks contiguous in
// BOOK order (order_index), rendered one under another. The first batch comes
// with the opening request; the next one is appended when the reader nears the
// end (?from_order= the last block's order — inclusive, so the anchor and any
// order_index ties come back and are dropped here by id). A jump to a place
// outside the stream (an index entry, «انتقال للصفحة») replaces the stream
// with a new run that starts there and continues downward.

/** A run of blocks contiguous in book order, plus whether it touches either end of the book. */
export interface ReaderStream {
  blocks: ReaderBlock[];
  startsBook: boolean;
  endsBook: boolean;
}

export const emptyStream = (): ReaderStream => ({ blocks: [], startsBook: false, endsBook: false });

/** Sort into book order and drop repeated ids (the later copy wins: it is the fresher answer). */
function dedupeInOrder(blocks: ReaderBlock[]): ReaderBlock[] {
  const byId = new Map<string, ReaderBlock>();
  for (const b of blocks) if (b.id) byId.set(b.id, b);
  return [...byId.values()].sort(compareBlocks);
}

/** The opening request's blocks (page 1 of the book) as the first stream. */
export function streamFromFirstPage(state: Pick<ReaderState, "blocksBySection" | "links">): ReaderStream {
  const blocks = loadedBlocks(state.blocksBySection);
  if (blocks.length === 0) return { blocks, startsBook: true, endsBook: true };
  return {
    blocks,
    startsBook: true,
    // linkRun recorded the book's end on the last block when page 1 held all of it.
    endsBook: state.links.next[blocks[blocks.length - 1].id] === null,
  };
}

/**
 * Append (dir = 1) or prepend (dir = -1) one cursor window to the stream.
 * `added` counts the blocks that were not held yet: 0 while the server says
 * more follow means the window was all order_index ties of the anchor — the
 * caller stops auto-loading instead of asking for the same window forever
 * (a `+1` cursor would silently skip the rest of the ties).
 */
export function extendStream(stream: ReaderStream, run: OrderedRun, dir: 1 | -1): { stream: ReaderStream; added: number } {
  const held = new Set(stream.blocks.map((b) => b.id));
  const added = run.blocks.filter((b) => b.id && !held.has(b.id)).length;
  const blocks = dir === 1
    ? dedupeInOrder([...stream.blocks, ...run.blocks])
    : dedupeInOrder([...run.blocks, ...stream.blocks]);
  return {
    stream: {
      blocks,
      startsBook: stream.startsBook || run.startsBook,
      endsBook: stream.endsBook || run.endsBook,
    },
    added,
  };
}

/**
 * A new stream from a cursor window (a jump): it starts where the window
 * starts. `links` (recorded by earlier runs — page 1 records the book's first
 * block) tell when that start, or the window's end, is an edge of the book, so
 * a jump to the first chapter offers no «عرض ما قبل».
 */
export function streamFromRun(run: OrderedRun, links: BookLinks = emptyLinks()): ReaderStream {
  const blocks = dedupeInOrder(run.blocks);
  const first = blocks[0]?.id;
  const last = blocks[blocks.length - 1]?.id;
  return {
    blocks,
    startsBook: run.startsBook || (first !== undefined && links.prev[first] === null),
    endsBook: run.endsBook || (last !== undefined && links.next[last] === null),
  };
}

/**
 * The slice of the index (chapters) the sidebar renders: `count` rows, plus
 * `before` rows revealed above. When the chapter being read lies past the
 * first `count` rows, the slice is centred on it instead of growing from
 * chapter 0 — a jump to page 900 of a 4,860-chapter book must not mount
 * thousands of rows (what the step was introduced to stop).
 */
export function tocWindow(
  total: number,
  activeIndex: number,
  count: number,
  before: number,
  step: number,
): { start: number; end: number } {
  const anchor = activeIndex >= count ? Math.max(0, activeIndex - Math.floor(step / 2)) : 0;
  return { start: Math.max(0, anchor - before), end: Math.min(total, anchor + count) };
}

/** The order_index to ask ?from_order= for (dir 1) or ?before_order= for (dir -1); null = nothing to anchor on. */
export function streamCursor(stream: ReaderStream, dir: 1 | -1): number | null {
  const orders = stream.blocks.map((b) => b.orderIndex).filter((o): o is number => o !== null);
  if (orders.length === 0) return null;
  return dir === 1 ? Math.max(...orders) : Math.min(...orders);
}

export function streamHas(stream: ReaderStream, blockId: string): boolean {
  return stream.blocks.some((b) => b.id === blockId);
}

/**
 * Where a jump to a block goes: scroll to it when the stream holds it; load a
 * new stream from its order_index when the reader knows the block (from the
 * index) but the stream does not hold it; null when its place is unknown.
 */
export type JumpPlan = { kind: "scroll"; id: string } | { kind: "load"; order: number; id: string } | null;

export function planBlockJump(stream: ReaderStream, map: BlocksBySection, blockId: string): JumpPlan {
  if (!blockId) return null;
  if (streamHas(stream, blockId)) return { kind: "scroll", id: blockId };
  const known = findBlock(map, blockId);
  if (!known || known.orderIndex === null) return null;
  return { kind: "load", order: known.orderIndex, id: blockId };
}

/** The first block of a section the stream holds (opening a section from the index), or null. */
export function firstStreamBlockOfSection(stream: ReaderStream, sectionId: string): ReaderBlock | null {
  return stream.blocks.find((b) => b.sectionId === sectionId) ?? null;
}

/**
 * The block the reader is on: the first one, in stream order, whose card
 * crosses the reading line (the IntersectionObserver's band). When none does
 * (a tall card covers the band), the previous answer stands.
 */
export function topmostVisible(stream: ReaderStream, visible: ReadonlySet<string>, previous: string): string {
  for (const b of stream.blocks) if (visible.has(b.id)) return b.id;
  return previous;
}

const foldDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/**
 * «انتقال للصفحة»: "47" → page 47 in any volume; "3/47" → volume 3, page 47
 * (Arabic-Indic digits accepted). `serverPage` / `serverVol` are set when the
 * tokens are plain numbers, so the books API can find a page the stream does
 * not hold yet (?at_page=); a label such as «مقدمة» is matched on the loaded
 * blocks only (`server` is then null).
 */
export function parseJumpQuery(query: string): {
  vol: string | null;
  page: string | null;
  server: { page: number; vol: number | null } | null;
} {
  const trimmed = query.trim();
  let vol: string | null = null;
  let page: string | null = trimmed || null;
  if (trimmed.includes("/")) {
    const [v, p] = trimmed.split("/");
    vol = v.trim() || null;
    page = (p ?? "").trim() || null;
  }
  const asInt = (t: string | null) => {
    if (t === null) return null;
    const f = foldDigits(t).trim();
    return /^\d{1,9}$/.test(f) ? Number(f) : null;
  };
  const serverPage = asInt(page);
  const serverVol = asInt(vol);
  // A token that is not a number cannot go to the server — not even half of
  // it («مقدمة/3» is not «page 3 in any volume»).
  const server = serverPage === null || (vol !== null && serverVol === null)
    ? null
    : { page: serverPage, vol: serverVol };
  return { vol, page, server };
}

/**
 * Filter the TOC by a query: a chapter whose title matches keeps all its
 * sections; otherwise a section stays when its title or one of its LOADED
 * blocks matches. Blocks not loaded yet cannot be searched on the client.
 * Folding (ا/أ/إ/آ, ة/ه, ي/ى, the three digit scripts, harakat) is the
 * shared engine's (src/lib/search/multiColorSearch.ts).
 */
export function filterToc(chapters: ReaderChapter[], map: BlocksBySection, query: string): ReaderChapter[] {
  // Owner note ٠٦: the box speaks the library's grammar (space/+ AND, "…",
  // /, word*, -word) — the same parser that colours the matches in the text,
  // so the index and the highlight never disagree.
  const parsed = parseHighlightQuery(query);
  // Nothing to match on (an empty box, or only punctuation) filters nothing.
  if (parsed.groups.length === 0 && parsed.excluded.length === 0) return chapters;
  const hit = (...fields: string[]) => matchesQuery(fields, parsed);
  const blockHit = (b: ReaderBlock) => hit(b.topic, b.matn, b.sharh, ...b.hashiyah);
  const out: ReaderChapter[] = [];
  for (const ch of chapters) {
    if (hit(ch.title)) {
      out.push(ch);
      continue;
    }
    const sections = ch.sections.filter(
      (s) => hit(s.title) || (map[s.id] ?? []).some(blockHit),
    );
    if (sections.length > 0) out.push({ ...ch, sections });
  }
  return out;
}

/** The chapter that holds a section (for the header of the active block). */
export function chapterOfSection(chapters: ReaderChapter[], sectionId: string): ReaderChapter | null {
  return chapters.find((ch) => ch.sections.some((s) => s.id === sectionId)) ?? null;
}

// ── Text layers (N2.3) ───────────────────────────────────────────────────────

/**
 * The reader's layer switch: the whole block, or one of its three layers
 * (feqh_blocks.matn / sharh / hashiyah). The owner preview (2026-10-22) names
 * the four buttons «التجربة الكاملة | المتن فقط | الشرح فقط | الحاشية فقط».
 */
export type ReaderLayer = "all" | "matn-only" | "sharh-only" | "hashiyah-only";
export type ReaderLayerPart = "matn" | "sharh" | "hashiyah";

export const READER_LAYERS: ReadonlyArray<{ id: ReaderLayer; ar: string; en: string }> = [
  { id: "all", ar: "التجربة الكاملة", en: "Full View" },
  { id: "matn-only", ar: "المتن فقط", en: "Matn Only" },
  { id: "sharh-only", ar: "الشرح فقط", en: "Sharh Only" },
  { id: "hashiyah-only", ar: "الحاشية فقط", en: "Hashiyah Only" },
];

/** Does `layer` show this part of a block? */
export function layerShows(layer: ReaderLayer, part: ReaderLayerPart): boolean {
  if (layer === "all") return true;
  return layer === `${part}-only`;
}

function hasPart(block: Pick<ReaderBlock, "matn" | "sharh" | "hashiyah">, part: ReaderLayerPart): boolean {
  if (part === "hashiyah") return block.hashiyah.some((h) => h.trim() !== "");
  return block[part].trim() !== "";
}

/** The parts of `block` the reader draws under `layer` (only parts with text). */
export function visibleParts(block: Pick<ReaderBlock, "matn" | "sharh" | "hashiyah">, layer: ReaderLayer): ReaderLayerPart[] {
  return (["matn", "sharh", "hashiyah"] as const).filter((p) => layerShows(layer, p) && hasPart(block, p));
}

/**
 * The honest one-liner for a single-layer view of a block that has no text in
 * that layer (instead of an empty card), or null when there is something to
 * show. A locked block says nothing here: its lock notice covers it.
 */
export function emptyLayerNote(block: Pick<ReaderBlock, "matn" | "sharh" | "hashiyah" | "locked">, layer: ReaderLayer, isRTL = true): string | null {
  if (layer === "all" || block.locked || visibleParts(block, layer).length > 0) return null;
  const name = { "matn-only": ["متن", "matn"], "sharh-only": ["شرح", "sharh"], "hashiyah-only": ["حاشية", "hashiyah"] }[layer];
  return isRTL ? `لا يوجد ${name[0]} في هذا الموضع.` : `No ${name[1]} at this point.`;
}
