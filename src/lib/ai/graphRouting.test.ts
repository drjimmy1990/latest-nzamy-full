/**
 * graphRouting.test.ts — the section / judicial-track labels the graph routes by,
 * and the library's own regulation links (graphBuilder.resolveRegulationEdges).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNormalizedTitleIndex,
  buildLawStructure,
  buildPrincipleGraphNodes,
  normalizeArabicKey,
  resolveRegulationEdges,
  wholeRegulationNumber,
  type LawIndexEntry,
  type LawIndexMap,
} from "./graphBuilder.ts";
import {
  COMMITTEE_FAMILIES,
  MAX_GOVERNING_LAWS,
  SECTION_LABELS,
  classifyTrack,
  committeeFamilies,
  learnCollectionLaws,
  mergeGoverningLaws,
  normalizeSectionCode,
  resolveCommitteeLaws,
} from "./graphRouting.ts";

test("normalizeSectionCode: two digits 00..29 from any spelling, else null", () => {
  assert.equal(normalizeSectionCode("06"), "06");
  assert.equal(normalizeSectionCode("6"), "06");
  assert.equal(normalizeSectionCode(6), "06");
  assert.equal(normalizeSectionCode("SA-03"), "03");
  assert.equal(normalizeSectionCode("٠٩"), "09");
  assert.equal(normalizeSectionCode("29"), "29");
  assert.equal(normalizeSectionCode("30"), null);
  assert.equal(normalizeSectionCode("غير_مصنف"), null);
  assert.equal(normalizeSectionCode(""), null);
  assert.equal(normalizeSectionCode(null), null);
  assert.equal(Object.keys(SECTION_LABELS).length, 30);
});

test("classifyTrack: the stored track wins; the Board's commercial / criminal circuits get their subject", () => {
  assert.deepEqual(classifyTrack({ track: "admin", court: "ديوان المظالم", title: "مبادئ ديوان المظالم لعام 1437هـ - المجلد 1 (الأحكام والمبادئ الإدارية)" }), {
    track_class: "admin",
    subject_section: null,
  });
  assert.deepEqual(
    classifyTrack({ track: "admin", court: "ديوان المظالم", title: "مبادئ ديوان المظالم لعام 1436هـ - المجلد 3 (الأحكام والمبادئ التجارية)" }),
    { track_class: "admin", subject_section: "04" },
  );
  assert.equal(classifyTrack({ track: "admin", court: "ديوان المظالم - الدوائر التجارية", title: "تطبيقات" }).subject_section, "04");
  assert.equal(
    classifyTrack({ track: "admin", court: "ديوان المظالم", title: "مجموعة الأحكام والمبادئ الجزائية لعام 1437هـ - المجلد الأول" }).subject_section,
    "01",
  );
  assert.deepEqual(classifyTrack({ track: "ordinary", court: "وزارة العدل - مركز البحوث", title: "مجموعة الأحكام القضائية لعام 1435هـ" }), {
    track_class: "ordinary",
    subject_section: null,
  });
  assert.equal(classifyTrack({ track: "semi", court: "لجان الاستئناف الجمركية", title: "x" }).track_class, "semi");
  // A commercial word in an ordinary collection never sets a subject.
  assert.equal(classifyTrack({ track: "ordinary", title: "الأحكام والمبادئ التجارية" }).subject_section, null);
  // No stored track: from the court.
  assert.equal(classifyTrack({ court: "ديوان المظالم" }).track_class, "admin");
  assert.equal(classifyTrack({ court: "لجنة الفصل في منازعات الأوراق المالية" }).track_class, "semi");
  assert.equal(classifyTrack({ court: "محكمة التمييز" }).track_class, "ordinary");
  assert.equal(classifyTrack({}).track_class, null);
});

test("committeeFamilies: Arabic triggers match (no ASCII \\b), a joint tax committee gets every tax family", () => {
  assert.deepEqual(committeeFamilies("لجان الفصل في المنازعات والمخالفات التأمينية", "مجلة قرارات"), ["insurance"]);
  assert.deepEqual(committeeFamilies(null, "مدونة المبادئ القضائية التأمينية"), ["insurance"]);
  assert.deepEqual(committeeFamilies("لجنة تسوية المنازعات المصرفية", "مبادئ"), ["banking"]);
  assert.deepEqual(committeeFamilies("اللجنة القانونية الاستئنافية", "مبادئ منازعات الأوراق التجارية 1423-1439هـ"), ["commercial_papers"]);
  const tax = committeeFamilies("الأمانة العامة للجان الزكوية والضريبية والجمركية", "الدفوع المثارة");
  for (const f of ["customs", "zakat", "income_tax", "vat", "excise", "real_estate_tax", "tax_procedure"]) {
    assert.ok(tax.includes(f), `${f} in ${tax}`);
  }
  assert.deepEqual(committeeFamilies("وزارة المالية", "مدونة المبادئ المستنبطة من قرارات لجنة النظر في التظلمات وطلبات تعديل الأسعار"), [
    "procurement_grievances",
  ]);
  assert.deepEqual(committeeFamilies("ديوان المظالم", "مبادئ إدارية"), []);
  for (const f of COMMITTEE_FAMILIES) {
    assert.ok(!/\\b/.test(f.trigger.source) && f.laws.every((re) => !/\\b/.test(re.source)), `${f.id} has no \\b`);
  }
});

const LAWS = [
  { slug: "ins", title: "نظام مراقبة شركات التأمين التعاوني" },
  { slug: "gosi", title: "نظام التأمينات الاجتماعية" },
  { slug: "saned", title: "نظام التأمين ضد التعطل عن العمل" },
  { slug: "banks", title: "نظام مراقبة البنوك" },
  { slug: "aml", title: "الدليل الإرشادي لمكافحة غسل الأموال وتمويل الإرهاب" },
  { slug: "zatca", title: "تنظيم هيئة الزكاة والضريبة والجمارك" },
  { slug: "customs", title: "نظام الجمارك الموحد لدول مجلس التعاون" },
  { slug: "labor", title: "نظام العمل" },
  { slug: "labor-reg", title: "اللائحة التنفيذية لنظام العمل" },
  { slug: "labor-ins", title: "نظام العمل التطوعي" },
  { slug: "cma", title: "نظام السوق المالية" },
  { slug: "local", title: "لائحة تفضيل المحتوى المحلي والشركات المدرجة في السوق المالية" },
];

test("resolveCommitteeLaws: law titles by family, with the look-alikes left out", () => {
  assert.deepEqual(resolveCommitteeLaws(["insurance"], LAWS), ["ins"]);
  assert.deepEqual(resolveCommitteeLaws(["banking"], LAWS), ["banks"]);
  // The authority's name is not the subject: its organisation act is no customs law.
  assert.deepEqual(resolveCommitteeLaws(["customs"], LAWS), ["customs"]);
  assert.deepEqual(resolveCommitteeLaws(["labor"], LAWS), ["labor", "labor-reg"]);
  assert.deepEqual(resolveCommitteeLaws(["securities"], LAWS), ["cma"]);
  assert.deepEqual(resolveCommitteeLaws([], LAWS), []);
  assert.deepEqual(resolveCommitteeLaws(["no-such-family"], LAWS), []);
});

test("learnCollectionLaws: laws cited at least twice and in >= 5% of citations; merge puts the learned first", () => {
  const cites = ["labor", "labor", "labor", "civil", "civil", "proc", ...Array(40).fill("labor"), undefined, null];
  assert.deepEqual(learnCollectionLaws(cites), ["labor"]);
  assert.deepEqual(learnCollectionLaws(["a", "a", "b", "b", "c"]), ["a", "b"]);
  assert.deepEqual(learnCollectionLaws([]), []);
  assert.deepEqual(mergeGoverningLaws(["x", "y"], ["y", "z"]), ["y", "z", "x"]);
  const many = Array.from({ length: 80 }, (_, i) => `l${i}`);
  assert.equal(mergeGoverningLaws(many, []).length, MAX_GOVERNING_LAWS);
});

test("law nodes carry their section; principle nodes carry track (collection fallback), class, subject and committee", () => {
  const structure = buildLawStructure({
    law: { slug: "labor", title: "نظام العمل", status: "active", section_code: "6" },
    chaptersById: new Map(),
    articles: [{ id: "a1", law_slug: "labor", number: "1", text: "نص" }],
    articleNodes: [{ node_key: "article:a1" } as never],
  });
  const lawNode = structure.nodes.find((n) => n.node_type === "law");
  assert.equal(lawNode?.metadata.section_code, "06");

  const [bog] = buildPrincipleGraphNodes({
    collection: { id: "c1", title: "مبادئ ديوان المظالم لعام 1436هـ - المجلد 3 (الأحكام والمبادئ التجارية)", court: "ديوان المظالم", track: "admin" },
    principles: [{ id: "p1", collection_id: "c1", text: "مبدأ", track: null }],
  });
  assert.deepEqual(bog.metadata, { court: "ديوان المظالم", track: "admin", track_class: "admin", subject_section: "04" });

  const [semi] = buildPrincipleGraphNodes({
    collection: { id: "c2", title: "مبادئ تسوية المنازعات المصرفية", court: "لجنة تسوية المنازعات المصرفية", track: "semi" },
    principles: [{ id: "p2", collection_id: "c2", text: "مبدأ" }],
    committeeFamilies: ["banking"],
  });
  assert.equal(semi.metadata.track_class, "semi");
  assert.deepEqual(semi.metadata.committee_families, ["banking"]);

  // Routing labels are metadata only: the embedded text (content_sha256) does not change with them.
  const [again] = buildPrincipleGraphNodes({
    collection: { id: "c2", title: "مبادئ تسوية المنازعات المصرفية", court: "لجنة تسوية المنازعات المصرفية", track: "semi" },
    principles: [{ id: "p2", collection_id: "c2", text: "مبدأ" }],
  });
  assert.equal(again.content_sha256, semi.content_sha256);
});

function entry(slug: string, title: string, articles: Record<number, string>, status = "active"): LawIndexEntry {
  return {
    slug,
    title,
    normalizedTitle: normalizeArabicKey(title),
    status,
    articleKeyByNumber: new Map(Object.entries(articles).map(([n, k]) => [Number(n), k])),
    rootNodeKey: null,
  };
}

test("wholeRegulationNumber: one whole article number only", () => {
  assert.equal(wholeRegulationNumber("12"), 12);
  assert.equal(wholeRegulationNumber(" ١٢ "), 12);
  assert.equal(wholeRegulationNumber(7), 7);
  for (const bad of [
    "12/3", "12-1", "12.5", "12 مكرر", "", null, undefined,
    // shapes seen in the library's reg_num: a table, a paragraph, a letter, a section name
    "جدول الغرامات رقم 9", "12 أ", "12 (أ)", "5 فقرة 2", "١٢٫٥", "12 و13", "9-annex", "أحكام عامة", "الخامسة",
  ]) assert.equal(wholeRegulationNumber(bad), null, String(bad));
});

test("resolveRegulationEdges: system article → the regulation's article, only when the reference is certain", () => {
  const lawMap: LawIndexMap = new Map([
    ["labor", entry("labor", "نظام العمل", { 2: "article:labor-2" })],
    ["labor-reg", entry("labor-reg", "اللائحة التنفيذية لنظام العمل", { 5: "article:reg-5" })],
    ["old-reg", entry("old-reg", "اللائحة التنفيذية لنظام العمل", { 5: "article:old-5" }, "repealed")],
    ["dup-a", entry("dup-a", "لائحة مكررة", { 1: "article:dup-a-1" })],
    ["dup-b", entry("dup-b", "لائحة مكررة", { 1: "article:dup-b-1" })],
    ["lone-old", entry("lone-old", "لائحة ملغاة وحدها", { 3: "article:lone-old-3" }, "repealed")],
  ]);
  const index = buildNormalizedTitleIndex(lawMap);
  const edges = resolveRegulationEdges(
    [
      { article_key: "article:labor-2", law_slug: "labor", ref: "اللائحة التنفيذية لنظام العمل", reg_num: "5" },
      { article_key: "article:labor-2", law_slug: "labor", ref: "اللائحة التنفيذية لنظام العمل", reg_num: "5" }, // duplicate
      { article_key: "article:labor-2", law_slug: "labor", ref: "اللائحة التنفيذية لنظام العمل", reg_num: "5/2" }, // a paragraph
      { article_key: "article:labor-2", law_slug: "labor", ref: "اللائحة التنفيذية لنظام العمل", reg_num: "99" }, // no such article
      { article_key: "article:labor-2", law_slug: "labor", ref: "لائحة مكررة", reg_num: "1" }, // two in-force documents
      { article_key: "article:labor-2", law_slug: "labor", ref: "لائحة غير موجودة", reg_num: "1" },
      { article_key: "article:labor-2", law_slug: "labor", ref: "اللائحة التنفيذية لنظام العمل", reg_num: "5", status: "repealed" },
      { article_key: "article:labor-2", law_slug: "labor", ref: "نظام العمل", reg_num: "2" }, // its own law
      { article_key: "article:labor-2", law_slug: "labor", ref: "لائحة ملغاة وحدها", reg_num: "3" }, // no document in force
    ],
    lawMap,
    index,
  );
  assert.deepEqual(
    edges.map((e) => [e.source_key, e.edge_type, e.target_key]),
    [["article:labor-2", "IMPLEMENTED_BY", "article:reg-5"]],
  );
  assert.equal(edges[0].origin, "auto_watchdog");
  assert.match(edges[0].evidence ?? "", /اللائحة التنفيذية لنظام العمل — المادة 5/);
});
