/**
 * _children.test.ts — library agent's request of 19 Nov §1.8 (batch l10):
 * sub-legislation is linked by the CHILD's `parent_law_id` (= the parent's
 * instrument_id, which the parser stores as instrument_id || id); the code
 * computes the counter and the order «اللائحة التنفيذية أولاً ثم الأحدث».
 * Pure helpers, then source contracts on the law route, the catalogue route,
 * the law page and the section component.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHILD_COUNT_ID_CHUNK,
  childCountsByParent,
  childKeyChunks,
  childNamedAmongMerged,
  compareLawChildren,
  hijriSortKey,
  isLawChildOf,
  lawChildKey,
  lawChildrenForViewer,
  sortLawChildren,
  type LawChildRow,
} from "./_children.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const QADA = { slug: "nzm-qada", instrument_id: "LAW-00-0897" };

test("hijriSortKey: Hijri strings compared as numbers, Arabic-Indic digits, partial dates, junk", () => {
  assert.equal(hijriSortKey("1445/03/01"), 14450301);
  assert.equal(hijriSortKey("1440/1/2"), 14400102);
  assert.ok(hijriSortKey("1445/03/01")! > hijriSortKey("1440/1/2")!, "1445 is newer than 1440 (no string compare)");
  assert.ok(hijriSortKey("1440/10/1")! > hijriSortKey("1440/9/30")!, "month 10 after month 9 (a string compare says the opposite)");
  assert.equal(hijriSortKey("١٤٤٥/٠٣/٠١هـ"), 14450301);
  assert.equal(hijriSortKey(" 1428-09-19 هـ "), 14280919);
  assert.equal(hijriSortKey("1426هـ"), 14260000, "a year alone sorts after the dated entries of that year");
  assert.equal(hijriSortKey("1426/7"), 14260700);
  for (const v of ["", "   ", "—", null, undefined, 1445, "بدون تاريخ", "1445/13/01"]) {
    assert.equal(hijriSortKey(v), null, String(v));
  }
});

test("isLawChildOf: the parent's instrument_id, never its slug; a self-pointer is no child", () => {
  assert.equal(lawChildKey("  LAW-00-0897 "), "LAW-00-0897");
  assert.equal(lawChildKey(null), "");
  assert.equal(isLawChildOf({ slug: "reg", parent_law_id: "LAW-00-0897" }, QADA), true);
  assert.equal(isLawChildOf({ slug: "reg", parent_law_id: " LAW-00-0897 " }, QADA), true, "trimmed like the seeder");
  assert.equal(isLawChildOf({ slug: "reg", parent_law_id: "nzm-qada" }, QADA), false, "no slug fallback");
  assert.equal(isLawChildOf({ slug: "reg", parent_law_id: "LAW-00-0898" }, QADA), false);
  assert.equal(isLawChildOf({ slug: "nzm-qada", parent_law_id: "LAW-00-0897" }, QADA), false, "self");
  assert.equal(isLawChildOf({ slug: "reg", parent_law_id: "" }, { slug: "x", instrument_id: "" }), false, "no key → no child");
  assert.equal(isLawChildOf({ slug: "", parent_law_id: "LAW-00-0897" }, QADA), false);
});

const row = (slug: string, type: string, date: unknown, title = slug): LawChildRow & { parent_law_id: string } =>
  ({ slug, title, type, status: "active", issue_date_hijri: date, parent_law_id: "LAW-00-0897" });

test("the owner's order: executive regulation first, then the newest, undated last, then title and slug", () => {
  const rows = [
    row("tmm", "تعميم", null, "تعميم"),
    row("q-old", "قرار", "1440/1/2", "قرار قديم"),
    row("q-new", "قرار", "1445/03/01", "قرار حديث"),
    row("reg-old", "لائحة تنفيذية", "1430/5/5", "اللائحة الأولى"),
    row("reg-new", " لائحة تنفيذية ", "1441/2/2", "اللائحة الثانية"),
    row("q-same-b", "قرار", "1440/01/02", "ب"),
    row("q-same-a", "قرار", "1440/1/2", "أ"),
    row("dlil", "دليل إرشادي", "", "دليل"),
    row("other", "قرار", "1445/03/01", "قرار حديث"),
    { ...row("x", "قرار", "1450/1/1"), parent_law_id: "LAW-00-0001" },
    row("nzm-qada", "قرار", "1450/1/1"),
  ];
  const sorted = sortLawChildren(rows, QADA).map((c) => c.slug);
  assert.deepEqual(sorted, [
    "reg-new", "reg-old",          // executive regulations first, newest first
    "other", "q-new",              // 1445/03/01: same title → by slug
    "q-same-a", "q-same-b", "q-old", // 1440/1/2 = 1440/01/02: by title (أ before ب), then «قرار قديم»
    "tmm", "dlil",                 // undated last, by title («تعميم» before «دليل»)
  ]);
  assert.ok(!sorted.includes("x"), "another parent's child is dropped");
  assert.ok(!sorted.includes("nzm-qada"), "a self-pointer is dropped");
  assert.equal(compareLawChildren(row("a", "قرار", null), row("b", "قرار", "1400/1/1")) > 0, true, "undated after dated");
});

test("sortLawChildren drops a repeated slug and junk rows", () => {
  const out = sortLawChildren([row("a", "قرار", "1440/1/1"), row("a", "قرار", "1441/1/1"), null, 7, "x"], QADA);
  assert.equal(out.length, 1);
  assert.equal(sortLawChildren(null, QADA).length, 0);
});

test("lawChildrenForViewer: {count, children}; the date for a subscriber only, the order the same for all", () => {
  const rows = [row("q-old", "قرار", "1440/1/2", "قرار قديم"), row("reg", "لائحة تنفيذية", "1430/5/5", "اللائحة"), row("q-new", "قرار", "1445/03/01", "قرار حديث")];
  const guest = lawChildrenForViewer(rows, QADA, false);
  const subscriber = lawChildrenForViewer(rows, QADA, true);
  assert.equal(guest.count, 3);
  assert.deepEqual(guest.children.map((c) => c.slug), ["reg", "q-new", "q-old"]);
  assert.deepEqual(subscriber.children.map((c) => c.slug), ["reg", "q-new", "q-old"]);
  assert.ok(guest.children.every((c) => !("issueDate" in c)), "T28-22: no issue date for a non-subscriber");
  assert.equal(subscriber.children[1].issueDate, "1445/03/01");
  assert.equal(guest.children[0].status, "active");
  assert.equal(lawChildrenForViewer([{ ...row("r", "قرار", null), status: "repealed" }], QADA, false).children[0].status, "repealed", "kept, with its status");
  assert.equal(lawChildrenForViewer([{ ...row("r", "قرار", null), status: "??" }], QADA, false).children[0].status, "status_undeclared");
  assert.equal(lawChildrenForViewer([{ ...row("r", "قرار", null), title: "" }], QADA, false).children[0].title, "r", "a title-less child shows its slug");
  assert.deepEqual(lawChildrenForViewer([], QADA, true), { count: 0, children: [] });
  for (const c of subscriber.children) {
    assert.ok(Object.keys(c).every((k) => ["slug", "title", "type", "status", "issueDate"].includes(k)), Object.keys(c).join());
    assert.ok(!("text" in c) && !("parent_law_id" in c), "no text, no raw link field");
  }
});

test("childCountsByParent: the same rule as the law page, per catalogue card", () => {
  const parents = [QADA, { slug: "nzm-b", instrument_id: "LAW-00-0002" }, { slug: "no-id", instrument_id: null }];
  const rows = [
    { slug: "c1", parent_law_id: "LAW-00-0897" },
    { slug: "c2", parent_law_id: "LAW-00-0897" },
    { slug: "c2", parent_law_id: "LAW-00-0897" },        // a repeated row counts once
    { slug: "nzm-qada", parent_law_id: "LAW-00-0897" },  // self
    { slug: "c3", parent_law_id: "LAW-00-0002" },
    { slug: "c4", parent_law_id: "LAW-99-9999" },        // not on this page
    { slug: "c5", parent_law_id: "nzm-b" },              // a slug is no key
  ];
  const counts = childCountsByParent(rows, parents);
  assert.deepEqual(Object.fromEntries(counts), { "nzm-qada": 2, "nzm-b": 1 });
  // …and equals the law page's own list
  assert.equal(counts.get("nzm-qada"), lawChildrenForViewer(rows, QADA, false).count);
});

test("file 16 §7: a linked child that is one of the merged regulations is neither listed nor counted twice", () => {
  const qada = { ...QADA, title: "نظام القضاء" };
  const merged = ["اللائحة التنفيذية لنظام القضاء", "لائحة التفتيش القضائي", "ج", "د", "هـ", "و"];
  assert.equal(childNamedAmongMerged("اللائحة التنفيذية لنظام القضاء", qada.title, merged), true);
  assert.equal(childNamedAmongMerged("  اللائحة   التنفيذية  ", qada.title, merged), true, "the card's form: spaces, base title dropped");
  assert.equal(childNamedAmongMerged("لائحة التفتيش القضائي لنظام القضاء", qada.title, merged), true);
  assert.equal(childNamedAmongMerged("قرار وزاري", qada.title, merged), false);
  assert.equal(childNamedAmongMerged("اللائحة التنفيذية لنظام القضاء", qada.title, []), false);
  const rows = [
    { ...row("same", "لائحة تنفيذية", "1441/1/1", "اللائحة التنفيذية لنظام القضاء") },
    { ...row("other", "قرار", "1445/1/1", "قرار وزاري") },
  ];
  // the law page: the merged one is left out; the card count is the same number
  const page = lawChildrenForViewer(rows, qada, false, merged);
  assert.deepEqual(page.children.map((c) => c.slug), ["other"]);
  const counts = childCountsByParent(rows, [{ ...qada, mergedNames: merged }]);
  assert.equal(counts.get("nzm-qada"), 1);
  assert.equal(counts.get("nzm-qada"), page.count);
  // نظام القضاء today: 6 merged names, 0 linked children → no extra count (the card keeps l9's «+4»)
  assert.equal(childCountsByParent([], [{ ...qada, mergedNames: merged }]).get("nzm-qada"), undefined);
});

test("childKeyChunks: distinct non-empty keys, ≤ 50 per in (…) read", () => {
  assert.equal(CHILD_COUNT_ID_CHUNK, 50);
  const parents = Array.from({ length: 120 }, (_, i) => ({ instrument_id: `LAW-${i}` }));
  parents.push({ instrument_id: "LAW-1" }, { instrument_id: "" }, { instrument_id: null } as unknown as { instrument_id: string });
  const chunks = childKeyChunks(parents);
  assert.deepEqual(chunks.map((c) => c.length), [50, 50, 20]);
  assert.equal(new Set(chunks.flat()).size, 120);
  assert.deepEqual(childKeyChunks([]), []);
});

test("source: the law route reads the children by parent_law_id = instrument_id, as the service role, and never fails on it", () => {
  const route = read("./route.ts");
  assert.match(route, /const LAW_DETAIL_COLUMNS =\n\s*'[^']*\binstrument_id'/, "the law's instrument_id is read");
  assert.match(route, /const childKey = lawChildKey\(law\.instrument_id\);/);
  const block = route.slice(route.indexOf("const childrenLookup"), route.indexOf("// Fetch chapters."));
  assert.match(block, /if \(!childKey\) return \[\];/);
  assert.match(block, /await serverOnly\s*\.schema\('library'\)\s*\.from\('laws'\)\s*\.select\('slug,title,type,status,issue_date_hijri,parent_law_id'\)\s*\.eq\('parent_law_id', childKey\)\s*\.neq\('slug', law\.slug\)/);
  assert.match(block, /\.limit\(LAW_CHILDREN_MAX\)/);
  assert.doesNotMatch(block, /preamble|\btext\b|description/, "titles and metadata only");
  assert.match(block, /if \(error\) \{[\s\S]*?return \[\];/, "a failed read is no 500");
  assert.match(block, /\.catch\(/);
  assert.match(route, /subLegislation: lawChildrenForViewer\(\s*await childrenLookup,\s*law,\s*!officialMeta\.officialMetaLocked,\s*regulationIndexRows\.flatMap\(\(r\) => \[r\.ref, regulationRefForViewer\(r\.ref, true\)\]\),\s*\),/);
});

test("source: /api/library/init counts the page's children in chunked in (…) reads and never sends instrument_id", () => {
  const init = read("../../init/route.ts");
  assert.match(init, /const LAW_LIST_COLUMNS =\n\s*"[^"]*\binstrument_id";/);
  assert.match(init, /const childChunks = childKeyChunks\(lawsRows\);/);
  assert.match(init, /\.select\("slug,title,parent_law_id", \{ count: "exact" \}\)\s*\.in\("parent_law_id", keys\)/);
  // l12 (L3): one parents list feeds the count and the titles.
  assert.match(init, /const childRows = reads\.flatMap\(\(r\) => r\.data\);\s*const parents = lawsRows\.map\(\(row\) => \(\{/);
  assert.match(init, /childCounts = childCountsByParent\(childRows, parents\);\s*childTitles = childTitlesByParent\(childRows, parents\);/);
  // merged names in both forms, so a guest and a subscriber get the same number
  assert.match(init, /mergedNames: \[true, false\]\.flatMap\(\(subscriber\) => \[\s*\.\.\.mergedNamesFromDetails\(row\[LAW_MERGED_DETAILS_COLUMN\], subscriber\),\s*\.\.\.mergedNamesForViewer\(row\[LAW_MERGED_NAMES_COLUMN\], subscriber\),/);
  assert.match(init, /delete shaped\.instrument_id;/, "stripped from every card");
  assert.match(init, /\.\.\.\(childCount > 0 \? \{ sub_legislation_count: childCount \} : \{\}\),/);
});

test("source: the law page keeps subLegislation through its whitelist and mounts the section", () => {
  const page = read("../../../../laws/[slug]/page.tsx");
  const data = read("../../../../laws/data.ts");
  const section = read("../../../../laws/[slug]/_sub-legislation.tsx");
  assert.match(data, /subLegislation\?: \{\n\s*count: number;\n\s*children: Array<\{ slug: string; title: string; type: string; status: LawStatus; issueDate\?: string \}>;/);
  assert.match(page, /subLegislation: data\.subLegislation && Array\.isArray\(data\.subLegislation\.children\)/);
  assert.match(page, /<SubLegislationSection\s+key=\{law\.slug\}\s+subLegislation=\{law\.subLegislation\}/);
  // file 16 §7 (acceptance: نظام القضاء, whose sub-legislation is merged today): the merged ones first
  assert.match(page, /mergedNames=\{\(law\.regulationIndex \?\? \[\]\)\.map\(\(g\) => g\.name\)\}/);
  assert.match(page, /setViewMode\("regulation"\);\s*setSelectedRegName\(inst \? inst\.ref : null\);/);
  assert.match(section, /\.\.\.Array\.from\(new Set\(mergedNames[\s\S]*?kind: "merged"[\s\S]*?\.\.\.\(subLegislation\?\.children \?\? \[\]\)/, "merged first, then linked");
  // hidden when there is none; three, then «عرض المزيد (N)»; each linked child opens its page
  assert.match(section, /if \(entries\.length === 0\) return null;/);
  assert.match(section, /export const SUB_LEGISLATION_SHOWN = 3;/);
  assert.match(section, /`عرض المزيد \(\$\{more\}\)`/);
  assert.match(section, /`التشريعات الفرعية \(\$\{entries\.length\}\)`/);
  assert.match(section, /href=\{`\/laws\/\$\{encodeURIComponent\(child\.slug\)\}`\}/);
  assert.doesNotMatch(section, /text-gray-(?:100|200)\b/, "dark-mode gray-token trap");
});

test("file 03 L3 (l12): childTitlesByParent — the card's linked titles, same rule as the count", async () => {
  const { childTitlesByParent, childCountsByParent } = await import("./_children.ts");
  const parents = [
    { slug: "law-traffic", instrument_id: "SA-TRAFFIC", title: "نظام المرور", mergedNames: ["اللائحة التنفيذية لنظام المرور"] },
    { slug: "law-other", instrument_id: "", title: "نظام آخر" },
  ];
  const rows = [
    { slug: "driving-schools", title: "لائحة مدارس تعليم القيادة", parent_law_id: "SA-TRAFFIC" },
    { slug: "traffic-exec", title: "اللائحة التنفيذية لنظام المرور", parent_law_id: "SA-TRAFFIC" }, // a merged name: left out
    { slug: "fines", title: "  جدول   المخالفات ", parent_law_id: "SA-TRAFFIC" },
    { slug: "law-traffic", title: "نظام المرور", parent_law_id: "SA-TRAFFIC" }, // itself
    { slug: "stray", title: "x", parent_law_id: "" },
  ];
  const titles = childTitlesByParent(rows, parents);
  assert.deepEqual(titles.get("law-traffic"), ["جدول المخالفات", "لائحة مدارس تعليم القيادة"]);
  assert.equal(titles.has("law-other"), false);
  assert.equal(childCountsByParent(rows, parents).get("law-traffic"), titles.get("law-traffic")!.length);
  assert.deepEqual(childTitlesByParent(rows, parents, 1).get("law-traffic"), ["جدول المخالفات"]);
  // an executive regulation that is not merged comes first
  const exec = childTitlesByParent([...rows, { slug: "e2", title: "اللائحة التنفيذية للفحص الدوري", parent_law_id: "SA-TRAFFIC" }], parents);
  assert.equal(exec.get("law-traffic")![0], "اللائحة التنفيذية للفحص الدوري");
});
