/**
 * Owner question ٢٦٠ (open): the موجز and the card are for subscribers until
 * he answers, and the answer is the single flag LAW_SUMMARY_AUDIENCE.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAW_SUMMARY_AUDIENCE, cardForViewer, lawReaderExtras, lawSummaryVisible } from "./lawSummaryVisibility.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "../../..");
const read = (p: string) => readFileSync(path.join(repo, p), "utf8");

const PREAMBLE = [
  "<details open>",
  "<summary>📝 موجز النظام</summary>",
  "",
  "> ينظم النظام علاقات العمل.",
  "",
  "</details>",
  "",
  "### 📊 بطاقة تعريف نظام",
  "",
  "| الحقل | القيمة |",
  "| :--- | :--- |",
  "| **نوع التشريع** | نظام |",
  "| **حالة التشريع** | ساري — معدّل، آخر تحديث بقرار وزير العدل رقم (512) |",
  "| **أداة الإصدار** | مرسوم ملكي رقم (م/51) |",
  "| **تاريخ النشر** | 1426/09/25هـ |",
  "| **المصدر الرسمي** | [هيئة الخبراء](https://laws.boe.gov.sa/x) |",
  "| **الجهة المصدرة** | مجلس الوزراء |",
  "",
  "# نظام العمل",
].join("\n");

test("the default audience is subscribers (today's preamble rule, T28-22)", () => {
  assert.equal(LAW_SUMMARY_AUDIENCE, "subscribers");
  assert.equal(lawSummaryVisible(true), true);
  assert.equal(lawSummaryVisible(false), false);
});

test("«everyone» opens it to every viewer", () => {
  assert.equal(lawSummaryVisible(false, "everyone"), true);
  assert.equal(lawSummaryVisible(true, "everyone"), true);
});

test("a non-subscriber gets no summary / card keys at all, and the preamble untouched", () => {
  const out = lawReaderExtras(PREAMBLE, false);
  assert.deepEqual(Object.keys(out), ["preamble"]);
  assert.equal(out.preamble, PREAMBLE);
});

test("a subscriber gets the موجز, the whole card, and a preamble without them", () => {
  const out = lawReaderExtras(PREAMBLE, true);
  assert.equal(out.summary, "ينظم النظام علاقات العمل.");
  assert.equal(out.summaryLabel, "📝 موجز النظام");
  assert.equal(out.metadata_card?.main.length, 6);
  assert.equal(out.preamble, "# نظام العمل");
});

test("a preamble with no blocks gives a subscriber the preamble only", () => {
  const out = lawReaderExtras("# نظام\n\nإن مجلس الوزراء…", true);
  assert.deepEqual(out, { preamble: "# نظام\n\nإن مجلس الوزراء…" });
});

test("«everyone» + a non-subscriber: the card loses its T28-22 rows (decree, dates, links, amending decree)", () => {
  const out = lawReaderExtras(PREAMBLE, false, "everyone");
  assert.equal(out.summary, "ينظم النظام علاقات العمل.");
  assert.deepEqual(out.metadata_card?.main, [
    { key: "نوع التشريع", value: "نظام" },
    { key: "الجهة المصدرة", value: "مجلس الوزراء" },
  ]);
});

test("cardForViewer: null stays null; an all-official card becomes null for a non-subscriber", () => {
  assert.equal(cardForViewer(null, true), null);
  assert.equal(cardForViewer({ main: [{ key: "أداة الإصدار", value: "مرسوم ملكي رقم (م/1)" }], more: [] }, false), null);
});

test("the law route uses this flag on the subscriber flag (hasFullLibraryAccess), never the whitelist", () => {
  const route = read("src/app/api/library/laws/[slug]/route.ts");
  assert.match(route, /lawReaderExtras\(\s*preamble,\s*isSubscriber\s*\)/);
  assert.match(route, /hasFullLibraryAccess\(userId\)/);
});
