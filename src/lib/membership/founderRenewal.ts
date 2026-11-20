/**
 * founderRenewal.ts — the founder membership's renewal (owner register 14
 * items 28 / 32 / 55; /founder-terms clause ٤: «التجديد بالسعر المعلن وقتها
 * ويُعلن قبل نهاية السنة بـ60 يوماً»; clause ٥: the founder's 15 % applies to
 * his own renewal while his yearly subscription is active). Batch l11 pay.
 *
 * What is built (no renewal is due before November 2027):
 *   - the admin setting platform_settings.founder_renewal (20261201_20):
 *       {"enabled": boolean, "price_sar": SAR before VAT | null}
 *     OFF and no price by default. No price is ever invented: without a
 *     price the renewal is not offered and nothing is announced
 *     (founderRenewalOffered). Admin writes go through founderRenewalIssue;
 *   - the price a founder member would pay: the announced price less the
 *     founder discount (founder_topup_discount_bps, 15 %), VAT on the rest
 *     (founderRenewalQuote) — one discount only, nothing stacks;
 *   - the 60-day notice: which active seats' membership year ends within
 *     FOUNDER_RENEWAL_NOTICE_DAYS (seatsDueForRenewalNotice), and its Arabic
 *     in-app and e-mail text. POST /api/v1/cron/founder-renewal-notice sends
 *     it once per seat and year (public.founder_renewal_notices).
 *
 * NOT built (reported): the renewal as a product to pay for at /checkout and
 * its fulfilment (what a renewal grants — the next year's library, the
 * drafting works, the 100 points, the discount window — is not decided:
 * owner question ٨٢). The notice therefore announces the price; it does not
 * link to a payment.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { applyDiscount, type DiscountedQuote } from "../payments/couponRules.ts";
import { formatHalalas } from "../payments/catalog.ts";
import { addMonthsUtc, founderDiscountHalalas, FOUNDER_DISCOUNT_DEFAULT_BPS } from "../payments/founderDiscount.ts";
import { billingDateAr } from "../payments/billingView.ts";
import { FOUNDER_MEMBERSHIP_MONTHS } from "./founderPlan.ts";

/** platform_settings key (20261201_20). */
export const FOUNDER_RENEWAL_KEY = "founder_renewal";
/** Clause ٤: the renewal price is announced 60 days before the membership year ends. */
export const FOUNDER_RENEWAL_NOTICE_DAYS = 60;
/** The highest price the admin may enter (SAR before VAT) — a typo guard. */
export const FOUNDER_RENEWAL_MAX_SAR = 100_000;
/** Where the notice points: the member's billing page (no renewal is sold online yet). */
export const FOUNDER_RENEWAL_HREF = "/dashboard/billing";

export interface FounderRenewalSetting {
  enabled: boolean;
  /** Halalas before VAT, or null (not announced). */
  priceHalalas: number | null;
}

export const FOUNDER_RENEWAL_OFF: FounderRenewalSetting = Object.freeze({ enabled: false, priceHalalas: null }) as FounderRenewalSetting;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPrice = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= FOUNDER_RENEWAL_MAX_SAR;

export const FOUNDER_RENEWAL_SHAPE_AR =
  'قيمة founder_renewal يجب أن تكون {"enabled": true أو false, "price_sar": سعر التجديد بالريال قبل الضريبة (عدد صحيح من 1 إلى 100000) أو null}';
export const FOUNDER_RENEWAL_NEEDS_PRICE_AR = "لا يُفعَّل تجديد باقة المؤسس قبل تحديد سعر التجديد";

/** Admin write check for founder_renewal; null when acceptable. */
export function founderRenewalIssue(value: unknown): string | null {
  if (!isObject(value)) return FOUNDER_RENEWAL_SHAPE_AR;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "enabled" || keys[1] !== "price_sar") return FOUNDER_RENEWAL_SHAPE_AR;
  if (typeof value.enabled !== "boolean") return FOUNDER_RENEWAL_SHAPE_AR;
  if (value.price_sar !== null && !isPrice(value.price_sar)) return FOUNDER_RENEWAL_SHAPE_AR;
  if (value.enabled && value.price_sar === null) return FOUNDER_RENEWAL_NEEDS_PRICE_AR;
  return null;
}

/** The stored value; anything absent or malformed is OFF with no price (never a guessed price). */
export function parseFounderRenewal(value: unknown): FounderRenewalSetting {
  if (!isObject(value) || typeof value.enabled !== "boolean") return { ...FOUNDER_RENEWAL_OFF };
  const price = isPrice(value.price_sar) ? value.price_sar * 100 : null;
  return { enabled: value.enabled && price !== null, priceHalalas: price };
}

