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
  runFromCursorResponse, type BlocksBySection, type BookLinks, type CompleteSections,
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
