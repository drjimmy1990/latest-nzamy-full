/**
 * refundPolicy.ts — the numbers of the refund policy, in one place, for the
 * /refund-policy page and the code (owner answers ١٨٠, ٢٤٦, ٢٨٨ and 26 Oct
 * 2026; pricing doc §13ج). The page builds its sentences from these
 * constants; refundPolicy.test.ts pins them to the code that acts on them
 * (refundDecision.ts, the price book) so the page, checkout and the admin
 * refund screen cannot drift.
 *
 *   - instant cancel: within 90 minutes of payment, 0 points used, no export;
 *     the same window as refundDecision's VOID_WINDOW_MS (a Moyasar void
 *     works for about two hours; 90 minutes leaves a margin). There is no
 *     self-service button: the buyer asks support, and an admin voids it from
 *     the orders page — the page says «تُطلب من الدعم»;
 *   - withdrawal: 14 days, at most 5 % of the points used, no full export;
 *   - scheduled consultations: full cancellation up to 24 hours before;
 *   - paid top-up points: valid per pack AS THE PRICE BOOK SELLS THEM
 *     (P7 review, finding 3) — the sentence is built from the book's on-sale
 *     top-ups (priceBook.ts pointsValidityMonths), so it states what checkout
 *     sells today (100 / 250 → 3 months, 500 → 6, 1,000 → 12) and follows P2
 *     when it brings the owner's 26-Oct packs (500 → 3, 1,000 → 6,
 *     2,500 / 5,000 / 10,000 → 12);
 *   - NOT SHOWN until they are true (flags below, off):
 *       promotional / welcome points valid 90 days — nothing expires them yet;
 *       renewal reminders 7 and 3 days before an automatic renewal (٢٨٨) —
 *       sending them is payments B2.
 *     Turning a flag on is the only change the page needs once the feature
 *     exists.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { isOnSale, PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";

export const INSTANT_CANCEL_MINUTES = 90;
export const WITHDRAWAL_DAYS = 14;
export const WITHDRAWAL_MAX_POINTS_USED_PCT = 5;
export const CONSULTATION_CANCEL_HOURS = 24;
export const PROMO_POINTS_VALIDITY_DAYS = 90;
export const RENEWAL_REMINDER_DAYS: readonly number[] = Object.freeze([7, 3]);

/**
 * Off: no subscription renews automatically today. The grant writes
 * auto_renew = false (grant_plan_subscription, 20261025_10) and nothing
 * charges a saved card at the period's end — the plan simply ends, and the
 * subscriber buys again if he wants to. Payments B2 builds the renewal, the
 * reminders AND a cancel control; only then is this flag turned on.
 */
export const SUBSCRIPTIONS_AUTO_RENEW = false;
/**
 * Off: an upgrade is not pro-rated today. A higher plan starts now at its own
 * price (fulfillDecision.ts: "pro-rata is B2"), and with no renewal there is
 * no "next invoice" to carry a difference. Shown once B2 builds it.
 */
export const SHOW_UPGRADE_PRORATION = false;
/** Off until B2 sends the two renewal reminders (owner ٢٨٨). */
export const SHOW_RENEWAL_REMINDERS = false;
/** Off until something expires promotional / welcome points after 90 days. */
export const SHOW_PROMO_POINTS_VALIDITY = false;

/** The book's on-sale top-up packs (SAR) → months their points stay valid, cheapest first. */
export function topupValidityMonths(
  book: Readonly<Record<string, BookEntry>> = PRICE_BOOK,
): ReadonlyArray<{ readonly sar: number; readonly months: number }> {
  const out: Array<{ sar: number; months: number }> = [];
  for (const entry of Object.values(book)) {
    if (entry.kind !== "topup" || !isOnSale(entry)) continue;
    const sar = entry.prices.once?.sar;
    const months = entry.pointsValidityMonths;
    if (typeof sar !== "number" || typeof months !== "number" || months <= 0) continue;
    out.push({ sar, months });
  }
  return out.sort((a, b) => a.sar - b.sar);
}

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

/** Arabic counting of months: شهر واحد، شهران، ٣–١٠ أشهر، ١١ فما فوق شهراً. */
export function monthsAr(n: number): string {
  if (n === 1) return "شهر واحد";
  if (n === 2) return "شهران";
  if (n >= 3 && n <= 10) return `${arNumber(n)} أشهر`;
  return `${arNumber(n)} شهراً`;
}

function byMonths(book?: Readonly<Record<string, BookEntry>>): Map<number, number[]> {
  const grouped = new Map<number, number[]>();
  for (const { sar, months } of topupValidityMonths(book)) grouped.set(months, [...(grouped.get(months) ?? []), sar]);
  return grouped;
}

