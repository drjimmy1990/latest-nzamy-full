/**
 * LIB-07 regression: the fiqh reader consumes the books API's real shape — a
 * TOC of sections carrying only {id, title} plus top-level blocks[] — groups
 * the blocks by section, never throws on missing arrays or NULL text, and walks
 * the book in order, loading sections on demand.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  fromApiBook, fromNestedBook, filterToc, findBlock, loadedBlocks, linkRun, emptyLinks,
  mergeSectionBlocks, neighbour, normalizeBlock, orderedSectionIds, chapterOfSection,
  parseSeries, runFromCursorResponse, type BlocksBySection, type BookLinks, type CompleteSections,
} from "./_reader-model.ts";

// Shape measured from /api/library/books/الشرح الكبير على المقنع - الجزء 04.
const api = {
  id: "book-04", title: "الشرح الكبير", author: "ابن قدامة", school: "حنبلي",
  investigator: null, totalVolumes: null,
  chapters: [
    { id: "c1", title: "كتاب الطهارة", volumeNumber: 1, sections: [{ id: "s1", title: "عام" }, { id: "s2", title: "باب المياه" }] },
    { id: "c2", title: "كتاب الصلاة", volumeNumber: 1, sections: [] },
    { id: "c3", title: "كتاب الزكاة", volumeNumber: 1, sections: [{ id: "s3", title: "عام" }] },
  ],
  blocks: [
    { id: "b1", topic: "تعريف", vol: 1, page: 3, volLabel: "1", pageLabel: "3", matn: "المتن", sharh: null, hashiyah: {}, sectionId: "s1", orderIndex: 0, locked: false },
    { id: "b2", topic: "المياه", vol: null, page: null, matn: "ماء", sharh: "شرح", hashiyah: [], sectionId: "s2", orderIndex: 1, locked: true },
  ],
  pagination: { page: 1, limit: 50, total: 5, totalPages: 1 },
};

test("the real API shape builds a reader state without throwing", () => {
  const st = fromApiBook(api);
  assert.equal(st.book.chapters.length, 3);
  assert.equal(st.book.investigator, "");
  assert.equal(st.book.totalVolumes, 0);
  assert.deepEqual(Object.keys(st.blocksBySection).sort(), ["s1", "s2"]);
  assert.equal(st.firstBlockId, "b1");
  const b1 = findBlock(st.blocksBySection, "b1")!;
  assert.equal(b1.sharh, "");          // NULL sharh → "" (the reader calls .split)
  assert.deepEqual(b1.hashiyah, []);   // {} → []
  assert.equal(findBlock(st.blocksBySection, "b2")!.locked, true);
  // Only 2 of 5 blocks came with the first page: s1 is bracketed (book start,
  // then a block of s2) → complete; s2 is the last section on the page and
  // may continue on page 2 → not complete.
  assert.deepEqual(st.complete, { s1: true });
  assert.equal(st.links.prev.b1, null);
  assert.equal(st.links.next.b1, "b2");
  assert.equal("b2" in st.links.next, false);
});

test("a book whose first page holds every block marks all sections complete", () => {
  const st = fromApiBook({ ...api, pagination: { total: 2 } });
  assert.deepEqual(Object.keys(st.complete).sort(), ["s1", "s2", "s3"]);
});

test("missing arrays anywhere are tolerated", () => {
  const st = fromApiBook({ id: "x", chapters: [{ id: "c", title: "t" }, null], blocks: null });
  assert.equal(st.book.chapters.length, 1);
  assert.deepEqual(st.book.chapters[0].sections, []);
  assert.equal(st.firstBlockId, "");
  assert.deepEqual(loadedBlocks(st.blocksBySection), []);
});

test("merging de-duplicates by id and keeps book order", () => {
  let map = mergeSectionBlocks({}, [normalizeBlock({ id: "b9", sectionId: "s", orderIndex: 9 })]);
  map = mergeSectionBlocks(map, [
    normalizeBlock({ id: "b3", sectionId: "s", orderIndex: 3 }),
    normalizeBlock({ id: "b9", sectionId: "s", orderIndex: 9, topic: "محدث" }),
  ]);
  assert.deepEqual(map.s.map((b) => b.id), ["b3", "b9"]);
  assert.equal(map.s[1].topic, "محدث");
});

test("next/previous: follow links, ask for a window where the link is unknown", () => {
  const st = fromApiBook(api);
  // b1 → b2 is known from page 1; after b2 the book continues on page 2.
  assert.deepEqual(neighbour(st.blocksBySection, st.links, "b1", 1), { kind: "block", id: "b2" });
  assert.deepEqual(neighbour(st.blocksBySection, st.links, "b2", -1), { kind: "block", id: "b1" });
  assert.equal(neighbour(st.blocksBySection, st.links, "b1", -1), null); // start of the book
  assert.deepEqual(neighbour(st.blocksBySection, st.links, "b2", 1), { kind: "load", dir: 1, order: 1 });
  assert.equal(neighbour(st.blocksBySection, st.links, "missing", 1), null);
  assert.deepEqual(orderedSectionIds(st.book.chapters), ["s1", "s2", "s3"]);
  assert.equal(chapterOfSection(st.book.chapters, "s3")?.id, "c3");
});

// الشرح الكبير ج04, chapter «٤٦١ - مسألة»: the «الحاشية:» section has
// order_index 0 but holds block 2; the «عام» section has the sentinel 999 but
// holds block 1. The TOC lists them [الحاشية, عام]; the book reads 0, 1, 2.
type RawBlock = { id: string; sectionId: string; orderIndex: number; topic: string; matn: string; sharh: null; hashiyah: object; locked: boolean };
const B = (id: string, sectionId: string, orderIndex: number): RawBlock =>
  ({ id, sectionId, orderIndex, topic: "", matn: id, sharh: null, hashiyah: {}, locked: false });
const sentinelBook = {
  id: "ج04", title: "الشرح الكبير",
  chapters: [
    { id: "c0", title: "الجزء 4", sections: [{ id: "s0", title: "عام" }] },
    { id: "c461", title: "٤٦١ - مسألة", sections: [
      { id: "sHashiyah", title: "الحاشية:" }, // feqh_sections.order_index 0
      { id: "sAam", title: "عام" },           // feqh_sections.order_index 999
    ] },
  ],
  blocks: [B("blk0", "s0", 0)],
  pagination: { page: 1, limit: 1, total: 3, totalPages: 3 },
};

type Start = { blocksBySection: BlocksBySection; links: BookLinks; complete: CompleteSections };

/** Walk next/previous the way the page does, serving cursor windows from `all` like the API. */
function walk(start: Start, all: RawBlock[], dir: 1 | -1, from: string, windowSize: number) {
  let map = start.blocksBySection;
  let links = start.links;
  let complete = start.complete;
  const visited = [from];
  let requests = 0;
  let at = from;
  for (let guard = 0; guard < 5000; guard++) {
    const n = neighbour(map, links, at, dir);
    if (n === null) break;
    if (n.kind === "block") { at = n.id; visited.push(at); continue; }
    requests++;
    // The API: order_index >= N ascending (or <= N descending, then reversed), limit + 1.
    const sorted = [...all].sort((a, b) => a.orderIndex - b.orderIndex);
    const hits = dir === 1
      ? sorted.filter((b) => b.orderIndex >= n.order)
      : sorted.filter((b) => b.orderIndex <= n.order).reverse();
    const window = hits.slice(0, windowSize);
    const body = { blocks: dir === 1 ? window : [...window].reverse(), pagination: { hasMore: hits.length > windowSize } };
    const run = runFromCursorResponse(body, dir);
    ({ links, complete } = linkRun(links, complete, run, map));
    map = mergeSectionBlocks(map, run.blocks);
  }
  return { visited, requests, complete, links };
}

