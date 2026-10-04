import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIssueReport,
  capHighlight,
  HIGHLIGHT_MAX,
  REPORT_CATEGORIES,
  REPORT_TEXT_MAX,
  reportArticleRef,
  reportTextIsValid,
} from "./reportIssuePayload.ts";
import { LIBRARY_ISSUE_KINDS, validateLibraryIssueReportInput } from "../../lib/services/feedbackInput.ts";

test("the four categories map onto existing kinds only (no migration)", () => {
  const byId = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c.id, c]));
  assert.equal(byId.text_error.kind, "wrong_text");
  assert.equal(byId.technical.kind, "other");
  assert.equal(byId.technical.prefix, "[مشكلة تقنية] ");
  assert.equal(byId.missing_or_unmerged.kind, "missing_article");
  assert.equal(byId.suggestion.kind, "other");
  assert.equal(byId.suggestion.prefix, "[اقتراح] ");
  for (const c of REPORT_CATEGORIES) assert.ok((LIBRARY_ISSUE_KINDS as readonly string[]).includes(c.kind), c.kind);
});

test("the validator still accepts all five stored kinds (FloatingButtons + old rows)", () => {
  for (const kind of LIBRARY_ISSUE_KINDS) {
    const v = validateLibraryIssueReportInput({ lawSlug: "labor-law", kind, description: "نص كافٍ للبلاغ" });
    assert.equal(v.ok, true, kind);
  }
});

test("the 5-char minimum applies to the reader's own text, not the prefix", () => {
  assert.equal(reportTextIsValid("    "), false);
  assert.equal(reportTextIsValid(" خطأ "), false);
  assert.equal(reportTextIsValid("خطأ هنا"), true);
});

test("prefix + note, no highlight", () => {
  const b = buildIssueReport({ categoryId: "suggestion", text: "  أضيفوا فهرساً  ", articleLabel: "المادة 5" });
  assert.deepEqual(b, { kind: "other", description: "[اقتراح] أضيفوا فهرساً", articleRef: "المادة 5" });
});

test("the highlight is quoted after the note and capped", () => {
  const b = buildIssueReport({ categoryId: "text_error", text: "الكلمة مصحفة", highlight: "  يعاقب   بالسجن  " });
  assert.equal(b.kind, "wrong_text");
  assert.equal(b.description, "الكلمة مصحفة\n\nالنص المظلل: «يعاقب بالسجن»");
  const long = capHighlight("س".repeat(900));
  assert.equal(long.length, HIGHLIGHT_MAX);
  assert.ok(long.endsWith("…"));
});

test("a maximal note + maximal highlight still passes the server's 2000-char rule", () => {
  const b = buildIssueReport({
    categoryId: "technical",
    text: "ن".repeat(REPORT_TEXT_MAX),
    highlight: "ظ".repeat(5000),
    articleLabel: "المادة الأولى",
  });
  assert.ok(b.description.length <= 2000, String(b.description.length));
  assert.ok(b.description.includes("النص المظلل"), "the quote survives");
  const v = validateLibraryIssueReportInput({ lawSlug: "x", ...b });
  assert.equal(v.ok, true);
});

test("articleRef is the display label only, trimmed to 100 — the old «num — title» 400 is gone", () => {
  const longTitle = "نظام " + "طويل ".repeat(40);
  const oldRef = `المادة الأولى — ${longTitle}`;
  assert.equal(validateLibraryIssueReportInput({ lawSlug: "x", articleRef: oldRef, kind: "other", description: "نص كافٍ" }).ok, false);
  assert.equal(reportArticleRef("  المادة   الأولى "), "المادة الأولى");
  assert.equal(reportArticleRef("م".repeat(150)).length, 100);
  assert.equal(reportArticleRef(null), "");
});
