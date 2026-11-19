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
 *   - withdrawal (batch l8, owner 18 Nov items 1.2 and ٦٤): 14 days; the
 *     founder plan, the library, the bundles and the other subscriptions
 *     only when no AI feature was used (the founder plan's text is
 *     /founder-terms item ٧ word for word); a point top-up when at most 5 %
 *     of its own points was used. refundEligibility.ts checks the same.
 *     Batch l9 (owner register 14 items 16 / 44): where the plan includes the
 *     library, also no more than LIBRARY_REFUND_MAX_FULL_TEXTS (5) files read
 *     in full text — counted on the server only, never shown to the client
 *     (the count and its enforcement belong to the library reader's log);
 *     and the individuals' AI plan (ind-ai) says plainly that it has no
 *     refund in practice: it is AI tools only;
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
import { FOUNDER_REFUND_CLAUSE } from "../founder/founderTerms.ts";

export const INSTANT_CANCEL_MINUTES = 90;
export const WITHDRAWAL_DAYS = 14;
/** l9 (register 16 / 44): a plan that includes the library is refundable only with at most this many files read in full text. */
export const LIBRARY_REFUND_MAX_FULL_TEXTS = 5;
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
 * On since batch l8 (owner ٥٠, 18 Nov 2026): the page says what checkout does
 * — an upgrade from a lower PAID plan has the remaining value of that plan
 * deducted from the new price AT the upgrade (upgradeProration.ts, l6-pay),
 * and buying a lower plan while a higher one runs is refused
 * (UPGRADE_DOWNGRADE_AR). Nothing is carried to a "next invoice".
 */
export const SHOW_UPGRADE_PRORATION = true;
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

/** ٥٠ (l8): the remaining value is deducted AT the upgrade; a downgrade is refused while the higher plan runs. */
export function upgradeProrationLinesAr(show: boolean = SHOW_UPGRADE_PRORATION): string[] {
  return show
    ? [
        "**الترقية إلى باقة أعلى**: يُخصم المتبقي من قيمة باقتك الحالية المدفوعة من سعر الباقة الجديدة لحظة الترقية، بحسب الأيام المتبقية منها، فتدفع الفرق وحده ولا يُرد المتبقي نقداً. ولا يمكن شراء باقة أدنى ما دامت باقة أعلى سارية.",
      ]
    : [];
}

export function upgradeProrationLinesEn(show: boolean = SHOW_UPGRADE_PRORATION): string[] {
  return show
    ? [
        "**Upgrading to a higher plan**: the remaining value of your current paid plan, by the days left on it, is deducted from the new plan's price at the moment of the upgrade, so you pay only the difference; the remainder is not refunded in cash. A lower plan cannot be bought while a higher one is running.",
      ]
    : [];
}

// ── the refund rules per product (batch l8: owner 18 Nov, items 1.2 and ٦٤) ──

/**
 * The founder plan's refund text is ONE text: FOUNDER_REFUND_CLAUSE of
 * /founder-terms (item ٧), shown word for word on /refund-policy too.
 */
export const FOUNDER_REFUND_LINE_AR = `**باقة المحامي المؤسس**: ${FOUNDER_REFUND_CLAUSE}`;
export const FOUNDER_REFUND_LINE_EN =
  `**The founding lawyer plan**: you may get a refund within **${WITHDRAWAL_DAYS} days** of purchase provided **you have not used any AI feature of the plan**: the legal drafter, the professional tools, or the library's smart assistant and points, **and you have not read more than ${LIBRARY_REFUND_MAX_FULL_TEXTS} files in full text in the legal library**. Ordinary browsing of the legal library within these limits does not prevent a refund. The full amount, VAT included, is returned to the same payment method with no fee deducted, and a credit note is issued. Your card issuer decides how long the amount takes to appear in your account.`;

/**
 * ٦٤: the library, the bundles and every other digital subscription follow
 * the founder's rule; l9 (register 16): where the subscription includes the
 * library, no more than 5 files read in full text either.
 */
export const SUBSCRIPTION_REFUND_LINE_AR =
  `**اشتراك المكتبة القانونية والباقات المدمجة وسائر الاشتراكات الرقمية**: القاعدة نفسها وفق نظام التجارة الإلكترونية ولائحته، فيحق لك الاسترداد خلال (${arNumber(WITHDRAWAL_DAYS)}) يوماً من الشراء بشرط ألا تكون قد استخدمت أي ميزة ذكاء اصطناعي في الاشتراك، ومنها مساعد المكتبة الذكي ونقاطه، وألا تكون قد قرأت أكثر من (${arNumber(LIBRARY_REFUND_MAX_FULL_TEXTS)}) ملفات نصاً كاملاً في المكتبة القانونية إن كان الاشتراك يشمل المكتبة. ولا يمنع الاسترداد تصفح المكتبة القانونية العادية في هذه الحدود، ويُردّ المبلغ كاملاً شاملاً ضريبة القيمة المضافة.`;
export const SUBSCRIPTION_REFUND_LINE_EN =
  `**The legal library, the bundles and every other digital subscription**: the same rule, under the E-Commerce Law and its Regulation — you may get a refund within (${WITHDRAWAL_DAYS}) days of purchase provided you have not used any AI feature of the subscription, including the library's smart assistant and its points, and, where the subscription includes the library, you have not read more than (${LIBRARY_REFUND_MAX_FULL_TEXTS}) files in full text in the legal library. Ordinary browsing of the legal library within these limits does not prevent a refund, and the full amount is returned, VAT included.`;

/** l9 (register 16): the individuals' AI plan is AI tools only — no refund in practice, said plainly. */
export const IND_AI_REFUND_LINE_AR =
  "**الباقة الذكية للأفراد**: لا استرداد لها فعلياً، لأنها كلها أدوات ذكاء اصطناعي، واستعمال أي أداة منها يُسقط حق الاسترداد وفق القاعدة السابقة.";
export const IND_AI_REFUND_LINE_EN =
  "**The individuals' smart (AI) plan**: in practice it has no refund, because it consists entirely of AI tools, and using any of them ends the right to a refund under the rule above.";

/** ٦٤: the 5 % rule now belongs to point top-ups alone, measured on that top-up's own points. */
export const TOPUP_REFUND_LINE_AR =
  `**شحن النقاط**: يحق لك الاسترداد خلال (${arNumber(WITHDRAWAL_DAYS)}) يوماً من الشراء بشرط ألا يتجاوز ما استُخدم من نقاط الشحنة نفسها ${arNumber(WITHDRAWAL_MAX_POINTS_USED_PCT)}٪ منها.`;
export const TOPUP_REFUND_LINE_EN =
  `**Point top-ups**: you may get a refund within (${WITHDRAWAL_DAYS}) days of purchase provided no more than ${WITHDRAWAL_MAX_POINTS_USED_PCT}% of that top-up's own points has been used.`;

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