test("next walks book order, not TOC order (sentinel-999 sections)", () => {
  const all = [B("blk0", "s0", 0), B("blk2", "sHashiyah", 2), B("blk1", "sAam", 1)];
  const st = fromApiBook(sentinelBook);
  const fwd = walk(st, all, 1, "blk0", 200);
  assert.deepEqual(fwd.visited, ["blk0", "blk1", "blk2"]); // was blk0, blk2, blk1
  assert.equal(fwd.requests, 1);
  // The window reached the end of the book, so every section is bracketed.
  assert.deepEqual(Object.keys(fwd.complete).sort(), ["s0", "sAam", "sHashiyah"]);
  // And back again from the last block, with no request.
  const back = walk({ ...st, links: fwd.links }, all, -1, "blk2", 200);
  assert.deepEqual(back.visited, ["blk2", "blk1", "blk0"]);
  assert.equal(back.requests, 0);
});

test("a long book costs one request per window, not one per section", () => {
  // 1,000 one-block sections (مطالب ج01 has 4,031 blocks, 1 per section).
  const all = Array.from({ length: 1000 }, (_, i) => B(`b${i}`, `s${i}`, i));
  const st = fromApiBook({
    id: "ج01", chapters: [{ id: "c", title: "", sections: all.map((b) => ({ id: b.sectionId, title: "" })) }],
    blocks: all.slice(0, 50), pagination: { page: 1, limit: 50, total: 1000, totalPages: 20 },
  });
  // Page 1: 49 of its 50 sections are complete; the last one may continue.
  assert.equal(Object.keys(st.complete).length, 49);
  assert.equal(st.complete.s49, undefined);
  const res = walk(st, all, 1, "b0", 200);
  assert.deepEqual(res.visited, all.map((b) => b.id));
  assert.equal(res.requests, 5); // 950 blocks after page 1, in windows of 200
});

