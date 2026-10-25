/**
 * refundPolicy.ts — the numbers of the refund policy, in one place, for the
 * /refund-policy page and the code (owner answers ١٨٠, ٢٤٦, ٢٨٨ and 26 Oct
 * 2026; pricing doc §13ج). The page builds its sentences from these
 * constants; refundPolicy.test.ts pins them to the code that acts on them
 * (refundDecision.ts) so the page and the admin refund screen cannot drift.
 *
 *   - instant cancel: within 90 minutes of payment, 0 points used, no export;
 *     the same window as refundDecision's VOID_WINDOW_MS (a Moyasar void
 *     works for about two hours; 90 minutes leaves a margin);
 *   - withdrawal: 14 days, at most 5 % of the points used, no full export;
 *   - scheduled consultations: full cancellation up to 24 hours before;
 *   - promotional / welcome points: valid 90 days;
 *   - paid top-up points, per pack (owner, 26 Oct): 500 SAR → 3 months,
 *     1,000 → 6 months, 2,500 / 5,000 / 10,000 → 12 months. TEXT ONLY: the
 *     packs themselves are built in P2 (the book still sells the old packs);
 *   - renewal reminders: 7 and 3 days before an automatic renewal (٢٨٨).
 *     TEXT ONLY: sending them is payments B2.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const INSTANT_CANCEL_MINUTES = 90;
export const WITHDRAWAL_DAYS = 14;
export const WITHDRAWAL_MAX_POINTS_USED_PCT = 5;
export const CONSULTATION_CANCEL_HOURS = 24;
export const PROMO_POINTS_VALIDITY_DAYS = 90;
export const RENEWAL_REMINDER_DAYS: readonly number[] = Object.freeze([7, 3]);

/** Paid top-up packs (SAR) → months their points stay valid (owner, 26 Oct 2026). */
export const TOPUP_VALIDITY_MONTHS: ReadonlyArray<{ readonly sar: number; readonly months: number }> = Object.freeze([
  Object.freeze({ sar: 500, months: 3 }),
  Object.freeze({ sar: 1000, months: 6 }),
  Object.freeze({ sar: 2500, months: 12 }),
  Object.freeze({ sar: 5000, months: 12 }),
  Object.freeze({ sar: 10000, months: 12 }),
]);

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** 1000 → «١٬٠٠٠» */
export function arNumber(n: number): string {
  return String(n)
    .replace(/\B(?=(\d{3})+(?!\d))/g, "٬")
    .replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

/** 1000 → "1,000" */
function enNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** «حزمة ٥٠٠ ر.س: ٣ أشهر؛ حزمة ١٬٠٠٠ ر.س: ٦ أشهر؛ حزم ٢٬٥٠٠ و٥٬٠٠٠ و١٠٬٠٠٠ ر.س: ١٢ شهراً» */
export function topupValidityAr(): string {
  const byMonths = new Map<number, number[]>();
  for (const { sar, months } of TOPUP_VALIDITY_MONTHS) byMonths.set(months, [...(byMonths.get(months) ?? []), sar]);
  const parts: string[] = [];
  for (const [months, packs] of byMonths) {
    const label = months === 12 ? `${arNumber(12)} شهراً` : `${arNumber(months)} أشهر`;
    const names = packs.map(arNumber);
    const head = packs.length === 1 ? `حزمة ${names[0]}` : `حزم ${names.slice(0, -1).join(" و")} و${names.at(-1)}`;
    parts.push(`${head} ر.س: ${label}`);
  }
  return parts.join("؛ ");
}

/** "SAR 500: 3 months; SAR 1,000: 6 months; SAR 2,500, 5,000 and 10,000: 12 months" */
export function topupValidityEn(): string {
  const byMonths = new Map<number, number[]>();
  for (const { sar, months } of TOPUP_VALIDITY_MONTHS) byMonths.set(months, [...(byMonths.get(months) ?? []), sar]);
  const parts: string[] = [];
  for (const [months, packs] of byMonths) {
    const names = packs.map(enNumber);
    const head = packs.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    parts.push(`SAR ${head}: ${months} months`);
  }
  return parts.join("; ");
}

/** The reminder days as Arabic text: «٧ أيام» و«٣ أيام». */
export function renewalRemindersAr(): string {
  const [first, second] = RENEWAL_REMINDER_DAYS;
  return `تذكيراً أول قبل ${arNumber(first)} أيام، وتذكيراً ثانياً قبل ${arNumber(second)} أيام من موعد التجديد`;
}