/** «حزمتا ١٠٠ و٢٥٠ ر.س: ٣ أشهر؛ حزمة ٥٠٠ ر.س: ٦ أشهر؛ حزمة ١٬٠٠٠ ر.س: ١٢ شهراً» — from the book. */
export function topupValidityAr(book?: Readonly<Record<string, BookEntry>>): string {
  const parts: string[] = [];
  for (const [months, packs] of byMonths(book)) {
    const names = packs.map(arNumber);
    const head =
      packs.length === 1
        ? `حزمة ${names[0]}`
        : packs.length === 2
          ? `حزمتا ${names[0]} و${names[1]}`
          : `حزم ${names.slice(0, -1).join(" و")} و${names.at(-1)}`;
    parts.push(`${head} ر.س: ${monthsAr(months)}`);
  }
  return parts.join("؛ ");
}

/** "SAR 100 and 250: 3 months; SAR 500: 6 months; SAR 1,000: 12 months" — from the book. */
export function topupValidityEn(book?: Readonly<Record<string, BookEntry>>): string {
  const parts: string[] = [];
  for (const [months, packs] of byMonths(book)) {
    const names = packs.map(enNumber);
    const head = packs.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    parts.push(`SAR ${head}: ${months === 1 ? "1 month" : `${months} months`}`);
  }
  return parts.join("; ");
}

/** The reminder days as Arabic text: «٧ أيام» و«٣ أيام». */
export function renewalRemindersAr(): string {
  const [first, second] = RENEWAL_REMINDER_DAYS;
  return `تذكيراً أول قبل ${arNumber(first)} أيام، وتذكيراً ثانياً قبل ${arNumber(second)} أيام من موعد التجديد`;
}

// ── the lines the page shows only while true (spread into section ٣) ──────

/** Section ٣, after the withdrawal period: what happens at the end of a paid period. */
export function afterWithdrawalLineAr(autoRenew: boolean = SUBSCRIPTIONS_AUTO_RENEW): string {
  return autoRenew
    ? "بعد انقضاء مدة العدول: يمكن إلغاء التجديد التلقائي في أي وقت من إعدادات الحساب، ويستمر الوصول للخدمة حتى نهاية الفترة المدفوعة بالفعل دون استرداد جزئي عن الفترة المتبقية."
    : "بعد انقضاء مدة العدول: لا تتجدد الاشتراكات تلقائياً حالياً — ينتهي الاشتراك بنهاية الفترة المدفوعة ولا يُخصم منك أي مبلغ بعدها إلا إذا اشتريت اشتراكاً جديداً بنفسك، فلا يلزمك إلغاء شيء لإيقافه. ويستمر الوصول للخدمة حتى نهاية الفترة المدفوعة بالفعل دون استرداد جزئي عن الفترة المتبقية.";
}

export function afterWithdrawalLineEn(autoRenew: boolean = SUBSCRIPTIONS_AUTO_RENEW): string {
  return autoRenew
    ? "After the withdrawal period ends: automatic renewal can be cancelled at any time from account settings, and access continues until the end of the period already paid for, with no partial refund for the remaining period."
    : "After the withdrawal period ends: subscriptions do not renew automatically today — a subscription ends with the period paid for and nothing is charged after it unless you buy a new one yourself, so there is nothing to cancel to stop it. Access continues until the end of the period already paid for, with no partial refund for the remaining period.";
}

export function renewalReminderLinesAr(show: boolean = SHOW_RENEWAL_REMINDERS): string[] {
  return show ? [`**تذكير التجديد**: قبل أي تجديد تلقائي لاشتراك نرسل لك ${renewalRemindersAr()}، لتتمكن من إلغائه قبل الخصم.`] : [];
}

export function renewalReminderLinesEn(show: boolean = SHOW_RENEWAL_REMINDERS): string[] {
  return show
    ? [
        `**Renewal reminders**: before any automatic renewal of a subscription we send you a first reminder ${RENEWAL_REMINDER_DAYS[0]} days and a second reminder ${RENEWAL_REMINDER_DAYS[1]} days before the renewal date, so you can cancel it before you are charged.`,
      ]
    : [];
}

export function upgradeProrationLinesAr(show: boolean = SHOW_UPGRADE_PRORATION): string[] {
  return show ? ["الترقية بين الباقات لا تستوجب رسوم استرداد؛ يُحتسب فرق السعر تناسبياً على الفاتورة التالية."] : [];
}

export function upgradeProrationLinesEn(show: boolean = SHOW_UPGRADE_PRORATION): string[] {
  return show ? ["Upgrading between plans does not require a refund; the price difference is pro-rated on the next invoice."] : [];
}

export function promoPointsLinesAr(show: boolean = SHOW_PROMO_POINTS_VALIDITY): string[] {
  return show
    ? [`**صلاحية النقاط الترويجية**: النقاط الترحيبية والترويجية المجانية صالحة (${arNumber(PROMO_POINTS_VALIDITY_DAYS)}) يوماً من تاريخ منحها.`]
    : [];
}

export function promoPointsLinesEn(show: boolean = SHOW_PROMO_POINTS_VALIDITY): string[] {
  return show
    ? [`**Promotional points**: welcome and promotional points granted free of charge are valid for (${PROMO_POINTS_VALIDITY_DAYS}) days from the day they are granted.`]
    : [];
}