test("previous from a section opened mid-book links back to the book start", () => {
  const all = Array.from({ length: 10 }, (_, i) => B(`b${i}`, `s${i >> 1}`, i));
  // Opened from the TOC: only b7 is held, nothing is linked.
  const st: Start = { blocksBySection: mergeSectionBlocks({}, [normalizeBlock(all[7])]), links: emptyLinks(), complete: {} };
  assert.deepEqual(neighbour(st.blocksBySection, st.links, "b7", -1), { kind: "load", dir: -1, order: 7 });
  const back = walk(st, all, -1, "b7", 4);
  assert.deepEqual(back.visited, ["b7", "b6", "b5", "b4", "b3", "b2", "b1", "b0"]);
  assert.equal(back.requests, 3); // windows [4..7], [1..4], [0..1] (the last reaches the start)
  assert.equal(back.links.prev.b0, null);
});

test("linkRun: a section open at an unfinished edge stays incomplete", () => {
  const run = [B("a1", "sa", 10), B("a2", "sa", 11), B("b1", "sb", 12), B("c1", "sc", 13)].map((b) => normalizeBlock(b));
  const mid = linkRun(emptyLinks(), {}, { blocks: run, startsBook: false, endsBook: false });
  assert.deepEqual(mid.complete, { sb: true });
  assert.equal(mid.links.next.a1, "a2");
  assert.equal(mid.links.prev.c1, "b1");
  assert.equal("a1" in mid.links.prev, false);
  assert.equal("c1" in mid.links.next, false);
  const edges = linkRun(emptyLinks(), {}, { blocks: run, startsBook: true, endsBook: true });
  assert.deepEqual(Object.keys(edges.complete).sort(), ["sa", "sb", "sc"]);
  assert.equal(edges.links.prev.a1, null);
  assert.equal(edges.links.next.c1, null);
});

test("linkRun: a section spanning two windows completes once both are linked", () => {
  const w1 = [B("x", "sx", 0), B("a1", "sa", 1)].map((b) => normalizeBlock(b));
  const first = linkRun(emptyLinks(), {}, { blocks: w1, startsBook: true, endsBook: false });
  assert.deepEqual(first.complete, { sx: true }); // sa may continue
  const held = mergeSectionBlocks({}, w1);
  // The next window starts at the anchor a1 (from_order = 1).
  const w2 = [B("a1", "sa", 1), B("a2", "sa", 2), B("b1", "sb", 3)].map((b) => normalizeBlock(b));
  const second = linkRun(first.links, first.complete, { blocks: w2, startsBook: false, endsBook: false }, held);
  assert.deepEqual(Object.keys(second.complete).sort(), ["sa", "sx"]); // sb may continue
});

