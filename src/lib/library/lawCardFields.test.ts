/**
 * Owner ٢٦١: five card fields always shown, the rest behind «المزيد».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAW_CARD_PRIMARY_FIELDS,
  articleTallyLabel,
  collectOfficialLinks,
  isLinkOnlyValue,
  lawArticleCounts,
  lawCardLayout,
  linksInCardValue,
  officialSourceName,
} from "./lawCardFields.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "../../..");

const ACTIVE = { labelAr: "ساري", labelEn: "Active", tone: "effective" };

const CARD = {
  main: [
    { key: "نوع التشريع", value: "نظام" },
    { key: "حالة التشريع", value: "ساري — معدّل، آخر تعديل بقرار مجلس الوزراء رقم (429)" },
    { key: "أداة الإصدار", value: "مرسوم ملكي رقم (م/51)" },
    { key: "المصدر الرسمي", value: "[هيئة الخبراء](https://laws.boe.gov.sa/x)" },
    { key: "تاريخ النشر", value: "1426/09/25هـ" },
  ],
  more: [
    { key: "التصنيف", value: "عمالي" },
    { key: "عدد المواد", value: "245" },
    { key: "تاريخ الإصدار", value: "1426/08/23هـ" },
    { key: "الجهة المصدرة", value: "مجلس الوزراء" },
    { key: "أداة آخر تعديل", value: "قرار مجلس الوزراء رقم (429)" },
  ],
};

test("the default five (owner ٢٩٧ (أ)), «آخر تعديل» before «تاريخ الإصدار» (owner note ٠١ item ١): type, last amendment, issue date, status, issuing body", () => {
  assert.deepEqual(LAW_CARD_PRIMARY_FIELDS.map((f) => f.id), ["type", "lastAmendment", "issueDate", "status", "issuer"]);
  assert.equal(LAW_CARD_PRIMARY_FIELDS.length, 5);
});

test("the five are pooled from both tables, in list order; everything else is «المزيد», file order", () => {
  const out = lawCardLayout(CARD, { status: ACTIVE });
  assert.deepEqual(out.primary.map((f) => [f.id, f.source, f.value]), [
    ["type", "card", "نظام"],
    ["lastAmendment", "card", "قرار مجلس الوزراء رقم (429)"],
    ["issueDate", "card", "1426/08/23هـ"],
    ["status", "db", "ساري"],
    ["issuer", "card", "مجلس الوزراء"],
  ]);
  assert.deepEqual(out.more.map((f) => f.key), [
    "حالة التشريع", "أداة الإصدار", "المصدر الرسمي", "تاريخ النشر", "التصنيف", "عدد المواد",
  ]);
});

test("«تاريخ النشر» never fills «تاريخ الإصدار»; with no issue date the field is absent", () => {
  const out = lawCardLayout({ main: [{ key: "تاريخ النشر", value: "1426/09/25هـ" }], more: [] });
  assert.deepEqual(out.primary, []);
  assert.deepEqual(out.more, [{ key: "تاريخ النشر", value: "1426/09/25هـ" }]);
});

test("the issue date falls back to the database value only when the card has none", () => {
  assert.deepEqual(lawCardLayout({ main: [], more: [] }, { issueDate: "1426/8/23هـ" }).primary, [
    { id: "issueDate", source: "db", key: "تاريخ الإصدار", value: "1426/8/23هـ" },
  ]);
  assert.equal(lawCardLayout({ main: [], more: [] }, { issueDate: "" }).primary.length, 0);
  assert.equal(lawCardLayout(CARD, { issueDate: "9999" }).primary.find((f) => f.id === "issueDate")?.value, "1426/08/23هـ");
});

test("status: the recorded badge; the file row is not repeated when it says the same", () => {
  const out = lawCardLayout({ main: [{ key: "حالة التشريع", value: "ساري" }], more: [] }, { status: ACTIVE });
  assert.deepEqual(out.primary.map((f) => [f.id, f.source, f.value]), [["status", "db", "ساري"]]);
  assert.deepEqual(out.more, []);
});

test("status (owner ٢٥٩): no recorded status → the file's row if any, else no status field at all", () => {
  const withRow = lawCardLayout({ main: [{ key: "حالة التشريع", value: "ملغى" }], more: [] }, { status: null });
  assert.deepEqual(withRow.primary, [{ id: "status", source: "card", key: "حالة التشريع", value: "ملغى" }]);
  const none = lawCardLayout({ main: [{ key: "نوع التشريع", value: "نظام" }], more: [] }, { status: null });
  assert.equal(none.primary.some((f) => f.id === "status"), false);
});

test("placeholder values are neither a field nor an «المزيد» row", () => {
  const out = lawCardLayout({ main: [{ key: "الجهة المصدرة", value: "غير متوفر" }, { key: "عدد المواد", value: "لا يوجد" }], more: [] });
  assert.deepEqual(out, { primary: [], more: [], moreLaw: [], moreRegulation: [] });
});

test("changing the five is a change to the one list", () => {
  const out = lawCardLayout(CARD, { status: ACTIVE, fields: [LAW_CARD_PRIMARY_FIELDS[4]] });
  assert.deepEqual(out.primary.map((f) => f.id), ["issuer"]);
  assert.equal(out.more.length, 9);
});

test("the sidebar renders the card through lawCardLayout, the rest behind one «المزيد»", () => {
  const sidebar = readFileSync(path.join(repo, "src/app/laws/[slug]/_sidebar.tsx"), "utf8");
  assert.match(sidebar, /lawCardLayout\(law\.metadata_card, \{/);
  assert.equal((sidebar.match(/المزيد من بيانات التشريع/g) || []).length, 1);
});

// ── Owner note ٠١ (2026-10-30) ──────────────────────────────────────────────

// The owner's example page: نظام تملك غير السعوديين للعقار, merged with its regulation.
const MERGED = {
  main: [
    { key: "نوع التشريع", value: "نظام" },
    { key: "آخر تعديل", value: "لا توجد تعديلات لاحقة" },
    { key: "تاريخ النشر", value: "1447/01/30هـ" },
    { key: "الجهة المصدرة", value: "مجلس الوزراء" },
  ],
  more: [
    { key: "أداة الإصدار", value: "مرسوم ملكي رقم (م/14)" },
    { key: "اللوائح المدمجة", value: "اللائحة التنفيذية لنظام تملك غير السعوديين للعقار" },
    { key: "تاريخ النشر", value: "1447/01/30هـ" },
    { key: "المصدر الرسمي", value: "[هيئة الخبراء](https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/x/1)" },
    { key: "أداة إصدار اللائحة", value: "قرار مجلس الوزراء رقم (43)" },
    { key: "التصنيف", value: "القسم العقاري والبناء" },
    { key: "عدد المواد", value: "15" },
  ],
};

test("item ٢: «لا توجد تعديلات لاحقة» gives way to the merged file's latest event (subscriber's latestUpdate)", () => {
  const latestUpdate = "1448/01/08هـ (صدور اللائحة التنفيذية — قرار 43)";
  const out = lawCardLayout(MERGED, { latestUpdate });
  assert.deepEqual(out.primary.find((f) => f.id === "lastAmendment"), { id: "lastAmendment", source: "db", key: "آخر تعديل", value: latestUpdate });
  // The «لا توجد…» row is neither a field nor an «المزيد» row then.
  assert.equal(out.more.some((f) => f.value === "لا توجد تعديلات لاحقة"), false);
  // No latestUpdate (a guest, or a file without one): the card's own row stays.
  assert.equal(lawCardLayout(MERGED).primary.find((f) => f.id === "lastAmendment")?.value, "لا توجد تعديلات لاحقة");
  // A real amendment row is never overridden.
  const amended = { main: [{ key: "آخر تعديل", value: "مرسوم ملكي رقم (م/93)" }], more: [] };
  assert.equal(lawCardLayout(amended, { latestUpdate }).primary[0].value, "مرسوم ملكي رقم (م/93)");
  // Absent row → filled.
  assert.equal(lawCardLayout({ main: [], more: [] }, { latestUpdate }).primary[0].value, latestUpdate);
});

test("item ١: «آخر تعديل» is drawn before «تاريخ الإصدار»", () => {
  const out = lawCardLayout({ main: [{ key: "تاريخ الإصدار", value: "1426/08/23هـ" }, { key: "آخر تعديل", value: "م/1" }], more: [] });
  assert.deepEqual(out.primary.map((f) => f.id), ["lastAmendment", "issueDate"]);
});

test("item ٤: a row repeated across the two tables is shown once; «التصنيف» equal to the badge is dropped", () => {
  const out = lawCardLayout(MERGED, { category: "العقاري والبناء" });
  assert.equal(out.more.filter((f) => f.key === "تاريخ النشر").length, 1);
  assert.equal(out.more.some((f) => f.key === "التصنيف"), false, "«القسم العقاري والبناء» = the badge «العقاري والبناء»");
  // A different category stays.
  assert.equal(lawCardLayout(MERGED, { category: "التجاري" }).more.some((f) => f.key === "التصنيف"), true);
  // Same key, another value: both stay.
  const two = lawCardLayout({ main: [{ key: "تاريخ النشر", value: "1447/01/30هـ" }], more: [{ key: "تاريخ النشر", value: "1448/01/10هـ" }] });
  assert.equal(two.more.length, 2);
});

test("item ٥: «المزيد» splits into the law's rows and the merged regulation's (by key only)", () => {
  const out = lawCardLayout(MERGED, {});
  assert.deepEqual(out.moreRegulation.map((f) => f.key), ["اللوائح المدمجة", "أداة إصدار اللائحة"]);
  assert.ok(out.moreLaw.some((f) => f.key === "أداة الإصدار"));
  assert.equal(out.moreLaw.length + out.moreRegulation.length, out.more.length);
  // A law with no regulation row: the regulation group is empty (the sidebar then draws none).
  assert.deepEqual(lawCardLayout(CARD).moreRegulation, []);
});

test("item ٣: official sources by Arabic name, never a raw host", () => {
  assert.equal(officialSourceName("https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/x/1"), "هيئة الخبراء");
  assert.equal(officialSourceName("https://uqn.gov.sa/details?p=1"), "جريدة أم القرى");
  assert.equal(officialSourceName("https://laws.moj.gov.sa/ar/legislation/1"), "بوابة وزارة العدل");
  assert.equal(officialSourceName("https://www.mof.gov.sa/x"), "موقع الجهة المختصة");
  assert.equal(officialSourceName("not a url"), "موقع الجهة المختصة");
  assert.deepEqual(linksInCardValue("[laws.moj.gov.sa](https://laws.moj.gov.sa/x) · https://uqn.gov.sa/a."), [
    { label: "بوابة وزارة العدل", url: "https://laws.moj.gov.sa/x" },
    { label: "جريدة أم القرى", url: "https://uqn.gov.sa/a" },
  ]);
  // The card's own Arabic link text is kept.
  assert.deepEqual(linksInCardValue("[بوابة وزارة العدل — النص المحدث](https://laws.moj.gov.sa/x)"), [
    { label: "بوابة وزارة العدل — النص المحدث", url: "https://laws.moj.gov.sa/x" },
  ]);
  // Not a link: javascript:, a relative path.
  assert.deepEqual(linksInCardValue("[x](javascript:alert(1)) [y](/laws/a)"), []);
  assert.equal(isLinkOnlyValue("[هيئة الخبراء](https://laws.boe.gov.sa/x) · [أم القرى](https://uqn.gov.sa/a)"), true);
  assert.equal(isLinkOnlyValue("مرسوم ملكي [هيئة الخبراء](https://laws.boe.gov.sa/x)"), false);
  assert.equal(isLinkOnlyValue("مجلس الوزراء"), false);
});

test("item ٣: every source once, the route's first, then the card's", () => {
  const server = [{ label: "هيئة الخبراء", url: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/x/1" }];
  const links = collectOfficialLinks(server, [
    ...MERGED.more,
    { key: "رابط بوابة وزارة العدل", value: "https://laws.moj.gov.sa/x" },
  ]);
  assert.deepEqual(links, [
    { label: "هيئة الخبراء", url: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/x/1" },
    { label: "بوابة وزارة العدل", url: "https://laws.moj.gov.sa/x" },
  ]);
  assert.deepEqual(collectOfficialLinks([], []), []);
});

test("item ٦ / note ١٢ item ٧: article counts per container, from every loaded article", () => {
  const articles = [
    { status: "active", article_regulations: [{ ref: "اللائحة التنفيذية [بوابة 6/تحقُّق حي]", status: "active" }, { ref: "اللائحة التنفيذية", status: "amended", is_secondary_display: false }] },
    { status: "amended", article_regulations: [{ ref: "اللائحة التنفيذية", status: "active", is_secondary_display: true }] },
    { status: "repealed" },
    { status: "active", instrument: "ملحق" },
    { status: "active", instrument: "لائحة" },
  ];
  const strip = (r: string) => r.replace(/\s*\[[^\]]*\]/g, "").trim();
  const c = lawArticleCounts(articles, strip);
  assert.deepEqual(c.law, { total: 3, amended: 1, repealed: 1 });
  assert.deepEqual(c.regulations, [
    { name: "اللائحة التنفيذية", total: 2, amended: 1, repealed: 0 },
    { name: "لائحة مستقلة", total: 1, amended: 0, repealed: 0 },
  ]);
  assert.equal(c.annexes, 1);
  assert.equal(articleTallyLabel(c.law), "3 · 1 معدّلة · 1 ملغاة");
  assert.equal(articleTallyLabel({ total: 15, amended: 0, repealed: 0 }), "15");
  // A law with no regulation: no regulation entry at all.
  assert.deepEqual(lawArticleCounts([{ status: "active" }]).regulations, []);
});
