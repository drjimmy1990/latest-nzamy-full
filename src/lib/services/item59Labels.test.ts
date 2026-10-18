import test from "node:test";
import assert from "node:assert/strict";

import {
  HEARING_DURATION_LABEL_AR,
  TASK_ASSIGNEE_LABEL_AR,
  DOCUMENT_SOURCE_LABEL_AR,
  DOCUMENT_SOURCE_LABELS_AR,
  formatDurationAr,
  documentSourceLabelAr,
  assigneeLabelAr,
  HEARING_DURATION_OPTIONS,
  validateHearingDuration,
  HEARING_DURATION_INVALID_AR,
  assigneeOptionLabelAr,
} from "./item59Labels.ts";

// 4 Oct item 59 — the owner approved three new fields on the lawyer screens.
// The headings are his words, verbatim.
test("the three headings are the owner's wording", () => {
  assert.equal(HEARING_DURATION_LABEL_AR, "مدة الجلسة");
  assert.equal(TASK_ASSIGNEE_LABEL_AR, "المحامي المُكلَّف");
  assert.equal(DOCUMENT_SOURCE_LABEL_AR, "مصدر المستند");
});

test("formatDurationAr: minutes only", () => {
  assert.equal(formatDurationAr(30), "٣٠ دقيقة");
  assert.equal(formatDurationAr(45), "٤٥ دقيقة");
  assert.equal(formatDurationAr(5), "٥ دقائق");
  assert.equal(formatDurationAr(10), "١٠ دقائق");
  assert.equal(formatDurationAr(2), "دقيقتان");
  assert.equal(formatDurationAr(1), "دقيقة");
});

test("formatDurationAr: whole hours", () => {
  assert.equal(formatDurationAr(60), "ساعة");
  assert.equal(formatDurationAr(120), "ساعتان");
  assert.equal(formatDurationAr(180), "٣ ساعات");
  assert.equal(formatDurationAr(600), "١٠ ساعات");
  assert.equal(formatDurationAr(660), "١١ ساعة");
});

test("formatDurationAr: hours and minutes, joined by «و»", () => {
  assert.equal(formatDurationAr(90), "ساعة و٣٠ دقيقة");
  assert.equal(formatDurationAr(150), "ساعتان و٣٠ دقيقة");
  assert.equal(formatDurationAr(65), "ساعة و٥ دقائق");
  assert.equal(formatDurationAr(61), "ساعة ودقيقة");
  assert.equal(formatDurationAr(200), "٣ ساعات و٢٠ دقيقة");
});

test("formatDurationAr: no duration is «—», never a zero or NaN", () => {
  assert.equal(formatDurationAr(null), "—");
  assert.equal(formatDurationAr(undefined), "—");
  assert.equal(formatDurationAr(0), "—");
  assert.equal(formatDurationAr(-30), "—");
  assert.equal(formatDurationAr(Number.NaN), "—");
  assert.equal(formatDurationAr(Number.POSITIVE_INFINITY), "—");
  assert.equal(formatDurationAr(0.4), "—");
});

test("formatDurationAr: a fractional minute count is rounded", () => {
  assert.equal(formatDurationAr(29.6), "٣٠ دقيقة");
  assert.equal(formatDurationAr(89.5), "ساعة و٣٠ دقيقة");
});

test("document source: the four values attachments.source allows", () => {
  assert.deepEqual(DOCUMENT_SOURCE_LABELS_AR, {
    upload: "رفع",
    generated: "مُنشأ",
    imported: "مستورد",
    contract_version: "نسخة عقد",
  });
  assert.equal(documentSourceLabelAr("upload"), "رفع");
  assert.equal(documentSourceLabelAr("generated"), "مُنشأ");
  assert.equal(documentSourceLabelAr("imported"), "مستورد");
  assert.equal(documentSourceLabelAr("contract_version"), "نسخة عقد");
});

test("document source: anything else is «—»", () => {
  assert.equal(documentSourceLabelAr(undefined), "—");
  assert.equal(documentSourceLabelAr(null), "—");
  assert.equal(documentSourceLabelAr(""), "—");
  assert.equal(documentSourceLabelAr("email"), "—");
  assert.equal(documentSourceLabelAr("UPLOAD"), "—");
  // Inherited object keys must not leak through a plain map lookup.
  assert.equal(documentSourceLabelAr("constructor"), "—");
  assert.equal(documentSourceLabelAr("__proto__"), "—");
  assert.equal(documentSourceLabelAr("toString"), "—");
  assert.equal(documentSourceLabelAr(42), "—");
});

test("assignee: the resolved name, or «—» when there is none", () => {
  assert.equal(assigneeLabelAr("أحمد الراشد"), "أحمد الراشد");
  assert.equal(assigneeLabelAr("  أحمد الراشد  "), "أحمد الراشد");
  assert.equal(assigneeLabelAr(null), "—");
  assert.equal(assigneeLabelAr(undefined), "—");
  assert.equal(assigneeLabelAr("   "), "—");
});

// ─── The «مدة الجلسة» select and its server check ────────────────────────────

test("the duration select offers the controller's five lengths, in his words", () => {
  assert.deepEqual([...HEARING_DURATION_OPTIONS], [30, 60, 90, 120, 180]);
  assert.deepEqual(HEARING_DURATION_OPTIONS.map(formatDurationAr), [
    "٣٠ دقيقة",
    "ساعة",
    "ساعة و٣٠ دقيقة",
    "ساعتان",
    "٣ ساعات",
  ]);
});

test("validateHearingDuration: null or absent means not set", () => {
  assert.deepEqual(validateHearingDuration(null), { ok: true, value: null });
  assert.deepEqual(validateHearingDuration(undefined), { ok: true, value: null });
});

test("validateHearingDuration: a whole number of minutes from 5 to 1440", () => {
  for (const n of [5, 30, 90, 180, 1440]) {
    assert.deepEqual(validateHearingDuration(n), { ok: true, value: n });
  }
});

test("validateHearingDuration: anything else is refused", () => {
  assert.equal(HEARING_DURATION_INVALID_AR, "مدة الجلسة غير صالحة");
  for (const bad of [0, 4, 1441, -30, 90.5, Number.NaN, Number.POSITIVE_INFINITY, "90", "", {}, [], true]) {
    assert.deepEqual(validateHearingDuration(bad), { ok: false, error: HEARING_DURATION_INVALID_AR }, String(bad));
  }
});

test("assignee picker option text: never an id", () => {
  assert.equal(assigneeOptionLabelAr({ name: "سارة العتيبي", isSelf: true }), "سارة العتيبي (أنا)");
  assert.equal(assigneeOptionLabelAr({ name: null, isSelf: true }), "أنا");
  assert.equal(assigneeOptionLabelAr({ name: " خالد ", isSelf: false }), "خالد");
  assert.equal(assigneeOptionLabelAr({ name: null, isSelf: false }), "عضو في المكتب");
  assert.equal(assigneeOptionLabelAr({ name: "  ", isSelf: false }), "عضو في المكتب");
});