test("TOC filter: chapter titles, section titles and loaded block text", () => {
  const st = fromApiBook(api);
  assert.deepEqual(filterToc(st.book.chapters, st.blocksBySection, "الزكاه").map((c) => c.id), ["c3"]); // ة/ه folded
  const byBlock = filterToc(st.book.chapters, st.blocksBySection, "ماء");
  assert.deepEqual(byBlock.map((c) => c.id), ["c1"]);
  assert.deepEqual(byBlock[0].sections.map((s) => s.id), ["s2"]);
  assert.equal(filterToc(st.book.chapters, st.blocksBySection, "").length, 3);
});

test("the legacy nested shape (demo / JSON fallback) still reads", () => {
  const st = fromNestedBook({
    id: "rawd", title: "الروض", author: "", school: "", investigator: "", publisher: "دار", totalVolumes: 1,
    chapters: [{ title: "كتاب", sections: [{ title: "باب", blocks: [
      { id: "x1", topic: "أ", vol: 1, page: 204, matn: "م", sharh: "ش", hashiyah: ["ح"] },
      { id: "x2", topic: "ب", vol: 1, page: 205, matn: "م", sharh: "ش", hashiyah: ["ح"] },
    ] }] }],
  });
  assert.equal(st.firstBlockId, "x1");
  const sid = st.book.chapters[0].sections[0].id;
  assert.equal(st.complete[sid], true);
  assert.deepEqual(st.blocksBySection[sid].map((b) => b.id), ["x1", "x2"]);
  assert.deepEqual(neighbour(st.blocksBySection, st.links, "x1", 1), { kind: "block", id: "x2" });
  assert.equal(neighbour(st.blocksBySection, st.links, "x2", 1), null);
});

test("series (T28-24): the API's volume list reaches the reader; anything malformed is no series", () => {
  const series = {
    title: "المغني",
    volumes: [
      { id: "المغني - الجزء تقديم", label: "التقديم", title: "المغني — التقديم" },
      { id: "المغني - الجزء 01", label: "الجزء 1", title: "المغني — الجزء 1" },
      { id: "المغني - الجزء 02", label: "الجزء 2", title: "المغني — الجزء 2" },
    ],
    currentId: "المغني - الجزء 01",
  };
  const st = fromApiBook({ ...api, id: "المغني - الجزء 01", series });
  assert.deepEqual(st.book.series, series);
  // No field (a single book, or an older API) → null; the nested demo → null.
  assert.equal(fromApiBook(api).book.series, null);
  assert.equal(fromNestedBook({ id: "rawd", title: "الروض", chapters: [] }).book.series, null);
  // Malformed shapes never throw and never half-render a switcher.
  assert.equal(parseSeries(null, "x"), null);
  assert.equal(parseSeries([], "x"), null);
  assert.equal(parseSeries({ title: "المغني", volumes: series.volumes.slice(0, 1), currentId: series.volumes[0].id }, "x"), null);
  assert.equal(parseSeries({ ...series, currentId: "كتاب آخر" }, "كتاب آخر"), null); // current volume not listed
  assert.equal(parseSeries({ ...series, title: "" }, "x"), null);
  const noCurrent = parseSeries({ title: "المغني", volumes: [...series.volumes, { id: "", label: "x" }, series.volumes[1]] }, "المغني - الجزء 02");
  assert.equal(noCurrent?.currentId, "المغني - الجزء 02"); // falls back to the book id
  assert.equal(noCurrent?.volumes.length, 3);              // empty id and duplicate dropped
});

// ── N2.3: the four layer buttons ─────────────────────────────────────────────
import { READER_LAYERS, emptyLayerNote, layerShows, visibleParts } from "./_reader-model.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const layerBlock = { matn: "قال المصنف", sharh: "قال الشارح", hashiyah: ["حاشية ١", " "], locked: false };

test("N2.3: four layers, in the owner preview's order and words", () => {
  assert.deepEqual(READER_LAYERS.map((l) => l.id), ["all", "matn-only", "sharh-only", "hashiyah-only"]);
  assert.deepEqual(READER_LAYERS.map((l) => l.ar), ["التجربة الكاملة", "المتن فقط", "الشرح فقط", "الحاشية فقط"]);
});

