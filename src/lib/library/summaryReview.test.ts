/**
 * Q96 (batch l12): only a REVIEWED summary is shown — a reversible setting
 * (library_summaries_reviewed_only, ON by default), applied in the library
 * API: the law reader, the /laws cards, the decree page and the search
 * snippets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseSummariesReviewedOnly,
  summariesReviewedOnlyIssue,
  summaryShown,
  withReviewedSummaries,
} from "./summaryReview.ts";
import { readerSummaryFields } from "../../app/api/library/laws/[slug]/_reviewed-summary.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("Q96: the switch — ON by default, a malformed value reads ON, {on:false} turns it off", () => {
  assert.equal(parseSummariesReviewedOnly(undefined), true);
  assert.equal(parseSummariesReviewedOnly({ on: "no" }), true);
  assert.equal(parseSummariesReviewedOnly({ on: false }), false);
  assert.equal(parseSummariesReviewedOnly({ on: true }), true);
  assert.equal(summariesReviewedOnlyIssue({ on: false }), null);
  assert.notEqual(summariesReviewedOnlyIssue({ on: 1 }), null);
  assert.notEqual(summariesReviewedOnlyIssue({ on: true, extra: 1 }), null);
  assert.notEqual(summariesReviewedOnlyIssue(true), null);
});

test("Q96: only 'reviewed' is shown while the rule is on; everything while it is off", () => {
  assert.equal(summaryShown("reviewed", true), true);
  for (const s of ["draft", null, undefined, "", "REVIEWED"]) assert.equal(summaryShown(s, true), false, String(s));
  assert.equal(summaryShown("draft", false), true);
  assert.deepEqual(withReviewedSummaries({ id: 1, summary: "x", summary_brief: "y", summary_status: "draft" }, ["summary", "summary_brief"], true),
    { id: 1, summary: null, summary_brief: null });
  assert.deepEqual(withReviewedSummaries({ id: 1, summary: "x", summary_status: "reviewed" }, ["summary"], true), { id: 1, summary: "x" });
});

test("Q96: the law reader — the preamble's موجز only for a reviewed law; a reviewed frontmatter موجز first", () => {
  const extras = { summary: "موجز الديباجة", summaryLabel: "موجز" };
  assert.deepEqual(readerSummaryFields({ summary: null, summary_status: null }, true, extras, true), {});
  assert.deepEqual(readerSummaryFields({ summary: null, summary_status: "draft" }, true, extras, true), {});
  assert.deepEqual(readerSummaryFields(null, true, extras, true), {}, "status unknown (no column / failed read): nothing");
  assert.deepEqual(readerSummaryFields({ summary: "", summary_status: "reviewed" }, true, extras, true), extras);
  assert.deepEqual(readerSummaryFields({ summary: "مراجَع", summary_status: "reviewed" }, true, extras, true), { summary: "مراجَع" });
  assert.deepEqual(readerSummaryFields({ summary: null, summary_status: null }, true, extras, false), extras, "rule off: today's behaviour");
});

test("wiring: the cards, the decree page and the search apply it; the status never leaves", () => {
  const init = read("../../app/api/library/init/route.ts");
  assert.match(init, /const lawSummaryShown = summaryShown\(shaped\.summary_status, summariesReviewedOnly\);\s*delete shaped\.summary_status;\s*if \(!lawSummaryShown && "summary_brief" in shaped\) shaped\.summary_brief = null;/);
  assert.match(init, /const decreeSummaryShown = summaryShown\(shaped\.summary_status, summariesReviewedOnly\);\s*delete shaped\.summary_status;/);
  assert.match(init, /\{ key: "summaryStatus", columns: \["summary_status"\] \}/);
  const decree = read("../../app/api/library/decrees/[id]/route.ts");
  assert.match(decree, /const showSummaries = summaryShown\(decreeSummaryStatus, summariesReviewedOnly\);/);
  assert.match(decree, /summary: !showSummaries \? null :/);
  assert.match(decree, /summary_brief: !showSummaries \? null :/);
  const search = read("../../app/api/library/search/route.ts");
  assert.match(search, /if \(summariesReviewedOnly && orderResults\.length > 0\)/);
  const settings = read("../../app/api/v1/admin/settings/route.ts");
  assert.match(settings, /"library_summaries_reviewed_only",/);
  assert.match(settings, /library_summaries_reviewed_only: summariesReviewedOnlyIssue,/);
  const seo = read("./libraryDocumentSeo.ts");
  assert.match(seo, /const showSummary = await summaryAllowed\("laws", "slug", lawSlug\);/);
  assert.match(seo, /publicDescription\("law", showSummary \? str\(/);
  assert.match(seo, /const showSummary = await summaryAllowed\("decrees_circulars", "id", /);
  assert.match(seo, /return !error && summaryShown\(/);
  const sql = read("../../../supabase/migrations/20261202_50_l12_rules.sql");
  assert.match(sql, /\('library_summaries_reviewed_only', '\{"on": true\}'::jsonb,/);
  assert.match(sql, /alter table library\.decrees_circulars add column if not exists summary_status text;/);
});
