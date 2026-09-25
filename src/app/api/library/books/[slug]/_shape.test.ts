/**
 * LIB-06 / LIB-07 regressions for the books API: the TOC is walked past the
 * 1000-row cap, section loads stay inside the book, and blocks are shaped so
 * the reader cannot throw.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BLOCKS_DEFAULT_LIMIT, BLOCKS_MAX_LIMIT, firstBlockOrderBySection, isUuid, normalizeHashiyah,
  planBlocksPage, planBlocksRequest, shapeToc,
} from "./_shape.ts";

const q = (s: string) => new URLSearchParams(s);

test("blocks page/limit: defaults, clamps, no NaN offset", () => {
  assert.deepEqual(planBlocksPage(q("")), { page: 1, limit: BLOCKS_DEFAULT_LIMIT, offset: 0 });
  assert.deepEqual(planBlocksPage(q("page=abc&limit=-3")), { page: 1, limit: BLOCKS_DEFAULT_LIMIT, offset: 0 });
  assert.deepEqual(planBlocksPage(q("page=3&limit=20")), { page: 3, limit: 20, offset: 40 });
  assert.equal(planBlocksPage(q("limit=99999")).limit, BLOCKS_MAX_LIMIT);
});

test("hashiyah is always a list of strings", () => {
  assert.deepEqual(normalizeHashiyah({}), []); // every current row
  assert.deepEqual(normalizeHashiyah(null), []);
  assert.deepEqual(normalizeHashiyah("حاشية"), ["حاشية"]);
  assert.deepEqual(normalizeHashiyah(["أ", "", 3, "ب"]), ["أ", "ب"]);
});

test("TOC keeps every chapter, sections sorted by their own order_index (no map given), missing sections → []", () => {
  const chapters = Array.from({ length: 4860 }, (_, i) => ({
    id: `c${i}`, title: `باب ${i}`, volume_number: 1, order_index: i,
    feqh_sections: i % 7 === 0 ? null : [
      { id: `s${i}b`, title: "ب", order_index: 2 },
      { id: `s${i}a`, title: "أ", order_index: 1 },
    ],
  }));
  const toc = shapeToc(chapters);
  assert.equal(toc.length, 4860);
  assert.deepEqual(toc[0].sections, []);
  assert.deepEqual(toc[1].sections.map((s) => s.id), ["s1a", "s1b"]);
  assert.deepEqual(Object.keys(toc[1].sections[0]).sort(), ["id", "title"]);
});

test("firstBlockOrderBySection: min per section, order-independent, ignores junk rows", () => {
  assert.deepEqual(
    firstBlockOrderBySection([
      { section_id: "s1", order_index: 5 },
      { section_id: "s1", order_index: 2 },
      { section_id: "s2", order_index: 9 },
      { section_id: "s1", order_index: 8 },
      { section_id: null, order_index: 1 },       // no section_id → ignored
      { section_id: "s3", order_index: "x" },      // not a number → ignored
      { section_id: "s3" },                        // missing order_index → ignored
    ]),
    { s1: 2, s2: 9 },
  );
  assert.deepEqual(firstBlockOrderBySection([]), {});
});

test("TOC sections sorted by their FIRST BLOCK's order_index, not the sentinel feqh_sections.order_index", () => {
  // Real shape: 78,303 sections carry order_index 999 (the sentinel), so the
  // old sort put every one of them in file (id) order regardless of where
  // its blocks actually sit in the book — the bug this map fixes.
  const chapters = [{
    id: "c1", title: "كتاب", volume_number: 1, order_index: 0,
    feqh_sections: [
      { id: "s-last", title: "الباب الثالث", order_index: 999 },
      { id: "s-first", title: "الباب الأول", order_index: 999 },
      { id: "s-mid", title: "الباب الثاني", order_index: 999 },
      { id: "s-empty", title: "باب بلا نص", order_index: 999 }, // no blocks at all
    ],
  }];
  const firstBlockOrder = { "s-first": 10, "s-mid": 20, "s-last": 30 };
  const toc = shapeToc(chapters, firstBlockOrder);
  // Reading order, not the sentinel-order id order ("s-first" < "s-last" < "s-mid").
  assert.deepEqual(toc[0].sections.map((s) => s.id), ["s-first", "s-mid", "s-last", "s-empty"]);
});

test("TOC section ordering: a lookup failure (no map) keeps the old order_index sort, not a crash", () => {
  const chapters = [{
    id: "c1", title: "كتاب", volume_number: 1, order_index: 0,
    feqh_sections: [
      { id: "sb", title: "ب", order_index: 2 },
      { id: "sa", title: "أ", order_index: 1 },
    ],
  }];
  assert.deepEqual(shapeToc(chapters, undefined).map((c) => c.sections.map((s) => s.id)), [["sa", "sb"]]);
});

test("route: TOC via selectAllPages ordered order_index,id; section loads scoped to the book; no empty 200", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(src, /selectAllPages/);
  assert.match(src, /from\('feqh_chapters'\)[\s\S]*?\.order\('order_index', \{ ascending: true \}\)\s*\.order\('id', \{ ascending: true \}\)\s*\.range\(from, to\)/);
  assert.match(src, /toc\.error/);
  // section_id no longer replaces the book scope — both filters apply.
  assert.match(src, /if \(sectionId\) q = q\.eq\('section_id', sectionId\);\s*if \(scope === 'byBook'\) q = q\.eq\('book_id', slug\);/);
  assert.match(src, /if \(blocksError\) \{[\s\S]*?status: 500/);
});

test("route: TOC section order comes from a per-book first-block lookup, passed into shapeToc, never a 500 on its own failure", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(src, /firstBlockOrderBySection/);
  assert.match(src, /shapeToc\(chapters, firstBlockOrder\)/);
  // Best-effort: a failed lookup only warns and leaves firstBlockOrder
  // undefined (shapeToc's fallback), it must never return a 500/response.
  assert.match(src, /section-order lookup[\s\S]{0,80}failed for "\$\{slug\}"[\s\S]{0,120}console\.warn|console\.warn\(`\[Books\] section-order lookup/);
  assert.doesNotMatch(src.slice(src.indexOf("firstBlockOrder: Record"), src.indexOf("// Fetch blocks (paginated")), /NextResponse\.json/);
});

test("section_id must be a uuid: a malformed one is a 400, before any query", () => {
  assert.equal(isUuid("91bfdd89-4f5b-5281-97ce-8bf16b84e85d"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("91bfdd89-4f5b-5281-97ce-8bf16b84e85d__blk-0"), false);
  const bad = planBlocksRequest(q("section_id=not-a-uuid"));
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.error, /[\u0600-\u06FF]/); // Arabic message
  const good = planBlocksRequest(q("section_id=91BFDD89-4F5B-5281-97CE-8BF16B84E85D"));
  assert.deepEqual(good, { ok: true, sectionId: "91BFDD89-4F5B-5281-97CE-8BF16B84E85D", selection: { mode: "page" } });
  assert.deepEqual(planBlocksRequest(q("section_id=")), { ok: true, sectionId: null, selection: { mode: "page" } });
});

test("reading-order cursors are plain integers and exclusive of each other", () => {
  assert.deepEqual(planBlocksRequest(q("from_order=120")), { ok: true, sectionId: null, selection: { mode: "after", order: 120 } });
  assert.deepEqual(planBlocksRequest(q("before_order=0")), { ok: true, sectionId: null, selection: { mode: "before", order: 0 } });
  for (const bad of ["from_order=abc", "from_order=-1", "before_order=1.5", "from_order=1),id.gt.(x", "from_order=1&before_order=2",
    "from_order=1&section_id=91bfdd89-4f5b-5281-97ce-8bf16b84e85d"]) {
    assert.equal(planBlocksRequest(q(bad)).ok, false, bad);
  }
});

test("route: 400 on a bad request, head count past the end, cursors via gte/lte", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(src, /planBlocksRequest\(searchParams\)[\s\S]*?status: 400/);
  // PGRST103 counts the same scope instead of reporting total 0.
  assert.match(src, /PGRST103[\s\S]*?countBlocks\(s\.scope\)[\s\S]*?totalBlocks = head\.count/);
  assert.match(src, /q\.gte\('order_index', selection\.order\)/);
  assert.match(src, /q\.lte\('order_index', selection\.order\)/);
  // The misleading migration hint is only logged when a column is missing.
  assert.match(src, /sawSchemaGap\s*\?/);
});
