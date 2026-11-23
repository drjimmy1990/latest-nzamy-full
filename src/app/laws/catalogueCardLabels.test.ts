import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lawCardDates, MERGED_INCLUDES_MAX, mergedFileBadge, mergedFileName, mergedIncludesLine, mergedMoreLabel, subLegislationCountLabel } from "./catalogueCardLabels.ts";

const cards = readFileSync(new URL("./components/LawsTabContent.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./(index)/page.tsx", import.meta.url), "utf8");

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
  // A third name is not on this line: the count is a line of its own (mergedMoreLabel).
  assert.equal(mergedIncludesLine(base, ["أ", "ب", "ج", "أ"]), "يشتمل على: أ • ب");
  assert.equal(mergedIncludesLine("", ["قواعد الإحالة"]), "يشتمل على: قواعد الإحالة");
  assert.doesNotMatch(mergedIncludesLine(base, ["أ", "ب", "ج"]), /\+|أخرى/);
});

test("file 16 §7: «+N تشريعات فرعية» counts the sub-legislation the card does not name", () => {
  const base = "نظام القضاء";
  assert.equal(mergedMoreLabel(base, []), "");
  assert.equal(mergedMoreLabel(base, ["أ", "ب"]), "", "both names are on the card");
  assert.equal(mergedMoreLabel(base, ["أ", "ب", "ج", "أ"]), "+1 تشريع فرعي", "a repeated name counts once");
  assert.equal(mergedMoreLabel(base, ["أ", "ب", "ج", "د"]), "+2 تشريعان فرعيان");
  assert.equal(mergedMoreLabel(base, ["أ", "ب", "ج", "د", "هـ", "و"]), "+4 تشريعات فرعية");
  assert.equal(mergedMoreLabel(base, Array.from({ length: 14 }, (_, i) => `ل${i}`)), "+12 تشريعًا فرعيًا");
  // Batch l10: the card adds the linked children the API counted (sub_legislation_count).
  // Batch l12 (file 03 L3): the named ones are listed (SubLegislationNames); «+N» counts the rest.
  assert.match(cards, /const unnamedSubs = unnamedSubLegislationCount\(subLegislationCount, linkedTitles\.length\);/);
  assert.match(cards, /data-testid="law-card-merged-more"/);
});