/** Offered (and announced) only when switched on WITH a price. */
export function founderRenewalOffered(s: FounderRenewalSetting): s is { enabled: true; priceHalalas: number } {
  return s.enabled && typeof s.priceHalalas === "number" && s.priceHalalas > 0;
}

/**
 * What a founder member pays for his renewal: the announced price less the
 * founder discount (register 55; the rate is founder_topup_discount_bps),
 * VAT recomputed on the rest. One discount only — no coupon is taken on the
 * founder membership (checkoutCore step 0), so nothing else competes.
 */
export function founderRenewalQuote(priceHalalas: number, bps: number = FOUNDER_DISCOUNT_DEFAULT_BPS): DiscountedQuote {
  return applyDiscount(priceHalalas, founderDiscountHalalas(priceHalalas, bps));
}

// ── the 60-day notice ───────────────────────────────────────────────────────

export interface RenewalSeat {
  id: string;
  user_id: string;
  activated_at?: string | null;
  ends_at?: string | null;
}

/** When the seat's membership year ends: ends_at, else activated_at + 12 months; null when neither is readable. */
export function membershipEndsAt(seat: Pick<RenewalSeat, "activated_at" | "ends_at">): Date | null {
  const ends = seat.ends_at ? Date.parse(seat.ends_at) : NaN;
  if (Number.isFinite(ends)) return new Date(ends);
  const activated = seat.activated_at ? Date.parse(seat.activated_at) : NaN;
  if (Number.isFinite(activated)) return addMonthsUtc(new Date(activated), FOUNDER_MEMBERSHIP_MONTHS);
  return null;
}

/** The seats whose membership year ends after `now` and within the notice window, with that end. */
export function seatsDueForRenewalNotice(
  seats: readonly RenewalSeat[],
  now: Date,
  days: number = FOUNDER_RENEWAL_NOTICE_DAYS,
): Array<{ seat: RenewalSeat; endsAt: Date }> {
  const from = now.getTime();
  const to = from + days * 86_400_000;
  const out: Array<{ seat: RenewalSeat; endsAt: Date }> = [];
  for (const seat of seats) {
    if (typeof seat.id !== "string" || typeof seat.user_id !== "string") continue;
    const endsAt = membershipEndsAt(seat);
    if (endsAt && endsAt.getTime() > from && endsAt.getTime() <= to) out.push({ seat, endsAt });
  }
  return out;
}

const pctAr = (bps: number) => (bps / 100).toLocaleString("ar-SA-u-nu-arab", { maximumFractionDigits: 2 });

/** The in-app notice (clause ٤ + ٥): the announced price, the founder's price, the year's end. */
export function renewalNoticeAr(input: { endsAt: Date; priceHalalas: number; bps: number }): { title: string; body: string; href: string } {
  const q = founderRenewalQuote(input.priceHalalas, input.bps);
  const end = billingDateAr(input.endsAt.toISOString());
  const discount =
    q.discountHalalas > 0
      ? ` ولك بصفتك عضواً مؤسساً خصم ${pctAr(input.bps)}٪ ما دام اشتراكك سارياً وقت التجديد، فيصبح ${formatHalalas(q.netHalalas)} قبل الضريبة (${formatHalalas(q.totalHalalas)} شاملة الضريبة).`
      : "";
  return {
    title: "سعر تجديد باقة المحامي المؤسس",
    body: `تنتهي سنة عضويتك في باقة المحامي المؤسس في ${end}. سعر التجديد للسنة التالية ${formatHalalas(input.priceHalalas)} قبل الضريبة.${discount} وإذا لم تجدّد فقدت خصم المؤسس نهائياً.`,
    href: FOUNDER_RENEWAL_HREF,
  };
}

/** The e-mail of the same notice (sendEmail + renderEmailAr). */
export function renewalEmailAr(input: { endsAt: Date; priceHalalas: number; bps: number; siteOrigin: string | null }) {
  const n = renewalNoticeAr(input);
  const href = input.siteOrigin && /^https:\/\//.test(input.siteOrigin) ? `${input.siteOrigin.replace(/\/+$/, "")}${n.href}` : null;
  return {
    subject: n.title,
    heading: n.title,
    paragraphs: [n.body],
    action: href ? { label: "الفواتير والاشتراك", href } : null,
    footer: ["وصلتك هذه الرسالة لأنك عضو مؤسس في نظامي، ويُعلَن سعر التجديد قبل نهاية سنة العضوية بستين يوماً بحسب شروط باقة المؤسس."],
  };
}
