/**
 * _regulation-index.test.ts — owner file 16 §2 (screenshot 02): the
 * sub-legislation index lists every instrument by its own name and every one
 * of its articles by its own number, for every viewer; a locked article is a
 * title with no text and no card; an open one lands on its card.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRegulationIndex, regulationEntryLabel, type RegulationIndexRow } from "./_regulation-index.ts";

const raw = (ref: string) => ref;

test("judiciary-law shape: three instruments, every row listed, locked rows have no card", () => {
  // Rows in article order: article 1 (free) carries the آلية, article 6 (locked) the تفتيش, article 81 (locked) the أعوان.
  const rows: RegulationIndexRow[] = [
    { ref: "آلية العمل التنفيذية", regNum: "2", sortKey: "a-0002", locked: false },
    { ref: "آلية العمل التنفيذية", regNum: "1", sortKey: "a-0001", locked: false },
    { ref: "لائحة التفتيش القضائي", regNum: "الأولى", sortKey: "b-0001", locked: true },
    { ref: "لائحة التفتيش القضائي", regNum: "", sortKey: "b-0002", locked: true },
    { ref: "اللائحة المنظمة لأعوان القضاء", regNum: "المادة 3", sortKey: "c-0003", locked: true },
  ];
  const idx = buildRegulationIndex(rows, raw);
  assert.deepEqual(idx.map((i) => i.name), ["آلية العمل التنفيذية", "لائحة التفتيش القضائي", "اللائحة المنظمة لأعوان القضاء"]);
  assert.deepEqual(idx[0].entries, [
    { label: "المادة 1", locked: false, card: [0, 0] },
    { label: "المادة 2", locked: false, card: [0, 1] },
  ]);
  assert.deepEqual(idx[1].entries, [
    { label: "المادة الأولى", locked: true, card: null },
    { label: "(2)", locked: true, card: null },
  ]);
  assert.deepEqual(idx[2].entries, [{ label: "المادة 3", locked: true, card: null }]);
  assert.ok(!JSON.stringify(idx).includes("text"), "no text field");
});

test("card places follow the flat view: instruments by first unlocked row, rows by sort_key among the unlocked", () => {
  const rows: RegulationIndexRow[] = [
    { ref: "أ", regNum: "1", sortKey: "1", locked: true },
    { ref: "ب", regNum: "1", sortKey: "1", locked: false },
    { ref: "أ", regNum: "2", sortKey: "2", locked: false },
  ];
  const idx = buildRegulationIndex(rows, raw);
  assert.deepEqual(idx[0].entries.map((e) => e.card), [null, [1, 0]], "«أ» is the flat view's second instrument");
  assert.deepEqual(idx[1].entries.map((e) => e.card), [[0, 0]]);
});

test("names are the viewer's names: a name with a decree number is cleaned or replaced, never shown raw", () => {
  const idx = buildRegulationIndex([{ ref: "قرار رقم (١٢) وتاريخ ١٤٤٠/١/١", regNum: "1", sortKey: "1", locked: true }], () => "");
  assert.equal(idx[0].name, "التشريع الفرعي");
  assert.equal(regulationEntryLabel(" ٥ ", 0), "المادة ٥");
  assert.equal(regulationEntryLabel(null, 3), "(4)");
});

test("the law route builds the index from the same rows, before the paywall, with the viewer's names", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /regulationIndexRows\.push\(\{ ref, regNum: r\.reg_num, sortKey: r\.sort_key, locked: parentLocked \}\);\s*\/\/ Counted after the exclusions above/);
  assert.match(route, /buildRegulationIndex\(regulationIndexRows, \(ref\) =>\s*regulationRefForViewer\(ref, officialMeta\.officialMetaLocked\),?\s*\)/);
  assert.match(route, /\.sort\(\(a, b\) => compareRegulationSortKey\(a\.sort_key, b\.sort_key\)\)/, "one row order for the view and the index");
  assert.match(route, /regulationInstrumentsLocked,\s*regulationIndex,/);
});

test("the reader lists the index in the regulation view: names, numbers, a lock for a locked entry", () => {
  const sidebar = readFileSync(new URL("../../../../laws/[slug]/_sidebar.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../../../laws/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /viewMode === "regulation" && onRegulationCardJump && \(law\.regulationIndex\?\.length \?\? 0\) > 0 \?/);
  assert.match(sidebar, /onRegulationCardJump\(regulationCardId\(e\.card\[0\], e\.card\[1\]\)\)/);
  assert.match(sidebar, /setShowPaywall\(true\);/);
  assert.match(page, /regulationIndex: Array\.isArray\(data\.regulationIndex\) \? data\.regulationIndex : \[\],/);
  assert.equal((page.match(/onRegulationCardJump=\{flatRegulationView \? onRegulationCardJump : undefined\}/g) ?? []).length, 2);
});
