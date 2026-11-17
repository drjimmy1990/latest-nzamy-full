import { test } from "node:test";
import assert from "node:assert/strict";
import { citedByFilter, FULL_PREVIEW_MAX, LOCKED_PREVIEW_CHARS, parsePreviewQuery, previewExcerpt } from "./sourcePreview.ts";

test("parsePreviewQuery takes an article or a principle id, nothing else", () => {
  assert.deepEqual(parsePreviewQuery(new URLSearchParams("kind=article&id=labor__art-80")), { kind: "article", id: "labor__art-80" });
  assert.deepEqual(parsePreviewQuery(new URLSearchParams("kind=principle&id=%20LAW-98__pr-35%20")), { kind: "principle", id: "LAW-98__pr-35" });
  for (const q of ["kind=decree&id=x", "kind=article", "kind=article&id=", `kind=article&id=${"x".repeat(201)}`, "kind=article&id=a%0Ab", "id=x"]) {
    assert.equal(parsePreviewQuery(new URLSearchParams(q)), null, q);
  }
});

test("citedByFilter is the jsonb containment of one citation", () => {
  assert.equal(citedByFilter("article", "labor__art-80"), '[{"kind":"article","id":"labor__art-80"}]');
});

test("a viewer without full access gets the reader's 100 characters, of original_text too", () => {
  const long = "ن".repeat(500);
  assert.deepEqual(previewExcerpt({ text: long }, false), { excerpt: `${"ن".repeat(LOCKED_PREVIEW_CHARS)}…`, truncated: true });
  // A repealed article: text empty, its substance in original_text — still 100 characters.
  assert.equal(previewExcerpt({ text: "  ", original_text: long }, false).excerpt.length, LOCKED_PREVIEW_CHARS + 1);
  assert.deepEqual(previewExcerpt({ text: "قصير" }, false), { excerpt: "قصير", truncated: false });
});

test("full access gets the whole text up to the cap", () => {
  assert.deepEqual(previewExcerpt({ text: "نص المادة كاملاً" }, true), { excerpt: "نص المادة كاملاً", truncated: false });
  const huge = "س".repeat(FULL_PREVIEW_MAX + 10);
  assert.equal(previewExcerpt({ text: huge }, true).excerpt.length, FULL_PREVIEW_MAX + 1);
  assert.deepEqual(previewExcerpt({}, true), { excerpt: "", truncated: false });
});
