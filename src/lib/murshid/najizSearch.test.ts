/**
 * «دليل ناجز» search, synonyms, breadcrumb and drafter link (owner package
 * 13 Nov, N06-6..10).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/murshid/najizSearch.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NajizClassifications } from "./najizClassifications.ts";
import {
  expandNajizQuery,
  groupHitsByClass,
  najizBreadcrumb,
  najizKey,
  najizRows,
  searchNajiz,
  synonymGroupOf,
  typeNotes,
  classWideNotes,
  noteRows,
  NAJIZ_BREADCRUMB_SEPARATOR,
} from "./najizSearch.ts";
import { NAJIZ_SYNONYMS } from "./najizSynonyms.ts";
import { najizDraftHref, najizDraftSeed, NAJIZ_PARAM_MAX } from "./najizDraftLink.ts";
import { LEGAL_BRANCHES_REGULAR } from "../../components/draft/draftConstants.ts";
import { highlightMultiColorSegments } from "../search/multiColorSearch.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../data/murshid/najiz-classifications.json"), "utf8"),
) as NajizClassifications;
const rows = najizRows(data.courts);
const names = (q: string) => searchNajiz(rows, q, NAJIZ_SYNONYMS).hits.map((r) => r.type.name);

test("najizKey folds hamza forms, taa marbuta, alef maqsura, tashkeel, tatweel, digits and the article", () => {
  assert.equal(najizKey("الإيجار"), najizKey("ايجار"));
  assert.equal(najizKey("إجارة"), "اجاره");
  assert.equal(najizKey("آمر"), najizKey("امر"));
  assert.equal(najizKey("مستشفى"), najizKey("مستشفي"));
  assert.equal(najizKey("طَلَاق"), "طلاق");
  assert.equal(najizKey("طـلاق"), "طلاق");
  assert.equal(najizKey("١٠ مليون"), "10 مليون");
  assert.equal(najizKey("  فسخ   عقد  الزواج "), "فسخ عقد زواج");
});

test("folding reaches the rows: hamza, taa marbuta and Arabic digits match the data", () => {
  assert.ok(names("اجاره").includes("إجارة"));
  assert.ok(names("الأجاره").includes("إجارة"), "a wrong hamza and ه for ة still find إجارة");
  assert.ok(names("١٠").includes("قسمة تركة أكثر من ١٠ مليون"));
  assert.ok(names("10").includes("قسمة تركة أكثر من ١٠ مليون"));
  assert.ok(names("الحَضانة").includes("الحضانة"), "tashkeel is ignored");
});

test("synonym groups: membership by key, with or without the article", () => {
  assert.ok(synonymGroupOf("الطلاق", NAJIZ_SYNONYMS)?.includes("خلع"));
  assert.ok(synonymGroupOf("تأجير", NAJIZ_SYNONYMS)?.includes("إيجار"));
  assert.ok(synonymGroupOf("عمل", NAJIZ_SYNONYMS)?.includes("عمالية"));
  assert.equal(synonymGroupOf("فسخ", NAJIZ_SYNONYMS), null, "bare «فسخ» is not a synonym of طلاق (it is also فسخ ولاية)");
  assert.equal(synonymGroupOf("نفقة", NAJIZ_SYNONYMS), null);
});

test("every synonym group finds at least one of the 243 types (no dead group)", () => {
  for (const group of NAJIZ_SYNONYMS) {
    assert.ok(group.length >= 2, `${group.join("/")}: a group needs two words`);
    assert.ok(names(group[0]).length > 0, `${group.join("/")} finds nothing`);
  }
});

test("«خلع» finds the divorce types through its synonyms", () => {
  const hits = names("خلع");
  for (const t of ["إثبات خلع", "إثبات الطلاق", "إثبات طلاق", "فسخ عقد الزواج"]) assert.ok(hits.includes(t), t);
  assert.ok(!hits.includes("فسخ ولاية بطلب من الولي"), "bare فسخ is not widened");
});

test("«إيجار» / «تأجير» find إجارة and عقد إيجار", () => {
  for (const q of ["إيجار", "تأجير", "الإيجار"]) {
    const hits = names(q);
    for (const t of ["إجارة", "عقد إيجار عقار", "عقد إيجار منقول"]) assert.ok(hits.includes(t), `${q} → ${t}`);
  }
});

test("«عمل» finds the labour court through «عمالية»", () => {
  const hits = searchNajiz(rows, "عمل", NAJIZ_SYNONYMS).hits;
  assert.ok(hits.some((r) => r.court.title === "دعاوى المحاكم العمالية" && r.type.name === "اعتراض على قرارات لجان الخدمة المنزلية"));
});

test("synonyms widen one term only: «طلاق نفقة» is (طلاق or …) AND نفقة", () => {
  const ex = expandNajizQuery("طلاق نفقة", NAJIZ_SYNONYMS);
  assert.deepEqual(ex.parsed.groups, [[0, 1]]);
  assert.equal(ex.alternatives[1].length, 1, "نفقة has no synonyms");
  for (const r of searchNajiz(rows, "طلاق نفقة", NAJIZ_SYNONYMS).hits) {
    assert.match(r.type.name + r.type.description + r.klass.title + r.court.title, /نفق/);
  }
  // OR and exclusion still work.
  const or = names("خلع / شيك");
  assert.ok(or.includes("إثبات خلع") && or.includes("الأوراق التجارية"));
  assert.ok(!names("خلع -الأحساء").includes("إثبات خلع"), "an excluded word drops the row");
});

test("synonyms are highlighted in the typed term's colour", () => {
  const ex = expandNajizQuery("مهر خلع", NAJIZ_SYNONYMS);
  const colours = new Set(ex.highlightTerms.filter((t) => t.label !== "مهر").map((t) => t.color));
  assert.deepEqual([...colours], [1]);
  assert.deepEqual(ex.widened.map((w) => w.label), ["خلع"]);
  assert.ok(ex.widened[0].synonyms.includes("طلاق") && !ex.widened[0].synonyms.includes("خلع"));
  const segs = highlightMultiColorSegments("إثبات الطلاق", ex.highlightTerms).filter((s) => s.term !== null);
  assert.equal(segs.length, 1);
  assert.equal(ex.highlightTerms[segs[0].term!].color, 1);
});

test("an empty query has no hits; a court or class name finds its types", () => {
  assert.equal(searchNajiz(rows, "   ", NAJIZ_SYNONYMS).hits.length, 0);
  const execution = searchNajiz(rows, "\"دعاوى التنفيذ\"", NAJIZ_SYNONYMS).hits;
  assert.equal(execution.length, 22);
  const groups = groupHitsByClass(execution);
  assert.deepEqual(groups.map((g) => g.klass.no), ["6.1", "6.2", "6.3", "6.4"]);
});

test("the breadcrumb is court › class › type, as the guide states them", () => {
  const court = data.courts.find((c) => c.title === "دعاوى المحاكم العمالية")!;
  const klass = court.classes.find((k) => k.no === "3.1")!;
  const type = klass.types[0];
  const b = najizBreadcrumb(court, klass, type);
  assert.deepEqual(b.parts, ["دعاوى المحاكم العمالية", "العمالة العادية", "مطالبات العامل"]);
  assert.equal(b.text, "دعاوى المحاكم العمالية › العمالة العادية › مطالبات العامل");
  assert.equal(NAJIZ_BREADCRUMB_SEPARATOR, " › ");
  assert.equal(najizBreadcrumb({ title: " أ  ب " }, { title: "ج" }, { name: "د\nهـ" }).text, "أ ب › ج › د هـ");
});

test("the drafter link round-trips into the draft seed", () => {
  const court = data.courts.find((c) => c.title === "دعاوى المحاكم العمالية")!;
  const klass = court.classes[0];
  const type = klass.types[0];
  const href = najizDraftHref(court, klass, type);
  assert.match(href, /^\/ai\/draft\?from=najiz&court=/);
  const params = new URLSearchParams(href.split("?")[1]);
  const seed = najizDraftSeed((k) => params.get(k))!;
  assert.equal(seed.path, najizBreadcrumb(court, klass, type).text);
  assert.equal(seed.notesText, `تصنيف الدعوى في ناجز: ${seed.path}`);
  assert.equal(seed.memoType, "case");
  assert.equal(seed.legalBranch, "عمالي");
});

test("the draft seed: only from=najiz with all three, branches the form has, no branch for the general courts", () => {
  const seedFor = (p: Record<string, string>) => najizDraftSeed((k) => p[k] ?? null);
  assert.equal(seedFor({ court: "أ", class: "ب", type: "ج" }), null, "without from=najiz");
  assert.equal(seedFor({ from: "transcript", court: "أ", class: "ب", type: "ج" }), null);
  assert.equal(seedFor({ from: "najiz", court: "أ", class: "ب" }), null, "a missing type");
  assert.equal(seedFor({ from: "najiz", court: "أ", class: "  ", type: "ج" }), null, "a blank class");

  const branchOf = (court: string) => seedFor({ from: "najiz", court, class: "ب", type: "ج" })!.legalBranch;
  const expected: Record<string, string> = {
    "دعاوى الأحوال الشخصية": "أسرة (أحوال شخصية)",
    "دعاوى المحاكم التجارية": "تجاري",
    "دعاوى المحاكم العمالية": "عمالي",
    "دعاوى المحاكم الجزائية": "جزائي",
    "دعاوى المحاكم العامة": "",
    "دعاوى التنفيذ": "تنفيذ",
    "الدعاوى المتعلقة بالإنهاءات": "",
  };
  for (const c of data.courts) {
    assert.ok(c.title in expected, `a court the map does not know: ${c.title}`);
    assert.equal(branchOf(c.title), expected[c.title], c.title);
    if (expected[c.title]) assert.ok(LEGAL_BRANCHES_REGULAR.includes(expected[c.title]), `${expected[c.title]} is a branch of the form`);
  }
  assert.equal(seedFor({ from: "najiz", court: "الدعاوى المتعلقة بالإنهاءات", class: "ب", type: "ج" })!.memoType, "", "a إنهاء is not a claim");
});

test("the draft seed cleans URL input: control characters, bidi marks, length", () => {
  const seed = najizDraftSeed((k) => ({ from: "najiz", court: "أ\u0000‮ب", class: "ج\n\nد", type: "ه".repeat(500) } as Record<string, string>)[k] ?? null)!;
  assert.equal(seed.court, "أ ب");
  assert.equal(seed.klass, "ج د");
  assert.equal(Array.from(seed.type).length, NAJIZ_PARAM_MAX);
});

test("a class note that cites «الصف N» belongs to that type's card; the rest stay on the class", () => {
  const all = data.courts.flatMap((c) => c.classes);
  const k23 = all.find((k) => k.no === "2.3")!;
  const mudaraba = k23.types.find((t) => t.no === 57)!;
  assert.equal(typeNotes(k23, mudaraba).length, 1);
  assert.equal(classWideNotes(k23).length, 0);
  assert.deepEqual(noteRows({ lines: ["انظر الصف ١٤٦ والصف 7"] }), [146, 7]);
  // Every class note is shown somewhere: on the class, or on a type of that class.
  for (const k of all) {
    for (const n of k.notes) {
      const cited = noteRows(n);
      assert.ok(cited.length === 0 || k.types.some((t) => cited.includes(t.no)), `${k.no}: a note citing a row outside its class`);
    }
  }
});
