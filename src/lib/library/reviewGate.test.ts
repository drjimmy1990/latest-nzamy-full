/**
 * l10 (gap 1.5, option A): the needs_human_review publish gate
 * (src/lib/library/reviewGate.ts) and its wiring in scripts/seed-library.ts
 * (source pins: the seeder needs a corpus to run; the end-to-end fixture is
 * scripts/seed-library.review-gate.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { holdBackReviewFlagged, isReviewFlagged, reviewReasonOf } from "./reviewGate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEEDER = readFileSync(path.join(here, "../../../scripts/seed-library.ts"), "utf8").replace(/\r\n/g, "\n");

const laws = [
  { slug: "clean-law", needsHumanReview: false },
  { slug: "flagged-law", needsHumanReview: true, reviewReason: "نص غير مكتمل\nسطر ثانٍ" },
  { slug: "old-parse-flag", needs_human_review: true },
  { slug: "string-true-is-parser-business", needsHumanReview: "true" },
];

test("isReviewFlagged: only a real `true` (the parser already turned «true» strings into booleans)", () => {
  assert.equal(isReviewFlagged(laws[0]), false);
  assert.equal(isReviewFlagged(laws[1]), true);
  assert.equal(isReviewFlagged(laws[2]), true);
  assert.equal(isReviewFlagged(laws[3]), false);
  assert.equal(isReviewFlagged(null), false);
  assert.equal(isReviewFlagged("x"), false);
});

test("gate on: a flagged file is held back with its id and reason; the rest is kept in order", () => {
  const { kept, held } = holdBackReviewFlagged(laws, "laws", (o) => o.slug, false);
  assert.deepEqual(kept.map((o) => o.slug), ["clean-law", "string-true-is-parser-business"]);
  assert.deepEqual(held, [
    { table: "laws", id: "flagged-law", reason: "نص غير مكتمل\nسطر ثانٍ" },
    { table: "laws", id: "old-parse-flag", reason: "(بلا سبب مسجَّل)" },
  ]);
});

test("--allow-review-flagged: nothing is held back (today's behaviour)", () => {
  const { kept, held } = holdBackReviewFlagged(laws, "laws", (o) => o.slug, true);
  assert.equal(kept.length, laws.length);
  assert.deepEqual(held, []);
});

test("reviewReasonOf reads both spellings", () => {
  assert.equal(reviewReasonOf({ review_reason: " سبب " }), "سبب");
  assert.equal(reviewReasonOf({}), "(بلا سبب مسجَّل)");
});

test("the seeder: the gate runs before seedLaws / seedDecrees, has an escape flag, and reports held_back", () => {
  assert.match(SEEDER, /seedLaws\(client, gated\("laws", "laws", /);
  assert.match(SEEDER, /seedDecrees\(client, gated\("decrees", "decrees_circulars", /);
  assert.match(SEEDER, /holdBackReviewFlagged\(data\[key\] as any\[\], table, idOf, allowReviewFlagged\)/);
  assert.match(SEEDER, /"--allow-review-flagged"/);
  assert.match(SEEDER, /allowReviewFlagged \}\)/, "the CLI passes the flag to seedLibrary");
  assert.match(SEEDER, /held_back: heldBack,/);
  assert.match(SEEDER, /HELD BACK/);
  assert.match(SEEDER, /Already-live rows are NOT deleted/);
});
