/**
 * _reviewed-summary.test.ts — file 16 §6 with l9-parser's 20261129_70: the
 * frontmatter موجز shows only once reviewed; a draft never; no columns yet
 * (or a failed read) leaves today's موجز as it is.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readerSummaryFields, reviewedSummaryFor } from "./_reviewed-summary.ts";

test("reviewed → shown; draft, none or no columns → today's موجز (null)", () => {
  assert.equal(reviewedSummaryFor({ summary: " موجز مراجَع ", summary_status: "reviewed" }, true), "موجز مراجَع");
  assert.equal(reviewedSummaryFor({ summary: "مسودة", summary_status: "draft" }, true), null);
  assert.equal(reviewedSummaryFor({ summary: "بلا حالة", summary_status: null }, true), null);
  assert.equal(reviewedSummaryFor({ summary: "  ", summary_status: "reviewed" }, true), null);
  assert.equal(reviewedSummaryFor(null, true), null, "the columns do not exist yet, or the read failed");
});

test("a non-subscriber's reviewed موجز loses decree numbers and dates (٣١٩)", () => {
  const out = reviewedSummaryFor({ summary: "صدر بالمرسوم الملكي رقم (م/78) وتاريخ 1428/9/19هـ.\nينظّم القضاء.", summary_status: "reviewed" }, false);
  assert.ok(out !== null && !/م\/78|1428/.test(out), String(out));
});

test("the law route reads the columns on their own and falls back to today's موجز", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /\.select\(LAW_REVIEWED_SUMMARY_COLUMNS\)/);
  assert.match(route, /\(r\) => \(r\.error \? null : r\.data\),\s*\(\) => null,/);
  // Q96 (l12): the موجز keys come from readerSummaryFields with the reviewed-only switch.
  assert.match(route, /\.\.\.readerSummaryFields\(reviewedSummaryRow, isSubscriber, readerExtras, summariesReviewedOnly\),/);
  assert.match(route, /readSummariesReviewedOnly\(\)/);
  assert.doesNotMatch(route.match(/const LAW_DETAIL_COLUMNS =\s*'[^']*'/)?.[0] ?? "", /summary/, "never in the main law read (a missing column would fail it)");
});
