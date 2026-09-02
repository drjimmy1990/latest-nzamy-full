import test from "node:test";
import assert from "node:assert/strict";

import { countPhraseAr, countTileAr, toArabicDigits, type ArabicCountForms } from "./arabicCount.ts";

/** «موعد» — the noun the owner's screenshots got wrong in four places. */
const APPOINTMENTS: ArabicCountForms = {
  zero: "لا مواعيد مجدولة",
  one: "موعد واحد",
  two: "موعدان",
  few: "مواعيد",
  many: "موعداً",
};

test("toArabicDigits converts digits and nothing else", () => {
  assert.equal(toArabicDigits(0), "٠");
  assert.equal(toArabicDigits(1448), "١٤٤٨");
  assert.equal(toArabicDigits("1.1 KB"), "١.١ KB");
  assert.equal(toArabicDigits("٢٦ أغسطس"), "٢٦ أغسطس");
  assert.equal(toArabicDigits("بدون أرقام"), "بدون أرقام");
});

test("the five branches of Arabic number agreement", () => {
  assert.equal(countPhraseAr(0, APPOINTMENTS), "لا مواعيد مجدولة");
  assert.equal(countPhraseAr(1, APPOINTMENTS), "موعد واحد");
  assert.equal(countPhraseAr(2, APPOINTMENTS), "موعدان");
  assert.equal(countPhraseAr(3, APPOINTMENTS), "٣ مواعيد");
  assert.equal(countPhraseAr(10, APPOINTMENTS), "١٠ مواعيد");
  assert.equal(countPhraseAr(11, APPOINTMENTS), "١١ موعداً");
});

test("no digit is written for 0, 1 or 2", () => {
  // Arabic writes none, and a printed «٠»/«١»/«٢» beside the noun is the
  // signature of a naive English-shaped plural rule.
  for (const n of [0, 1, 2]) {
    const phrase = countPhraseAr(n, APPOINTMENTS);
    assert.ok(phrase !== null);
    assert.doesNotMatch(phrase, /[٠-٩0-9]/, `${n} must carry no digit, got «${phrase}»`);
  }
});

test("11 and up take the SINGULAR — the tamyiz, not the plural", () => {
  // This is the branch a `count === 1 ? noun : plural` rule gets wrong, and
  // the one the platform inverted as «٦ استشارة».
  assert.equal(countPhraseAr(11, APPOINTMENTS), "١١ موعداً");
  assert.equal(countPhraseAr(99, APPOINTMENTS), "٩٩ موعداً");
  for (const n of [11, 25, 100]) {
    assert.ok(!countPhraseAr(n, APPOINTMENTS)!.includes(APPOINTMENTS.few));
  }
  // …while 3–10 take the plural, which is the mirror error.
  for (const n of [3, 7, 10]) {
    assert.ok(!countPhraseAr(n, APPOINTMENTS)!.includes(APPOINTMENTS.many));
  }
});

test("the exact strings the owner's screenshots showed are no longer producible", () => {
  // shot 08 «٦ استشارة» — 6 must take the plural.
  const consultations: ArabicCountForms = {
    zero: "لا استشارات", one: "استشارة واحدة", two: "استشارتان",
    few: "استشارات", many: "استشارة",
  };
  assert.equal(countPhraseAr(6, consultations), "٦ استشارات");

  // shot 22 «0 جلسات مسجّلة» — zero takes no digit and no plural.
  const hearings: ArabicCountForms = {
    zero: "لا جلسات مسجّلة", one: "جلسة واحدة مسجّلة", two: "جلستان مسجّلتان",
    few: "جلسات مسجّلة", many: "جلسة مسجّلة",
  };
  assert.equal(countPhraseAr(0, hearings), "لا جلسات مسجّلة");

  // shot 23 «1 مستندات» — one takes the singular and no digit.
  const documents: ArabicCountForms = {
    zero: "لا مستندات", one: "مستند واحد", two: "مستندان",
    few: "مستندات", many: "مستنداً",
  };
  assert.equal(countPhraseAr(1, documents), "مستند واحد");

  // shot 07 «10 مستخدم» — 10 takes the plural, in Arabic-Indic digits.
  const users: ArabicCountForms = {
    zero: "لا مستخدمين", one: "مستخدم واحد", two: "مستخدمان",
    few: "مستخدمين", many: "مستخدماً",
  };
  assert.equal(countPhraseAr(10, users), "١٠ مستخدمين");
});

test("zero: null lets the caller drop the sentence entirely", () => {
  // The reason is in the docblock and it is not stylistic: a route that
  // answers 200 with an empty array on failure makes «٠» an assertion the
  // caller cannot support.
  const optional: ArabicCountForms = { ...APPOINTMENTS, zero: null };
  assert.equal(countPhraseAr(0, optional), null);
  assert.equal(countPhraseAr(1, optional), "موعد واحد");
});

test("non-numbers render nothing rather than NaN", () => {
  assert.equal(countPhraseAr(Number.NaN, APPOINTMENTS), null);
  assert.equal(countPhraseAr(Number.POSITIVE_INFINITY, APPOINTMENTS), null);
  // A negative count is not a state this product has; it must not print.
  assert.equal(countPhraseAr(-3, APPOINTMENTS), APPOINTMENTS.zero);
});

test("a fractional count floors rather than rounding up", () => {
  // 2.9 items is 2 items; rounding up would report one the user cannot open.
  assert.equal(countPhraseAr(2.9, APPOINTMENTS), "موعدان");
  assert.equal(countPhraseAr(10.9, APPOINTMENTS), "١٠ مواعيد");
});

test("countTileAr is the one place a zero digit is right", () => {
  // A stat tile is a table cell, not a sentence.
  assert.equal(countTileAr(0), "٠");
  assert.equal(countTileAr(17), "١٧");
  assert.equal(countTileAr(-4), "٠");
  assert.equal(countTileAr(Number.NaN), "—");
});