test("file 16 §7 + library agent §1.8 (l10): merged names past two PLUS linked children not among them", () => {
  const base = "نظام القضاء";
  const six = ["آلية العمل التنفيذية", "لائحة التفتيش القضائي", "لائحة أعوان القضاة", "ج", "د", "هـ"];
  // نظام القضاء today: 6 merged names, 0 linked children → exactly l9's «+4»
  assert.equal(mergedMoreLabel(base, six), "+4 تشريعات فرعية");
  assert.equal(mergedMoreLabel(base, six, 0), "+4 تشريعات فرعية");
  // a linked child whose title is a merged name is not counted by the API → still «+4»; a different one → «+5»
  assert.equal(mergedMoreLabel(base, six, 1), "+5 تشريعات فرعية");
  // a law with no merged regulation and 3 linked children
  assert.equal(mergedMoreLabel(base, [], 3), "+3 تشريعات فرعية");
  assert.equal(mergedMoreLabel(base, ["أ"], 1), "+1 تشريع فرعي", "one merged name is on the card; the child is not");
  for (const v of [-2, 1.5, NaN, "2", null]) assert.equal(mergedMoreLabel(base, [], v), "", String(v));
  assert.equal(subLegislationCountLabel(12), "+12 تشريعًا فرعيًا");
  // the card reads sub_legislation_count on EVERY card (not only behind the merged line)
  assert.match(page, /subLegislationCount: typeof law\.sub_legislation_count === "number" \? law\.sub_legislation_count : 0,/);
  assert.match(cards, /const subLegislationCount = typeof sys\.subLegislationCount === "number" \? sys\.subLegislationCount : 0;/);
  assert.match(cards, /const mergedIncludesRow = mergedIncludes \|\| mergedMore \? \(/);
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
  // Batch l12 (file 03 L3): merged names, then linked titles, in the admin's name form.
  assert.match(cards, /cardSubLegislationNames\(sys\.title, mergedLabel \? sys\.mergedNames \?\? \[\] : \[\], linkedTitles, /);
  // Arabic only (fix round 1): an English card (titleEn) shows no Arabic names.
  assert.match(cards, /const subNames = isRTL\s*\? cardSubLegislationNames\(/);
  assert.equal((cards.match(/<\/h3>\s*\{mergedIncludesRow\}/g) || []).length, 2);
  assert.doesNotMatch(cards.slice(cards.indexOf("const mergedIncludesRow"), cards.indexOf("const mergedIncludesRow") + 400), /text-gray-(?:100|200)\b/);
  // a repealed law keeps its red frame: the red classes still come first
  assert.match(cards, /isRepealedLaw\s*\?\s*`hover:border-red-500/);
});

test("file 03 L3 (l12): the card names merged regulations then linked documents (admin forces full / short)", async () => {
  const { cardSubLegislationNames, unnamedSubLegislationCount, CARD_SUB_NAMES_SHOWN } = await import("./catalogueCardLabels.ts");
  const base = "نظام المرور";
  const merged = ["اللائحة التنفيذية لنظام المرور"];
  const linked = ["لائحة الأحكام المنظمة لإنشاء وتشغيل مدارس لتعليم قيادة المركبات لعام 1443هـ"];
  assert.deepEqual(cardSubLegislationNames(base, merged, linked, "full"), [...merged, ...linked]);
  assert.deepEqual(cardSubLegislationNames(base, merged, linked, "short"), ["اللائحة التنفيذية", linked[0]]);
  // a linked document that is the merged regulation again is named once
  assert.deepEqual(cardSubLegislationNames(base, merged, ["اللائحة التنفيذية لنظام المرور", "اللائحة التنفيذية"], "full"), merged);
  // blanks and the base title itself are no names
  assert.deepEqual(cardSubLegislationNames(base, ["", "  ", base], []), []);
  assert.equal(CARD_SUB_NAMES_SHOWN, 2);
  assert.equal(unnamedSubLegislationCount(12, 10), 2);
  assert.equal(unnamedSubLegislationCount(1, 1), 0);
  assert.equal(unnamedSubLegislationCount("3", 0), 0);
  // the card: two names, then «إظهار المزيد» in place; the button never opens the card
  assert.match(cards, /names\.slice\(0, CARD_SUB_NAMES_SHOWN\)/);
  assert.match(cards, /\{open \? "إظهار أقل" : "إظهار المزيد"\}/);
  assert.match(cards, /onClick=\{\(e\) => \{ stop\(e\); setOpen/);
  assert.match(page, /subLegislationTitles: Array\.isArray\(law\.sub_legislation_titles\)/);
  assert.match(page, /setChildNameForm\(subNameFormOf\(data\?\.display\?\.childNameForm\)\);/);
});

test("owner Q172 (ب) (l13): short «اللائحة التنفيذية» when the name only repeats the law's title", async () => {
  const { cardSubLegislationNames, shortSubLegislationName } = await import("./catalogueCardLabels.ts");
  // the default form is "auto"
  assert.deepEqual(cardSubLegislationNames("نظام المرور", ["اللائحة التنفيذية لنظام المرور"], []), ["اللائحة التنفيذية"]);
  assert.equal(shortSubLegislationName("نظام الضمان الاجتماعي", "اللائحة التنفيذية لنظام الضمان الاجتماعي"), "اللائحة التنفيذية");
  assert.equal(shortSubLegislationName("تنظيم الدعم السكني", "اللائحة التنفيذية لتنظيم الدعم السكني"), "اللائحة التنفيذية");
  // the law's title spelt «و المشتريات» on the card and «والمشتريات» in the regulation's name
  assert.equal(shortSubLegislationName("نظام المنافسات و المشتريات الحكومية", "اللائحة التنفيذية لنظام المنافسات والمشتريات الحكومية"), "اللائحة التنفيذية");
  // a card title that carries «ولائحته التنفيذية» or a year the regulation's name does not
  assert.equal(shortSubLegislationName("نظام مراقبة شركات التمويل ولائحته التنفيذية", "اللائحة التنفيذية لنظام مراقبة شركات التمويل"), "اللائحة التنفيذية");
  assert.equal(
    shortSubLegislationName("نظام (قانون) التنظيم الصناعي الموحد لدول مجلس التعاون لدول الخليج العربية لعام 1447هـ", "اللائحة التنفيذية لنظام (قانون) التنظيم الصناعي الموحد لدول مجلس التعاون لدول الخليج العربية"),
    "اللائحة التنفيذية",
  );
  // a year, «المعدلة» or «الصادرة …» after the repeated title is kept: it tells two regulations apart
  assert.equal(shortSubLegislationName("نظام تصنيف المقاولين", "اللائحة التنفيذية لنظام تصنيف المقاولين لعام 1445هـ"), "اللائحة التنفيذية لعام 1445هـ");
  assert.equal(shortSubLegislationName("نظام الاستثمار التعديني", "اللائحة التنفيذية لنظام الاستثمار التعديني المعدلة لعام 1444هـ"), "اللائحة التنفيذية المعدلة لعام 1444هـ");
  assert.equal(
    shortSubLegislationName("نظام وثائق السفر", "اللائحة التنفيذية لنظام وثائق السفر الصادرة بالقرار الوزاري رقم 4903 لعام 1447هـ"),
    "اللائحة التنفيذية الصادرة بالقرار الوزاري رقم 4903 لعام 1447هـ",
  );
  // harakat are kept as written
  assert.equal(
    shortSubLegislationName("نظام التنفيذ أمام ديوان المظالم", "اللائحة التنفيذية لنظام التنفيذ أمام ديوان المظالم الصادرة بقرار رقم (2/ 1445/ عاشراً)"),
    "اللائحة التنفيذية الصادرة بقرار رقم (2/ 1445/ عاشراً)",
  );
  // the real card: three regulations of نظام تصنيف المقاولين stay three distinct short names
  assert.deepEqual(
    cardSubLegislationNames("نظام تصنيف المقاولين", ["اللائحة التنفيذية لنظام تصنيف المقاولين"], [
      "اللائحة التنفيذية لنظام تصنيف المقاولين لعام 1443هـ",
      "اللائحة التنفيذية لنظام تصنيف المقاولين لعام 1445هـ",
    ]),
    ["اللائحة التنفيذية", "اللائحة التنفيذية لعام 1443هـ", "اللائحة التنفيذية لعام 1445هـ"],
  );
});

test("owner Q172 (ب) (l13): the full name stays when the short one would mislead", async () => {
  const { cardSubLegislationNames, shortSubLegislationName } = await import("./catalogueCardLabels.ts");
  // the name does not repeat the title: nothing to shorten
  assert.equal(shortSubLegislationName("نظام المرور", "لائحة الأحكام المنظمة لإنشاء وتشغيل مدارس لتعليم قيادة المركبات لعام 1443هـ"), null);
  assert.equal(shortSubLegislationName("نظام الدفاع المدني", "لائحة شروط السلامة والحماية من الحريق في الصيدليات ومستودعات الأدوية"), null);
  // the name names another law (it is shared by two laws)
  assert.equal(shortSubLegislationName("نظام القضاء", "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم"), null);
  assert.equal(shortSubLegislationName("نظام ديوان المظالم", "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم"), null);
  assert.equal(shortSubLegislationName("نظام التأمينات الاجتماعية", "اللائحة المشتركة لنظام التقاعد المدني ولنظام التأمينات الاجتماعية"), null);
  // an older, shorter title of the law: that names a different law, so the full name stays
  assert.equal(shortSubLegislationName("نظام رسوم الأراضي البيضاء والعقارات الشاغرة", "اللائحة التنفيذية لنظام رسوم الأراضي البيضاء"), null);
  // the title appears without «ل» (as an object of another word): never cut
  assert.equal(shortSubLegislationName("نظام الكهرباء", "لائحة ضبط وإثبات مخالفات أحكام نظام الكهرباء والفصل فيها"), null);
  assert.equal(shortSubLegislationName("نظام العمل", "اللائحة التنفيذية للمادة 77 من نظام العمل"), null);
  // a longer law whose title merely begins with this one
  assert.equal(shortSubLegislationName("نظام المرور", "اللائحة التنفيذية لنظام المرور البحري"), null);
  // a short name ending on a word that waits for the lost title
  assert.equal(shortSubLegislationName("نظام المرور", "قواعد التنسيق بين الجهات في لنظام المرور"), null);
  // the bare title, blanks and non-text
  assert.equal(shortSubLegislationName("نظام المرور", "نظام المرور"), null);
  assert.equal(shortSubLegislationName("نظام المرور", ""), null);
  assert.equal(shortSubLegislationName("", "اللائحة التنفيذية لنظام المرور"), null);
  assert.equal(shortSubLegislationName("نظام المرور", 7), null);
  // two names shortening to one text: both stay in full
  assert.deepEqual(
    cardSubLegislationNames("نظام الزراعة", ["اللائحة التنفيذية لنظام الزراعة لعام 1444هـ"], ["اللائحة التنفيذية لعام 1444هـ"]),
    ["اللائحة التنفيذية لنظام الزراعة لعام 1444هـ", "اللائحة التنفيذية لعام 1444هـ"],
  );
  // …while the other names on the same card are still shortened
  assert.deepEqual(
    cardSubLegislationNames("نظام الزراعة", ["اللائحة التنفيذية لنظام الزراعة", "اللائحة التنفيذية لنظام الزراعة لعام 1444هـ"], ["اللائحة التنفيذية لعام 1444هـ"]),
    ["اللائحة التنفيذية", "اللائحة التنفيذية لنظام الزراعة لعام 1444هـ", "اللائحة التنفيذية لعام 1444هـ"],
  );
  // the same regulation listed twice (spacing differs) is named once, short
  assert.deepEqual(
    cardSubLegislationNames("نظام المنافسات و المشتريات الحكومية", ["اللائحة التنفيذية لنظام المنافسات والمشتريات الحكومية"], ["اللائحة التنفيذية لنظام المنافسات و المشتريات الحكومية"]),
    ["اللائحة التنفيذية"],
  );
  // the admin forces full: nothing shortened
  assert.deepEqual(
    cardSubLegislationNames("نظام المرور", ["اللائحة التنفيذية لنظام المرور"], [], "full"),
    ["اللائحة التنفيذية لنظام المرور"],
  );
});

test("owner Q172 (l13): the card follows the API's form, unknown → automatic", async () => {
  const { subNameFormOf } = await import("./catalogueCardLabels.ts");
  assert.equal(subNameFormOf("full"), "full");
  assert.equal(subNameFormOf("short"), "short");
  assert.equal(subNameFormOf("auto"), "auto");
  assert.equal(subNameFormOf(undefined), "auto");
  assert.equal(subNameFormOf("FULL"), "auto");
  assert.match(cards, /cardSubLegislationNames\(sys\.title, mergedLabel \? sys\.mergedNames \?\? \[\] : \[\], linkedTitles, subNameFormOf\(sys\.childNameForm\)\)/);
  assert.match(page, /useState<SubNameForm>\("auto"\)/);
});