test("N2.3: each single layer shows exactly its own part; «all» shows all three", () => {
  assert.deepEqual(visibleParts(layerBlock, "all"), ["matn", "sharh", "hashiyah"]);
  assert.deepEqual(visibleParts(layerBlock, "matn-only"), ["matn"]);
  assert.deepEqual(visibleParts(layerBlock, "sharh-only"), ["sharh"]);
  assert.deepEqual(visibleParts(layerBlock, "hashiyah-only"), ["hashiyah"]);
  assert.equal(layerShows("sharh-only", "matn"), false);
  assert.equal(layerShows("hashiyah-only", "hashiyah"), true);
});

test("N2.3: a layer the block lacks gives an honest note, not an empty card", () => {
  const noSharh = { matn: "متن", sharh: "  ", hashiyah: [] as string[], locked: false };
  assert.deepEqual(visibleParts(noSharh, "sharh-only"), []);
  assert.equal(emptyLayerNote(noSharh, "sharh-only"), "لا يوجد شرح في هذا الموضع.");
  assert.equal(emptyLayerNote(noSharh, "hashiyah-only"), "لا يوجد حاشية في هذا الموضع.");
  assert.equal(emptyLayerNote(noSharh, "matn-only"), null);
  assert.equal(emptyLayerNote(noSharh, "all"), null);
  // A locked block's lock notice already says why there is no text.
  assert.equal(emptyLayerNote({ ...noSharh, locked: true }, "sharh-only"), null);
});

test("N2.3: the reader page draws its buttons from READER_LAYERS and its parts from layerShows", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(path.join(here, "page.tsx"), "utf8");
  // Note ٠٢: each block of the stream is drawn by _stream-block.tsx.
  const block = readFileSync(path.join(here, "_stream-block.tsx"), "utf8");
  assert.match(page, /useState<ReaderLayer>\("all"\)/);
  assert.match(page, /READER_LAYERS\.map\(/);
  for (const part of ["matn", "sharh", "hashiyah"]) {
    assert.ok(block.includes(`layerShows(viewLayer, "${part}")`), `the ${part} section is gated by layerShows`);
  }
  assert.match(block, /emptyLayerNote\(block, viewLayer, isRTL\)/);
  assert.match(page, /aria-pressed=\{viewLayer === layer\.id\}/);
});

test("TOC filter matches Arabic-Indic and Western digits bidirectionally", () => {
  const st = fromApiBook(sentinelBook);
  assert.deepEqual(filterToc(st.book.chapters, st.blocksBySection, "461").map((c) => c.id), ["c461"]);
  assert.deepEqual(filterToc(st.book.chapters, st.blocksBySection, "٤").map((c) => c.id), ["c0", "c461"]);
});

// ── Owner note ٠٢: the continuous stream ─────────────────────────────────────
import {
  emptyStream, extendStream, firstStreamBlockOfSection, parseJumpQuery, planBlockJump,
  streamCursor, streamFromFirstPage, streamFromRun, streamHas, topmostVisible, type ReaderStream,
} from "./_reader-model.ts";

/** What the books API answers to ?from_order=N&limit=L (or before_order), from `all`. */
function cursorWindow(all: RawBlock[], dir: 1 | -1, order: number, limit: number) {
  const sorted = [...all].sort((a, b) => a.orderIndex - b.orderIndex || (a.id < b.id ? -1 : 1));
  const hits = dir === 1
    ? sorted.filter((b) => b.orderIndex >= order)
    : sorted.filter((b) => b.orderIndex <= order).reverse();
  const window = hits.slice(0, limit);
  return runFromCursorResponse({ blocks: dir === 1 ? window : [...window].reverse(), pagination: { hasMore: hits.length > limit } }, dir);
}

const ids = (s: ReaderStream) => s.blocks.map((b) => b.id);

test("note ٠٢: the opening page is the first stream; it ends the book only when it holds all of it", () => {
  const partial = streamFromFirstPage(fromApiBook(api));
  assert.deepEqual(ids(partial), ["b1", "b2"]);
  assert.equal(partial.startsBook, true);
  assert.equal(partial.endsBook, false);
  const whole = streamFromFirstPage(fromApiBook({ ...api, pagination: { total: 2 } }));
  assert.equal(whole.endsBook, true);
  const empty = streamFromFirstPage(fromApiBook({ id: "x", chapters: [], blocks: [] }));
  assert.deepEqual(empty, { blocks: [], startsBook: true, endsBook: true });
});

