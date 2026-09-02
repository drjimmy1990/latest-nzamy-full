/**
 * arabicCount.ts — one counted-noun rule for the whole platform.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * The rule was already written correctly in this codebase. Three times, each
 * time private to one module:
 *
 *   activeCasesPhraseAr      src/lib/services/clientDashboardCards.ts
 *   vaultDocumentsPhraseAr   src/lib/services/businessOverview.ts
 *   (a third, in lawyerDirectory.ts, with its own test)
 *
 * All three carry the same paragraph of explanation and all three are right.
 * None of them is reachable from the lawyer dashboard, so that dashboard
 * invented its own agreement by concatenation, and the owner's screenshots
 * caught every branch of the rule being broken at once:
 *
 *   «٦ استشارة»       11-and-up form used for a 3–10 count   (shot 08)
 *   «0 جلسات مسجّلة»  plural used for zero                    (shot 22)
 *   «1 مستندات»       plural used for one                     (shot 23)
 *   «0 مجدولة»        Western zero in an Arabic heading       (shots 19, 24)
 *   «10 مستخدم»       singular used for a plural count        (shot 07)
 *   «3 مهمة / 6 جلسة / 2 قضية»  three at once in one KPI row  (shots 03, 06)
 *
 * A rule that lives in three private copies is a rule that the fourth screen
 * will get wrong. This is that rule, once, with the callers pointed at it —
 * the same move `hijri.ts` made after two Hijri implementations disagreed on
 * 674 of 730 days.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * Arabic has no singular/plural pair to switch on. A counted noun takes FIVE
 * shapes, and the one that surprises non-speakers is the last:
 *
 *     0          «لا مواعيد»        — no digit; a written ٠ reads as an error
 *     1          «موعد واحد»        — no digit; the noun carries the count
 *     2          «موعدان»           — the dual; no digit
 *     3 – 10     «٣ مواعيد»         — digit + PLURAL noun
 *     11 and up  «١١ موعداً»         — digit + SINGULAR noun (the tamyiz)
 *
 * The 11-and-up branch is why a naive `count === 1 ? noun : plural` is wrong
 * in Arabic and right in English. «١١ مواعيد» is a grammatical error; the
 * platform printed its mirror image, «٦ استشارة», which is the same error
 * from the other side.
 *
 * ── ZERO RETURNS null WHEN THE CALLER ASKS ──────────────────────────────────
 *
 * `zero: null` makes the whole phrase null so the caller can drop the sentence
 * rather than print a count of nothing. `activeCasesPhraseAr` established that
 * for a real reason: `GET /api/v1/documents` answers `200 {"data": []}` when
 * its query FAILS, so a zero can mean "empty" or "unreadable", and «٠ وثيقة»
 * asserts the first.
 *
 * ── VOCALIZATION ────────────────────────────────────────────────────────────
 *
 * Left unvocalized, matching the rest of the codebase. The tamyiz is strictly
 * accusative; on a ta marbuta that is a bare diacritic rather than a letter,
 * and half-vocalized UI copy reads worse to a Saudi user than none. Where the
 * accusative alif is part of the written skeleton the caller writes it into
 * `many` itself («موعداً»), which is why `many` is a string and not derived.
 */

/** ٠١٢٣٤٥٦٧٨٩ — Arabic-Indic digits, the numerals this product writes in. */
const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

/**
 * Every ASCII digit in `value` becomes its Arabic-Indic counterpart; every
 * other character is left exactly as it was.
 *
 * Deliberately tolerant of a whole string rather than only a number, because
 * the mixed-numeral defects the audit found are mixed WITHIN one line — a
 * «1.1 KB» beside a «٢٦ أغسطس ٢٠٢٦» — and those callers hold a formatted
 * string, not an integer.
 */
export function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/**
 * The five shapes of one counted noun.
 *
 * `zero`, `one` and `two` are COMPLETE phrases and carry no digit — Arabic
 * writes none for them. `few` and `many` are the noun alone; this module
 * prefixes the Arabic-Indic digit.
 */
export interface ArabicCountForms {
  /** «لا مواعيد». `null` makes the whole phrase null so the caller can omit it. */
  zero: string | null;
  /** «موعد واحد» / «قضية واحدة» — no digit. */
  one: string;
  /** «موعدان» / «قضيتان» — the dual, no digit. */
  two: string;
  /** «مواعيد» — the PLURAL noun, for 3–10. A digit is prefixed. */
  few: string;
  /** «موعد» — the SINGULAR noun, for 11 and up (the tamyiz). A digit is prefixed. */
  many: string;
}

/**
 * The counted-noun phrase for `count`, in Arabic-Indic digits.
 *
 * Returns `null` for a count that is not a finite number, so a caller handed
 * something unexpected renders nothing rather than «NaN مواعيد». A negative
 * count is treated as no count at all: it is not a state this product has, and
 * «‎-٣ مواعيد» would be a worse answer than silence.
 */
export function countPhraseAr(count: number, forms: ArabicCountForms): string | null {
  if (!Number.isFinite(count)) return null;
  const n = Math.floor(count);
  if (n <= 0) return forms.zero;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n <= 10) return `${toArabicDigits(n)} ${forms.few}`;
  return `${toArabicDigits(n)} ${forms.many}`;
}

/**
 * The same rule for a bare heading counter — «٠ مجدولة», «٣ مجدولة» — where
 * the screen wants the digit shown even at zero because it sits in a stat tile
 * whose whole job is to display a number.
 *
 * This is the ONE place a zero digit is correct, and it is correct because a
 * tile labelled «قادمة» over a «٠» is a table cell, not a sentence. Everything
 * that reads as a sentence must use `countPhraseAr` instead.
 */
export function countTileAr(count: number): string {
  if (!Number.isFinite(count)) return "—";
  return toArabicDigits(Math.max(0, Math.floor(count)));
}
