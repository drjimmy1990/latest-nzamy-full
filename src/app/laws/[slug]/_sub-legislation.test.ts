/**
 * Owner spec 06 (23 Nov, batch l14): the permanent «التشريعات الفرعية (N)» box
 * is gone from the law page (middle column AND sidebar); the middle column
 * reads: search in the full text → tabs «عرض الكل · النظام فقط · التشريعات
 * الفرعية» → that tab's options («الكل», then each sub-legislation by name) →
 * the rest. Pure order logic in _regulation-options.ts, then source contracts
 * on the page (the components are client modules).
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "src/app/laws/[slug]/_sub-legislation.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REG_OPTIONS_SHOWN,
  hasAllOption,
  regulationOptions,
  showRegulationOptions,
  visibleRegulationOptions,
} from "./_regulation-options.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("./page.tsx");
const SIDEBAR = read("./_sidebar.tsx");
const SECTION = read("./_sub-legislation.tsx");

// نظام القضاء as the owner saw it: three regulations merged into the file.
const QADA_INSTRUMENTS = [
  { ref: "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم", label: "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم" },
  { ref: "لائحة التفتيش القضائي", label: "لائحة التفتيش القضائي" },
  { ref: "اللائحة المنظمة لأعمال أعوان القضاء", label: "اللائحة المنظمة لأعمال أعوان القضاء" },
];
const QADA_INDEX = QADA_INSTRUMENTS.map((inst, i) => ({
  name: inst.label,
  entries: [{ card: [i, 0] as [number, number] }, { card: [i, 1] as [number, number] }],
}));

test("options: «الكل» then the three merged regulations by name, in the index's order", () => {
  const options = regulationOptions({ instruments: QADA_INSTRUMENTS, index: QADA_INDEX, children: [] });
  assert.deepEqual(options.map((o) => [o.kind, o.label]), QADA_INSTRUMENTS.map((i) => ["merged", i.label]));
  assert.deepEqual(options.map((o) => o.key), QADA_INSTRUMENTS.map((i) => i.ref), "a merged option filters on the instrument's ref");
  assert.equal(showRegulationOptions(options), true);
  assert.equal(hasAllOption(options), true);
  assert.equal(REG_OPTIONS_SHOWN, 3);
  assert.equal(visibleRegulationOptions(options, false, null).length, 3, "all three fit before «عرض المزيد»");
});

test("options: a regulation whose every article is withheld is still named (locked), not dropped", () => {
  // A guest: the third instrument sits wholly past the free limit — no card, not in instruments.
  const index = [
    QADA_INDEX[0],
    QADA_INDEX[1],
    { name: QADA_INSTRUMENTS[2].label, entries: [{ card: null }, { card: null }] },
  ];
  const options = regulationOptions({ instruments: QADA_INSTRUMENTS.slice(0, 2), index, children: [] });
  assert.deepEqual(options.map((o) => o.kind), ["merged", "merged", "locked"]);
  assert.equal(options[2].label, QADA_INSTRUMENTS[2].label);
});

test("options: the index maps to instruments by card, not by name (a capped index name still matches)", () => {
  const instruments = [{ ref: "R1", label: "اسم طويل جدًا للائحة" }, { ref: "R2", label: "لائحة ثانية" }];
  const index = [
    { name: "لائحة ثانية", entries: [{ card: [1, 0] as [number, number] }] },
    { name: "اسم طويل…", entries: [{ card: null }, { card: [0, 0] as [number, number] }] },
  ];
  const options = regulationOptions({ instruments, index });
  assert.deepEqual(options.map((o) => o.key), ["R2", "R1"]);
  assert.deepEqual(options.map((o) => o.label), ["لائحة ثانية", "اسم طويل جدًا للائحة"]);
});

test("options: an instrument the index did not name keeps its chip; duplicates collapse", () => {
  const options = regulationOptions({
    instruments: [{ ref: "A" }, { ref: "B", label: "ب" }],
    index: [{ name: "أ", entries: [{ card: [0, 0] as [number, number] }] }, { name: "أ-مكرر", entries: [{ card: [0, 1] as [number, number] }] }],
  });
  assert.deepEqual(options.map((o) => [o.key, o.label]), [["A", "A"], ["B", "ب"]]);
});

test("options: linked files (parent_law_id) come after the merged ones and open their own page", () => {
  const options = regulationOptions({
    instruments: [QADA_INSTRUMENTS[0]],
    index: [QADA_INDEX[0]],
    children: [{ slug: "child-a", title: "لائحة مستقلة", status: "repealed" }, { slug: "child-b", title: "" }],
  });
  assert.deepEqual(options.map((o) => o.kind), ["merged", "linked", "linked"]);
  const linked = options[1];
  assert.ok(linked.kind === "linked" && linked.slug === "child-a" && linked.status === "repealed");
  assert.equal(options[2].label, "child-b", "an untitled child is named by its slug");
  // One merged + linked: the row shows, «الكل» first, and the single merged one IS listed.
  assert.equal(showRegulationOptions(options), true);
  assert.equal(hasAllOption(options), true);
});

test("options: no row when there is nothing to choose; a linked-only law still gets one (no «الكل»)", () => {
  const one = regulationOptions({ instruments: [QADA_INSTRUMENTS[0]], index: [QADA_INDEX[0]], children: [] });
  assert.equal(showRegulationOptions(one), false, "one merged regulation alone is no choice");
  assert.equal(showRegulationOptions(regulationOptions({})), false);
  const linkedOnly = regulationOptions({ instruments: [], index: [], children: [{ slug: "c", title: "ت" }] });
  assert.equal(showRegulationOptions(linkedOnly), true);
  assert.equal(hasAllOption(linkedOnly), false);
});

test("options: an old payload without instruments uses the names read off the articles", () => {
  const options = regulationOptions({ legacyNames: ["اللائحة التنفيذية", " ", "اللائحة التنفيذية", "الضوابط"], children: [] });
  assert.deepEqual(options.map((o) => [o.kind, o.key]), [["merged", "اللائحة التنفيذية"], ["merged", "الضوابط"]]);
});

test("visible: three, then «عرض المزيد»; a chosen one past the third stays on screen", () => {
  const options = regulationOptions({ legacyNames: ["1", "2", "3", "4", "5"] });
  assert.deepEqual(visibleRegulationOptions(options, false, null).map((o) => o.key), ["1", "2", "3"]);
  assert.deepEqual(visibleRegulationOptions(options, false, "5").map((o) => o.key), ["1", "2", "3", "5"]);
  assert.equal(visibleRegulationOptions(options, true, null).length, 5);
  assert.match(SECTION, /`عرض المزيد \(\$\{more\}\)`/);
});

test("the permanent box is gone from the middle column and from the sidebar", () => {
  assert.doesNotMatch(PAGE, /<SubLegislationSection\b/);
  assert.doesNotMatch(SIDEBAR, /<SubLegislationSection\b/);
  assert.doesNotMatch(SIDEBAR, /_sub-legislation/);
  assert.doesNotMatch(SECTION, /export function SubLegislationSection\b/);
  assert.doesNotMatch(SECTION, /`التشريعات الفرعية \(\$\{/, "no «التشريعات الفرعية (N)» heading anywhere");
  // Nothing hands the sidebar an opener any more.
  assert.doesNotMatch(PAGE, /onOpenMergedRegulation=/);
  assert.doesNotMatch(SIDEBAR, /onOpenMergedRegulation/);
  // Kept: the sidebar's «بيانات اللائحة التنفيذية / التشريعات الفرعية المدمجة» (spec §٢).
  assert.match(SIDEBAR, /بيانات اللائحة التنفيذية \/ التشريعات الفرعية المدمجة/);
});

test("middle column order: search → tabs → the tab's options → موجز → the rest", () => {
  const start = PAGE.indexOf("{/* CENTER COLUMN: Articles list */}");
  const column = PAGE.slice(start, PAGE.indexOf("<HighlightProvider query=", start));
  const search = column.indexOf("<ScopedSearchPanel");
  const tabs = column.indexOf('{isRTL ? "عرض الكل" : "All View"}');
  const lawOnly = column.indexOf('{isRTL ? "النظام فقط" : "Law Only"}');
  const regTab = column.indexOf("{regulationTabLabel}");
  const options = column.indexOf("<SubLegislationOptions");
  const summary = column.indexOf("<LawSummaryBox");
  assert.ok(start > -1 && search > -1 && tabs > -1 && options > -1 && summary > -1);
  assert.ok(search < tabs && tabs < lawOnly && lawOnly < regTab && regTab < options && options < summary,
    `order: search ${search} < tabs ${tabs} < options ${options} < summary ${summary}`);
  // The search is the column's first element and shows in every view (the tabs never move).
  assert.equal(column.slice(0, search).match(/<[A-Za-z]/g)?.length, 1, "only the column's own <div> before the search");
  assert.doesNotMatch(column.slice(column.lastIndexOf("{", search), search), /viewMode/);
  // The options only under «التشريعات الفرعية», from the shared list, filtering on the chosen ref.
  assert.match(column, /\{viewMode === "regulation" && showRegulationOptions\(regOptions\) && \(\s*<SubLegislationOptions/);
  assert.match(column, /selectedKey=\{selectedRegName\}\s*onSelect=\{setSelectedRegName\}\s*onLocked=\{\(\) => setShowPaywall\(true\)\}/);
});

