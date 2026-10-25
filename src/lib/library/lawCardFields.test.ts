/**
 * Owner ٢٦١: five card fields always shown, the rest behind «المزيد».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAW_CARD_PRIMARY_FIELDS, lawCardLayout } from "./lawCardFields.ts";

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

test("the default five are the owner's offered (أ): type, issue date, last amendment, status, issuing body", () => {
  assert.deepEqual(LAW_CARD_PRIMARY_FIELDS.map((f) => f.id), ["type", "issueDate", "lastAmendment", "status", "issuer"]);
  assert.equal(LAW_CARD_PRIMARY_FIELDS.length, 5);
});

test("the five are pooled from both tables, in list order; everything else is «المزيد», file order", () => {
  const out = lawCardLayout(CARD, { status: ACTIVE });
  assert.deepEqual(out.primary.map((f) => [f.id, f.source, f.value]), [
    ["type", "card", "نظام"],
    ["issueDate", "card", "1426/08/23هـ"],
    ["lastAmendment", "card", "قرار مجلس الوزراء رقم (429)"],
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
  assert.deepEqual(out, { primary: [], more: [] });
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
