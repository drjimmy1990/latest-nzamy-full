/**
 * libraryInvitationDisplay.test.ts
 * Run: node --test src/lib/services/libraryInvitationDisplay.test.ts
 *      (or `npm run test:unit` for the whole suite)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { tierDisplayAr, redeemSuccessMessageAr } from "./libraryInvitationDisplay.ts";

// ── tierDisplayAr ────────────────────────────────────────────────────────

test("tierDisplayAr renders the pro tier as the English brand word", () => {
  assert.equal(tierDisplayAr("pro"), "Pro");
});

test("tierDisplayAr passes an unrecognized tier through unchanged rather than inventing a label", () => {
  assert.equal(tierDisplayAr("max"), "max");
});

// ── redeemSuccessMessageAr ───────────────────────────────────────────────

test("redeemSuccessMessageAr includes the Arabic-digit expiry when the server reports one", () => {
  assert.equal(
    redeemSuccessMessageAr("pro", "2026-10-04T09:30:00.000Z"),
    "فُعّلت باقة Pro حتى ٤ أكتوبر ٢٠٢٦",
  );
});

test("redeemSuccessMessageAr drops the date clause entirely when until is null", () => {
  assert.equal(redeemSuccessMessageAr("pro", null), "فُعّلت باقة Pro");
});

test("redeemSuccessMessageAr drops the date clause rather than print an unparseable one", () => {
  // formatArabicDate returns null for a string Date.parse cannot read — this
  // must never surface as "فُعّلت باقة Pro حتى Invalid Date".
  assert.equal(redeemSuccessMessageAr("pro", "not-a-date"), "فُعّلت باقة Pro");
});

test("redeemSuccessMessageAr never hard-codes the Pro label for a different tier", () => {
  assert.equal(
    redeemSuccessMessageAr("max", "2026-10-04T09:30:00.000Z"),
    "فُعّلت باقة max حتى ٤ أكتوبر ٢٠٢٦",
  );
});

// ── the library tier (owner answers ٢٠١–٢٠٣: a code grants the library) ─────

test("redeemSuccessMessageAr names the legal library, its 30 days and the end date", () => {
  assert.equal(
    redeemSuccessMessageAr("library", "2026-10-04T09:30:00.000Z", 30),
    "فُعّل اشتراك المكتبة القانونية لمدة ٣٠ يوماً حتى ٤ أكتوبر ٢٠٢٦",
  );
});

test("redeemSuccessMessageAr drops the length or the date it was not given, never says Pro", () => {
  assert.equal(
    redeemSuccessMessageAr("library", "2026-10-04T09:30:00.000Z", null),
    "فُعّل اشتراك المكتبة القانونية حتى ٤ أكتوبر ٢٠٢٦",
  );
  assert.equal(redeemSuccessMessageAr("library", null, 30), "فُعّل اشتراك المكتبة القانونية لمدة ٣٠ يوماً");
  assert.equal(redeemSuccessMessageAr("library", "not-a-date", undefined), "فُعّل اشتراك المكتبة القانونية");
  assert.ok(!redeemSuccessMessageAr("library", null, 30).includes("Pro"));
});

test("redeemSuccessMessageAr counts short library windows with the right Arabic form", () => {
  assert.equal(redeemSuccessMessageAr("library", null, 7), "فُعّل اشتراك المكتبة القانونية لمدة ٧ أيام");
  assert.equal(redeemSuccessMessageAr("library", null, 1), "فُعّل اشتراك المكتبة القانونية لمدة يوم واحد");
  assert.equal(redeemSuccessMessageAr("library", null, 0), "فُعّل اشتراك المكتبة القانونية");
});
