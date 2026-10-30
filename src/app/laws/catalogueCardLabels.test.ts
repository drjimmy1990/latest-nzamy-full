import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lawCardDates, mergedFileBadge, mergedFileName } from "./catalogueCardLabels.ts";

const cards = readFileSync(new URL("./components/LawsTabContent.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("١٢-٤: the merged badge names the regulation once; a count when the data has one", () => {
  assert.equal(mergedFileBadge(false), "");
  assert.equal(mergedFileBadge(undefined), "");
  assert.equal(mergedFileBadge(true), "📚 ملف مدمج · شامل اللائحة التنفيذية");
  assert.equal(mergedFileBadge(true, 4), "📚 ملف مدمج · شامل 4 لوائح وقواعد");
  // the title already says it: the badge does not repeat it
  assert.equal(mergedFileBadge(true, null, "نظام المرافعات الشرعية ولائحته التنفيذية"), "📚 ملف مدمج");
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
  // a repealed law keeps its red frame: the red classes still come first
  assert.match(cards, /isRepealedLaw\s*\?\s*`hover:border-red-500/);
});