test("tabs wrap on a phone; the regulation views draw no chip row of their own", () => {
  assert.match(PAGE, /<div className=\{`flex flex-wrap items-center gap-1\.5 p-1 rounded-xl border [^`]*w-fit max-w-full print:hidden`\}>/);
  assert.doesNotMatch(PAGE, /REG_CHIPS_SHOWN|showAllRegChips|const instChips/);
  assert.doesNotMatch(PAGE, /availableRegNames\.map\(\(name\) =>/);
  // The flat view comes from regulationInstruments + regulationIndex; old data from the article names.
  assert.match(PAGE, /flatRegulationData\s*\? \{ instruments: law\?\.regulationInstruments, index: law\?\.regulationIndex, children: law\?\.subLegislation\?\.children \}\s*: \{ legacyNames: availableRegNames, children: law\?\.subLegislation\?\.children \}/);
});

test("linked-only sub-legislation keeps the tab and gets an honest note instead of an empty list", () => {
  assert.match(PAGE, /const hasLinkedSubLegislation = \(law\?\.subLegislation\?\.children\?\.length \?\? 0\) > 0;/);
  const choices = PAGE.slice(PAGE.indexOf("const hasViewModeChoices"), PAGE.indexOf(");", PAGE.indexOf("const hasViewModeChoices")));
  assert.match(choices, /hasLinkedSubLegislation \|\|/);
  assert.match(PAGE, /\(law\.regulationInstrumentsLocked \?\? 0\) > 0 \|\|\s*hasLinkedSubLegislation\) && \(\s*<button\s*onClick=\{\(\) => setViewMode\("regulation"\)\}/);
  assert.match(PAGE, /if \(regArticles\.length === 0 && hasLinkedSubLegislation\) \{/);
  assert.match(PAGE, /التشريعات الفرعية لهذا النظام ملفات مستقلة في المكتبة؛ اختر أحدها من الأعلى لفتحه\./);
  // With linked files the tab is always «التشريعات الفرعية», never «<one name> فقط».
  assert.match(PAGE, /if \(availableRegNames\.length === 1 && !hasLinkedSubLegislation\) \{/);
});

test("«مدمجة في هذا الملف» left the list and stays in the opened regulation's heading", () => {
  assert.doesNotMatch(SECTION, /مدمجة في هذا الملف/);
  const flat = PAGE.slice(PAGE.indexOf("{visible.map((inst) => {"), PAGE.indexOf("lockedRegCount > 0 && ("));
  assert.match(flat, /<h3[^>]*>\s*\{inst\.label \|\| inst\.ref\}[\s\S]*?مدمجة في هذا الملف/);
});

test("options component: linked files open their page with a non-«ساري» status called out; no gray-100/200 text", () => {
  assert.match(SECTION, /href=\{`\/laws\/\$\{encodeURIComponent\(o\.slug\)\}`\}/);
  assert.match(SECTION, /status\.tone !== "effective"/);
  assert.match(SECTION, /onClick=\{onLocked\}/);
  assert.match(SECTION, /\{hasAllOption\(options\) && \(/);
  assert.doesNotMatch(SECTION, /text-gray-(?:100|200)\b/);
});
