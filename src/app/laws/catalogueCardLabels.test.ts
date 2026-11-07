import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lawCardDates, MERGED_INCLUDES_MAX, mergedFileBadge, mergedFileName, mergedIncludesLine } from "./catalogueCardLabels.ts";

const cards = readFileSync(new URL("./components/LawsTabContent.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("BUG-LIB-07 (q382): the merged badge is the one word «مدمج»", () => {
  assert.equal(mergedFileBadge(false), "");
  assert.equal(mergedFileBadge(undefined), "");
  assert.equal(mergedFileBadge("true"), "");
  assert.equal(mergedFileBadge(true), "مدمج");
});

test("١٢-٥: الأصل + ≤2 فرعي + «+ N أخرى», without repeating the base name", () => {
  const base = "نظام المرافعات الشرعية";
  assert.equal(mergedFileName(base), base);
  assert.equal(
    mergedFileName(base, ["اللائحة التنفيذية لنظام المرافعات الشرعية", "اللائحة التنفيذية لطرق الاعتراض على الأحكام"]),
    "نظام المرافعات الشرعية + اللائحة التنفيذية + اللائحة التنفيذية لطرق الاعتراض على الأحكام",
  );
  assert.equal(mergedFileName(base, ["أ", "ب", "ج", "د", "", "أ"]), "نظام المرافعات الشرعية + أ + ب + 2 أخرى");
});

test("owner 2026-11-07: «يشتمل على: A • B» — at most two names, the base title not repeated, none → \"\"", () => {
  const base = "نظام المرافعات الشرعية";
  assert.equal(MERGED_INCLUDES_MAX, 2);
  assert.equal(mergedIncludesLine(base), "");
  assert.equal(mergedIncludesLine(base, []), "");
  assert.equal(mergedIncludesLine(base, ["", "  "]), "");
  assert.equal(mergedIncludesLine(base, null as unknown as unknown[]), "");
  assert.equal(
    mergedIncludesLine(base, ["اللائحة التنفيذية لنظام المرافعات الشرعية", "اللائحة التنفيذية لطرق الاعتراض على الأحكام"]),
    "يشتمل على: اللائحة التنفيذية • اللائحة التنفيذية لطرق الاعتراض على الأحكام",
  );
  // A third name is not shown, and no «+ N أخرى» is added (his wording names two).
  assert.equal(mergedIncludesLine(base, ["أ", "ب", "ج", "أ"]), "يشتمل على: أ • ب");
  assert.equal(mergedIncludesLine("", ["قواعد الإحالة"]), "يشتمل على: قواعد الإحالة");
  assert.doesNotMatch(mergedIncludesLine(base, ["أ", "ب", "ج"]), /\+|أخرى/);
});

test("١٢-٦: «آخر تحديث تشريعي» for everyone; «صدر» only for an open viewer and only when it differs", () => {
  assert.deepEqual(lawCardDates("1448/01/08هـ", "1447/03/01هـ", true), { update: "آخر تحديث تشريعي: 1448/01/08هـ", issued: "" });
  assert.deepEqual(lawCardDates("1448/01/08هـ", "1447/03/01هـ", false), { update: "آخر تحديث تشريعي: 1448/01/08هـ", issued: "صدر: 1447/03/01هـ" });
  assert.deepEqual(lawCardDates("1440/09/17هـ", "1440/9/17", false), { update: "آخر تحديث تشريعي: 1440/09/17هـ", issued: "" });
  assert.deepEqual(lawCardDates("", "—", false), { update: "", issued: "" });
  assert.deepEqual(lawCardDates(undefined, "1430/01/01", false), { update: "", issued: "صدر: 1430/01/01" });
});

test("source: no fixed «مُحدّث» badge; the card reads latest_legislative_update and the merged flag", () => {
  assert.doesNotMatch(cards, /"مُحدّث"|"مُحدَّث"/);
  assert.match(cards, /const cardDates = lawCardDates\(sys\.latestUpdate, sys\.lastUpdated, officialMetaLocked\);/);
  assert.match(cards, /mergedFileBadge\(/);
  assert.match(page, /latestUpdate: typeof law\.latest_legislative_update === "string" \? law\.latest_legislative_update : ""/);
  assert.match(page, /hasMerged: law\.has_merged_regulation === true/);
  // Owner 2026-11-07: the names arrive as merged_regulation_names → mergedNames.
  assert.match(page, /mergedNames: Array\.isArray\(law\.merged_regulation_names\)/);
  // Owner 2026-11-07: the badge is in the grid's top row, never alone under the title,
  // and the grey «يشتمل على» line sits under the title in both views.
  assert.doesNotMatch(cards, /\{mergedBadge && <div className="mb-2\.5">\{mergedBadge\}<\/div>\}/);
  assert.match(cards, /\{mergedBadge\}\s*\{isUnlocked \? \(/);
  assert.match(cards, /mergedIncludesLine\(sys\.title, sys\.mergedNames \?\? \[\]\)/);
  assert.equal((cards.match(/<\/h3>\s*\{mergedIncludesRow\}/g) || []).length, 2);
  assert.doesNotMatch(cards.slice(cards.indexOf("const mergedIncludesRow"), cards.indexOf("const mergedIncludesRow") + 400), /text-gray-(?:100|200)\b/);
  // a repealed law keeps its red frame: the red classes still come first
  assert.match(cards, /isRepealedLaw\s*\?\s*`hover:border-red-500/);
});
