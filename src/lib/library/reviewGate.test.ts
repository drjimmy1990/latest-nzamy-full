/**
 * l10 (gap 1.5, option A, OPT-IN): the needs_human_review publish hold
 * (src/lib/library/reviewGate.ts) and its wiring in scripts/seed-library.ts
 * (source pins: the seeder needs a corpus to run; the end-to-end fixture is
 * scripts/seed-library.review-gate.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HELD_BACK_NOT_FULL_LOAD,
  holdBackReviewFlagged,
  isReviewFlagged,
  PUBLISHED_FLAGGED_LABEL,
  reviewReasonOf,
} from "./reviewGate.ts";

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

test("default (hold off): every file is kept, and the flagged ones come back as published", () => {
  const { kept, held, published } = holdBackReviewFlagged(laws, "laws", (o) => o.slug, false);
  assert.equal(kept.length, laws.length);
  assert.deepEqual(held, []);
  assert.deepEqual(published, [
    { table: "laws", id: "flagged-law", reason: "نص غير مكتمل\nسطر ثانٍ" },
    { table: "laws", id: "old-parse-flag", reason: "(بلا سبب مسجَّل)" },
  ]);
  assert.equal(PUBLISHED_FLAGGED_LABEL, "موسوم للمراجعة — يُنشر لأن البوابة غير مفعّلة");
});

test("--hold-review-flagged: a flagged file is held back with its id and reason; the rest is kept in order", () => {
  const { kept, held, published } = holdBackReviewFlagged(laws, "laws", (o) => o.slug, true);
  assert.deepEqual(kept.map((o) => o.slug), ["clean-law", "string-true-is-parser-business"]);
  assert.deepEqual(held, [
    { table: "laws", id: "flagged-law", reason: "نص غير مكتمل\nسطر ثانٍ" },
    { table: "laws", id: "old-parse-flag", reason: "(بلا سبب مسجَّل)" },
  ]);
  assert.deepEqual(published, []);
});

test("reviewReasonOf reads both spellings", () => {
  assert.equal(reviewReasonOf({ review_reason: " سبب " }), "سبب");
  assert.equal(reviewReasonOf({}), "(بلا سبب مسجَّل)");
});

test("the seeder: the hold is opt-in, runs before seedLaws / seedDecrees, lists both cases", () => {
  assert.match(SEEDER, /seedLaws\(client, gated\("laws", "laws", /);
  assert.match(SEEDER, /seedDecrees\(client, gated\("decrees", "decrees_circulars", /);
  assert.match(SEEDER, /holdBackReviewFlagged\(data\[key\] as any\[\], table, idOf, holdReviewFlagged\)/);
  assert.match(SEEDER, /const holdReviewFlagged = options\.holdReviewFlagged === true;/);
  assert.match(SEEDER, /const holdReviewFlagged = args\.includes\("--hold-review-flagged"\);/);
  // the earlier escape stays accepted (it means the default), never both at once
  assert.match(SEEDER, /"--hold-review-flagged", "--allow-review-flagged"\]\)/);
  assert.match(SEEDER, /--hold-review-flagged and --allow-review-flagged contradict each other/);
  assert.match(SEEDER, /holdReviewFlagged \}\)/, "the CLI passes the flag to seedLibrary");
  assert.match(SEEDER, /published_flagged: publishedFlagged\.map/);
  assert.match(SEEDER, /held_back: heldBack,/);
  assert.match(SEEDER, /for \(const h of publishedFlagged\) console\.log\(`  \$\{PUBLISHED_FLAGGED_LABEL\}: /);
  assert.match(SEEDER, /HELD BACK/);
  assert.match(SEEDER, /Already-live rows are NOT deleted/);
});

test("a held load is not a full load: the warning is printed only when the hold is on", () => {
  assert.match(HELD_BACK_NOT_FULL_LOAD, /NOT a FULL load/);
  assert.match(HELD_BACK_NOT_FULL_LOAD, /20261129_70 «position is null» cleanup/);
  assert.match(HELD_BACK_NOT_FULL_LOAD, /library:diff/);
  assert.match(HELD_BACK_NOT_FULL_LOAD, /without --hold-review-flagged/);
  const block = SEEDER.slice(SEEDER.indexOf("  } else if (heldBack.length > 0) {"), SEEDER.indexOf("const auditOutputDir"));
  assert.match(block, /console\.log\(`  ⚠ \$\{HELD_BACK_NOT_FULL_LOAD\}`\);/);
  assert.equal(SEEDER.split("${HELD_BACK_NOT_FULL_LOAD}").length - 1, 2, "printed once, in the report once");
  assert.match(SEEDER, /note: holdReviewFlagged\n\s+\? "held_back files got no rows/);
});