test("note ٠٢: batches append in book order; the inclusive anchor is dropped, not duplicated", () => {
  const all = Array.from({ length: 12 }, (_, i) => B(`b${i}`, `s${i >> 2}`, i));
  let s = streamFromRun(cursorWindow(all, 1, 0, 5)); // b0..b4
  assert.deepEqual(ids(s), ["b0", "b1", "b2", "b3", "b4"]);
  assert.equal(streamCursor(s, 1), 4);
  const r = extendStream(s, cursorWindow(all, 1, streamCursor(s, 1)!, 5), 1); // b4..b8
  s = r.stream;
  assert.equal(r.added, 4);
  assert.deepEqual(ids(s), ["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
  assert.equal(s.endsBook, false);
  s = extendStream(s, cursorWindow(all, 1, streamCursor(s, 1)!, 5), 1).stream; // b8..b11, the end
  assert.equal(s.endsBook, true);
  assert.equal(new Set(ids(s)).size, 12);
});

test("note ٠٢: a 1,000-block book streams to its end in windows, every block once, in order", () => {
  const all = Array.from({ length: 1000 }, (_, i) => B(`b${i}`, `s${i}`, i));
  const st = fromApiBook({
    id: "ج01", chapters: [{ id: "c", title: "", sections: all.map((b) => ({ id: b.sectionId, title: "" })) }],
    blocks: all.slice(0, 80), pagination: { page: 1, limit: 80, total: 1000, totalPages: 13 },
  });
  let s = streamFromFirstPage(st);
  let requests = 0;
  while (!s.endsBook && requests < 100) {
    requests++;
    s = extendStream(s, cursorWindow(all, 1, streamCursor(s, 1)!, 80), 1).stream;
  }
  assert.deepEqual(ids(s), all.map((b) => b.id));
  assert.equal(requests, 12); // 920 blocks after page 1, 79 new per window (the anchor repeats)
});

test("note ٠٢: a window of nothing but order_index ties adds 0 blocks — the caller stops instead of looping", () => {
  // Six blocks share order_index 5; a window of 3 from the anchor holds only ties.
  const all = [B("a", "s", 4), ...["t1", "t2", "t3", "t4", "t5", "t6"].map((id) => B(id, "s", 5))];
  let s = streamFromRun(cursorWindow(all, 1, 4, 3)); // a, t1, t2
  const r1 = extendStream(s, cursorWindow(all, 1, streamCursor(s, 1)!, 3), 1); // t1, t2, t3
  s = r1.stream;
  assert.equal(r1.added, 1);
  const again = extendStream(s, cursorWindow(all, 1, 5, 2), 1); // t1, t2 — nothing new, more follow
  assert.equal(again.added, 0);
  assert.equal(again.stream.endsBook, false);
});

test("note ٠٢: «عرض ما قبل» prepends the window before the stream and can reach the book start", () => {
  const all = Array.from({ length: 10 }, (_, i) => B(`b${i}`, "s", i));
  let s = streamFromRun(cursorWindow(all, 1, 6, 3)); // b6..b8 — a jump into the middle
  assert.equal(s.startsBook, false);
  assert.equal(streamCursor(s, -1), 6);
  s = extendStream(s, cursorWindow(all, -1, 6, 4), -1).stream; // b3..b6
  assert.deepEqual(ids(s), ["b3", "b4", "b5", "b6", "b7", "b8"]);
  assert.equal(s.startsBook, false);
  s = extendStream(s, cursorWindow(all, -1, 3, 4), -1).stream; // b0..b3, hasMore false
  assert.equal(s.startsBook, true);
  assert.equal(ids(s)[0], "b0");
});

test("note ٠٢: a jump scrolls when the stream holds the block, loads from its order when only the index knows it", () => {
  const all = Array.from({ length: 10 }, (_, i) => B(`b${i}`, `s${i >> 1}`, i));
  const s = streamFromRun(cursorWindow(all, 1, 0, 4)); // b0..b3
  const map = mergeSectionBlocks({}, all.map((b) => normalizeBlock(b)));
  assert.deepEqual(planBlockJump(s, map, "b2"), { kind: "scroll", id: "b2" });
  assert.deepEqual(planBlockJump(s, map, "b7"), { kind: "load", order: 7, id: "b7" });
  assert.equal(planBlockJump(s, map, "nope"), null);
  assert.equal(planBlockJump(s, map, ""), null);
  assert.equal(streamHas(s, "b3"), true);
  assert.equal(firstStreamBlockOfSection(s, "s1")?.id, "b2");
  assert.equal(firstStreamBlockOfSection(s, "s4"), null);
  assert.deepEqual(streamCursor(emptyStream(), 1), null);
});

test("note ٠٢: the index highlights the first block, in stream order, that crosses the reading line", () => {
  const s = streamFromRun(cursorWindow(Array.from({ length: 5 }, (_, i) => B(`b${i}`, "s", i)), 1, 0, 5));
  assert.equal(topmostVisible(s, new Set(["b3", "b1"]), "b0"), "b1");
  assert.equal(topmostVisible(s, new Set(), "b4"), "b4"); // a tall card covers the band: keep
});

test("note ٠٢: «انتقال للصفحة» parses page / volume, folds digits, and sends only numbers to the server", () => {
  assert.deepEqual(parseJumpQuery("47"), { vol: null, page: "47", server: { page: 47, vol: null } });
  assert.deepEqual(parseJumpQuery(" ٣/٤٧ "), { vol: "٣", page: "٤٧", server: { page: 47, vol: 3 } });
  assert.deepEqual(parseJumpQuery("مقدمة/3"), { vol: "مقدمة", page: "3", server: null });
  assert.deepEqual(parseJumpQuery("7-1"), { vol: null, page: "7-1", server: null });
  assert.deepEqual(parseJumpQuery(""), { vol: null, page: null, server: null });
  assert.deepEqual(parseJumpQuery("3/"), { vol: "3", page: null, server: null });
});

test("note ٠٦: the index filter speaks the search grammar (AND, exclusion) like the highlight", () => {
  const st = fromApiBook(api);
  // «ماء + شرح»: both words in b2 (section s2) → kept; «ماء -شرح» excludes it.
  assert.deepEqual(filterToc(st.book.chapters, st.blocksBySection, "ماء + شرح").map((c) => c.id), ["c1"]);
  assert.deepEqual(filterToc(st.book.chapters, st.blocksBySection, "ماء -شرح"), []);
  assert.equal(filterToc(st.book.chapters, st.blocksBySection, "  ").length, 3);
});

// ── Source contract: the single-block reader is gone ─────────────────────────
test("note ٠٢: the page renders the stream, with per-block actions, and no single-block navigation", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(path.join(here, "page.tsx"), "utf8");
  assert.doesNotMatch(page, /goToNeighbour/);
  assert.doesNotMatch(page, /الموضع التالي|الموضع السابق/);
  assert.doesNotMatch(page, /const activeBlock = findBlock/);
  assert.doesNotMatch(page, /\{activeBlock \? \(/);
  assert.match(page, /stream\.blocks\.map\(/);
  assert.match(page, /new IntersectionObserver\(/);
  assert.match(page, /sentinelRef/);
  assert.match(page, /تحميل المزيد من الصفحات/);
  assert.match(page, /from_order=\$\{/);
  // The two actions sit on each block's head, not once in the page header.
  const block = readFileSync(path.join(here, "_stream-block.tsx"), "utf8");
  assert.match(block, /نسخ بالتوثيق/);
  assert.match(block, /إضافة للمسودة/);
  assert.match(block, /\{!block\.locked && \(/);
  // Note ٠٦: ?q= and the in-page box colour the text through the shared engine.
  assert.match(page, /<HighlightProvider query=\{highlightQuery\}>/);
  assert.match(page, /<SearchLegendBar[^>]*partial/);
  for (const part of ["block.topic", "block.matn", "para", "h"]) {
    assert.ok(block.includes(`<Hl text={${part}} />`), `${part} is highlighted`);
  }
  assert.doesNotMatch(block, /dangerouslySetInnerHTML/);
});
