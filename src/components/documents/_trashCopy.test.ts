import test from "node:test";
import assert from "node:assert/strict";
import {
  DELETE_TO_BIN_NOTICE_AR,
  confirmDeleteToBinAr,
  deletedToBinNoticeAr,
  confirmPurgeAr,
  purgeFailureAr,
  restoreFailureAr,
  restoredNoticeAr,
  MAX_HOLD_REASON_LEN,
  holdReasonTooLongAr,
  holdFailureAr,
  formatDeletedAtAr,
} from "./_trashCopy.ts";

// ─── Delete → bin ───────────────────────────────────────────────────────────

test("DELETE_TO_BIN_NOTICE_AR is the exact sentence the task mandates", () => {
  assert.equal(DELETE_TO_BIN_NOTICE_AR, "سيُنقل إلى السلة ويُحذف نهائياً بعد ٣٠ يوماً.");
});

test("confirmDeleteToBinAr names the file and carries the bin notice, not the old irreversible wording", () => {
  const msg = confirmDeleteToBinAr("عقد الإيجار.pdf");
  assert.match(msg, /عقد الإيجار\.pdf/);
  assert.match(msg, /سيُنقل إلى السلة/);
  assert.doesNotMatch(msg, /لا يمكن التراجع/);
});

test("deletedToBinNoticeAr says بin, not gone", () => {
  assert.match(deletedToBinNoticeAr("ملف.pdf"), /سلة المحذوفات/);
});

// ─── Permanent delete ────────────────────────────────────────────────────────

test("confirmPurgeAr is the one place irreversible wording belongs", () => {
  const msg = confirmPurgeAr("ملف.pdf");
  assert.match(msg, /نهائياً/);
  assert.match(msg, /لا يمكن التراجع/);
});

test("purgeFailureAr: timeout branch says the purge may already have happened", () => {
  const msg = purgeFailureAr("ملف.pdf", true);
  assert.match(msg, /قد يكون الحذف قد تم فعلاً/);
});

test("purgeFailureAr: non-timeout branch reports a plain failure", () => {
  const msg = purgeFailureAr("ملف.pdf", false);
  assert.match(msg, /فشل الحذف النهائي/);
  assert.doesNotMatch(msg, /انتهت المهلة/);
});

// ─── Restore ─────────────────────────────────────────────────────────────────

test("restoreFailureAr: timeout vs plain-failure branches differ", () => {
  const timedOut = restoreFailureAr("ملف.pdf", true);
  const failed = restoreFailureAr("ملف.pdf", false);
  assert.match(timedOut, /انتهت المهلة/);
  assert.doesNotMatch(failed, /انتهت المهلة/);
  assert.match(failed, /فشلت استعادة/);
});

test("restoredNoticeAr names the file", () => {
  assert.match(restoredNoticeAr("ملف.pdf"), /ملف\.pdf/);
});

// ─── Legal hold ──────────────────────────────────────────────────────────────

test("MAX_HOLD_REASON_LEN mirrors the API route's own constant", () => {
  assert.equal(MAX_HOLD_REASON_LEN, 300);
});

test("holdReasonTooLongAr renders the cap in Arabic-Indic digits", () => {
  const msg = holdReasonTooLongAr();
  assert.match(msg, /٣٠٠/);
  assert.doesNotMatch(msg, /300/);
});

test("holdFailureAr: the verb flips between setting and clearing the hold", () => {
  const settingFailed = holdFailureAr("ملف.pdf", true, false);
  const clearingFailed = holdFailureAr("ملف.pdf", false, false);
  assert.match(settingFailed, /تفعيل الحجز القانوني على/);
  assert.match(clearingFailed, /إلغاء الحجز القانوني عن/);
});

test("holdFailureAr: timeout branch is worded differently from a plain failure", () => {
  const timedOut = holdFailureAr("ملف.pdf", true, true);
  assert.match(timedOut, /انتهت المهلة/);
});

// ─── formatDeletedAtAr ────────────────────────────────────────────────────────

test("formatDeletedAtAr renders a full timestamp as an Arabic Gregorian date", () => {
  assert.equal(formatDeletedAtAr("2026-08-15T09:30:00.000Z"), "١٥ أغسطس ٢٠٢٦");
});

test("formatDeletedAtAr renders a bare date the same way", () => {
  assert.equal(formatDeletedAtAr("2026-01-05"), "٥ يناير ٢٠٢٦");
});

test("formatDeletedAtAr uses Arabic-Indic digits, never Western ones", () => {
  const out = formatDeletedAtAr("2026-12-31T00:00:00.000Z");
  assert.doesNotMatch(out, /[0-9]/);
});

test("formatDeletedAtAr returns '' for null/undefined", () => {
  assert.equal(formatDeletedAtAr(null), "");
  assert.equal(formatDeletedAtAr(undefined), "");
});

test("formatDeletedAtAr returns the raw string for something unparseable", () => {
  assert.equal(formatDeletedAtAr("not-a-date"), "not-a-date");
});

test("formatDeletedAtAr never uses the Hijri calendar (regression: ar-SA resolves to Umm al-Qura)", () => {
  // 2026-01-05 in Umm al-Qura is Jumada al-Thani 1447 — if this function ever
  // regressed to `new Date(iso).toLocaleDateString('ar-SA')`, this assertion
  // would fail because the month name would not be "يناير".
  assert.equal(formatDeletedAtAr("2026-01-05T00:00:00.000Z"), "٥ يناير ٢٠٢٦");
});
