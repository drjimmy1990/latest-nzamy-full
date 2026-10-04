import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findInternalContentKeys,
  isInternalContentKey,
  stripInternalContentKeys,
} from "./internalContentFields.ts";

test("every internal key seen on the live rows (2026-10-04) is internal", () => {
  for (const key of [
    "editorial_notes",
    "editorial_notes_dates",
    "review_reason",
    "review_reason_source",
    "review_cleared_on",
    "review_cleared_reason",
    "review_note",
    "needs_human_review",
    "type_review_reason",
    "reviewReason",
    "needsHumanReview",
    "editorialNotesDates",
  ]) {
    assert.equal(isInternalContentKey(key), true, key);
  }
});

test("public front-matter keys stay", () => {
  for (const key of [
    "title",
    "slug",
    "seo_title",
    "seo_keywords",
    "taxonomy_tags",
    "total_principles",
    "year_hijri",
    "source_file",
    "reviewed", // not the review_* family
    "previews",
  ]) {
    assert.equal(isInternalContentKey(key), false, key);
  }
});

test("strip removes internal keys at any depth and keeps the rest", () => {
  const input = {
    title: "مبادئ ديوان المظالم",
    needs_human_review: true,
    review_reason: "ملاحظة داخلية",
    editorial_notes: [{ note: "داخلي" }],
    _inherited: { editorial_notes_dates: ["1447/01/01"], seo_title: "عنوان" },
    aeo_pairs: [{ q: "سؤال", review_note: "داخلي" }],
  };
  const out = stripInternalContentKeys(input);
  assert.deepEqual(out, {
    title: "مبادئ ديوان المظالم",
    _inherited: { seo_title: "عنوان" },
    aeo_pairs: [{ q: "سؤال" }],
  });
  // the input is not mutated
  assert.equal(input.review_reason, "ملاحظة داخلية");
  assert.deepEqual(findInternalContentKeys(out), []);
});

test("find reports dotted paths", () => {
  assert.deepEqual(
    findInternalContentKeys({ a: { review_note: "x" }, b: [{ editorial_notes: [] }], needs_human_review: false }),
    ["a.review_note", "b[0].editorial_notes", "needs_human_review"],
  );
});

test("non-objects pass through", () => {
  assert.equal(stripInternalContentKeys(null), null);
  assert.equal(stripInternalContentKeys("نص"), "نص");
  assert.deepEqual(stripInternalContentKeys([1, "a"]), [1, "a"]);
});
