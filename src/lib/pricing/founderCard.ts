/**
 * founderCard.ts — the pure half of the lawyer founder card on /pricing
 * (P3 Task 8): its copy, the price line, the seat line, whether the section
 * renders, and what its button does for whoever is looking (`founderCta`).
 *
 * The owner's campaign links to
 *   /pricing?audience=lawyers&campaign=founder-2026#founder-plan
 * The URL's `campaign` is compared with FOUNDER_CAMPAIGN_ID ("founder-2026"),
 * never with the `founder-<starts_on>` id founderCampaignFromSetting builds
 * for the banner's dismissal key.
 *
 * The card promises only what founder_activate grants (global constraints):
 * the drafter works, the one independent output (direction support
 * «قريبًا»), the library for 12 months, office management «قريبًا». The price
 * and its VAT breakdown come from quote(), never a typed number; the end date
 * is the setting's ends_on, served by GET /api/v1/campaigns/active.
 *
 * Pure: relative imports only, so `node --test` loads it (founderCard.test.ts).
 */

import { formatHalalas, quote, PAYABLE_ITEMS, type PayableItem } from "../payments/catalog.ts";
import { checkoutHref, gatewayAllowsCheckout, SALE_PAUSED_LINE_AR, saleGatewayPaused } from "../payments/checkoutView.ts";
import {
  FOUNDER_CAMPAIGN_ID,
  FOUNDER_CREDITS,
  FOUNDER_MEMBERSHIP_MONTHS,
  FOUNDER_PLAN_ID,
} from "../membership/founderPlan.ts";
import { toArabicDigits } from "../services/arabicCount.ts";
import { libraryEndsAtAr } from "../libraryAccess.ts";
import { USER_TYPE_TO_AUDIENCE } from "./audienceForUserType.ts";
import { isCalendarDay } from "./campaigns.ts";
import type { AudienceTab } from "../../constants/pricing/pricing.types.ts";

// ── the copy ────────────────────────────────────────────────────────────────

/** The card's id: the campaign link's `#founder-plan`. */
export const FOUNDER_PLAN_ANCHOR = "founder-plan";

export const FOUNDER_CARD_TITLE = "باقة المحامي المؤسس";

const MONTHS = toArabicDigits(FOUNDER_MEMBERSHIP_MONTHS);

export const FOUNDER_TERM_LINE = `للسنة الأولى، ${MONTHS} شهرًا من التفعيل`;

export const FOUNDER_BENEFITS: readonly string[] = Object.freeze([
  `${toArabicDigits(FOUNDER_CREDITS.drafting_work)} أعمال بالصائغ القانوني (يمكن تكرار النوع)`,
  `المكتبة القانونية ${MONTHS} شهرًا`,
  "إدارة المكتب: قريبًا — ضمن مدة العضوية المحسوبة من التفعيل",
]);

export const FOUNDER_FINE_PRINT = "لا يُعدّ سعر السنة الأولى سعر تجديد ثابتًا";

/** Shown instead of a dead anchor when the campaign link arrives after the sale closed. */
export const FOUNDER_CLOSED_TEXT = "انتهت حملة المؤسس أو اكتملت مقاعدها";
/** Before the opening day (founderWindow.state "pre"): not "ended". */
export const FOUNDER_PRE_TEXT = "لم تُفتح حملة المحامي المؤسس بعد، وموعد افتتاحها في صفحة الحملة";

/**
 * R31: shown instead of FOUNDER_CLOSED_TEXT when the admin paused the sale
 * («إيقاف البيع مؤقتًا») and seats are left — the campaign has not ended.
 */
export const FOUNDER_PAUSED_TEXT = "البيع متوقف مؤقتاً — تابعنا لموعد الاستئناف";

/**
 * l8 (owner 18 Nov, item 1.1 / ج5): online payment is not switched on for this
 * viewer — the campaign says «البيع متوقف مؤقتاً» and why, never a dead button.
 */
export const FOUNDER_GATEWAY_PAUSED_TEXT = SALE_PAUSED_LINE_AR;

/**
 * R19: legal-drafter and wargaming are consultantBlocked, so a consultant
 * cannot spend the works or the simulator output. Checkout stays open until
 * the owner answers ٤٠٧.
 */
export const FOUNDER_CONSULTANT_NOTE = "حساب المستشار: لا يشمل الصائغ القانوني والمحاكي الشامل";

/**
 * Owner, 17 Nov (20261122_10): the founder plan is for a licensed advocate
 * only. A consultant who is not already a member gets this instead of a buy
 * button; the checkout refuses him too (founder_reserve_seat → not_advocate).
 */
export const FOUNDER_ADVOCATE_ONLY_TEXT = "باقة المؤسس للمحامي المرخص فقط، ولا تُتاح لحساب المستشار";

const CHECKOUT_PATH = `/checkout?item=${FOUNDER_PLAN_ID}&billing=once`;

/**
 * `/login?next=/checkout?item=lawyer-founder-2026%26billing=once`: the value
 * is URI-encoded, then `/ ? =` (legal inside a query value) are written plain
 * so the link stays readable. /login reads it with URLSearchParams and
 * postLoginPath keeps it on this site (founderCard.test.ts).
 */
export const FOUNDER_GUEST_LOGIN_HREF = `/login?next=${encodeURIComponent(CHECKOUT_PATH)
  .replace(/%2F/g, "/")
  .replace(/%3F/g, "?")
  .replace(/%3D/g, "=")}`;

export const FOUNDER_REGISTER_HREF = `/register/provider?plan=${FOUNDER_PLAN_ID}`;

/** The lawyer's licence upload (POST /api/v1/lawyer/licence-image) — what an admin verifies. */
export const FOUNDER_VERIFY_HREF = "/dashboard/lawyer/profile/edit#licence-image";

// ── the numbers ─────────────────────────────────────────────────────────────

/**
 * «٢٬٩٩٦ ر.س قبل الضريبة — الإجمالي ٣٬٤٤٥٫٤٠ ر.س» from quote(), or null when
 * the item is not sold (the card then hides rather than show a made-up price).
 */
export function founderPriceLine(
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): string | null {
  const q = quote(FOUNDER_PLAN_ID, "once", catalog);
  if (!q.ok) return null;
  return `${formatHalalas(q.netHalalas)} قبل الضريبة — الإجمالي ${formatHalalas(q.totalHalalas)}`;
}

/** Halalas as «٢٬٩٩٦» / «٤٤٩٫٤٠» — formatHalalas without its « ر.س» suffix. */
function amountAr(h: number): string {
  const sar = Math.floor(h / 100);
  const halalas = h % 100;
  const fraction = halalas === 0 ? "" : `٫${String(halalas).padStart(2, "0")}`;
  return toArabicDigits(String(sar).replace(/\B(?=(\d{3})+(?!\d))/g, "٬") + fraction);
}

/**
 * R33: «٢٬٩٩٦ + ٤٤٩٫٤٠ ضريبة القيمة المضافة = ٣٬٤٤٥٫٤٠ ر.س», every number from
 * quote(); null when the item is not sold (same as founderPriceLine).
 */
export function founderVatLine(
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): string | null {
  const q = quote(FOUNDER_PLAN_ID, "once", catalog);
  if (!q.ok) return null;
  return `${amountAr(q.netHalalas)} + ${amountAr(q.vatHalalas)} ضريبة القيمة المضافة = ${formatHalalas(q.totalHalalas)}`;
}

/**
 * R33: «آخر يوم في الحملة: ٢٥ يناير ٢٠٢٧» from the setting's ends_on (a Riyadh
 * `YYYY-MM-DD`, inclusive), in the Arabic date format the dashboard founder
 * card uses (libraryEndsAtAr); null for anything that is not a real day.
 */
export function founderEndsLine(endsOn: unknown): string | null {
  if (!isCalendarDay(endsOn)) return null;
  const day = libraryEndsAtAr(endsOn);
  return day ? `آخر يوم في الحملة: ${day}` : null;
}

function groupedAr(n: number): string {
  return toArabicDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));
}

/** «المقاعد المتبقية: N من ١٬٠٩٦» — the capacity is the live one (the admin may change it, R1). */
export function founderSeatsLine(seatsLeft: number, capacity: number): string {
  return `المقاعد المتبقية: ${groupedAr(seatsLeft)} من ${groupedAr(capacity)}`;
}

// ── GET /api/v1/campaigns/active → the offer ────────────────────────────────

export type FounderOffer =
  /** `endsOn`: the campaign's last day (the setting's ends_on), when the body carries a real one. */
  | { state: "open"; seatsLeft: number; capacity: number; endsOn?: string }
  | { state: "closed" }
  /** The campaign's dates are set and its first day has not come yet. */
  | { state: "pre" }
  /** R31: the admin paused the sale and seats are left. */
  | { state: "paused" }
  /** The route could not read the setting or the seats (or the fetch failed). */
  | { state: "unavailable" };

const UNAVAILABLE: FounderOffer = { state: "unavailable" };
const CLOSED: FounderOffer = { state: "closed" };
const PRE: FounderOffer = { state: "pre" };
const PAUSED: FounderOffer = { state: "paused" };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPositiveInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/**
 * The route's body as the card reads it. `campaign: null` (outside the
 * dates, or the code switch off) and `onSale: false` (full, ended) are
 * "closed"; `onSale: false` with `salePaused: true` and a seat left is
 * "paused" (R31: paused and full at once reads "closed" — resuming would not
 * reopen it); `founderUnavailable: true`, a malformed body, or an on-sale
 * campaign with unusable numbers are "unavailable" — never reported as an
 * ended campaign.
 */
export function founderOfferFromApi(body: unknown): FounderOffer {
  if (!isObject(body) || body.founderUnavailable === true) return UNAVAILABLE;
  if (body.campaign === null) {
    return isObject(body.founderWindow) && body.founderWindow.state === "pre" ? PRE : CLOSED;
  }
  const c = body.campaign;
  if (!isObject(c)) return UNAVAILABLE;
  if (c.onSale !== true) return c.salePaused === true && isPositiveInt(c.seatsLeft) ? PAUSED : CLOSED;
  if (c.planId !== FOUNDER_PLAN_ID || !isPositiveInt(c.seatsLeft) || !isPositiveInt(c.capacity)) return UNAVAILABLE;
  const open: FounderOffer = { state: "open", seatsLeft: c.seatsLeft, capacity: c.capacity };
  return isCalendarDay(c.endsOn) ? { ...open, endsOn: c.endsOn } : open;
}

// ── whether the section renders ─────────────────────────────────────────────

const AUDIENCES = new Set<string>(Object.values(USER_TYPE_TO_AUDIENCE));

/** The URL's `audience` when it names a /pricing tab, else null. */
export function audienceFromParam(value: string | null | undefined): AudienceTab | null {
  return typeof value === "string" && AUDIENCES.has(value) ? (value as AudienceTab) : null;
}

export type FounderSectionView = "hidden" | "card" | "closed" | "paused" | "pre";

/**
 * The lawyers tab (not library mode) shows the card while the sale is open
 * and the price is known. A closed sale says «انتهت حملة المؤسس…», a paused
 * one «البيع متوقف مؤقتًا…» (R31), only to a visitor whose URL carries
 * campaign=founder-2026; a failed read or a page still loading (`offer`
 * null) shows nothing.
 */
export function founderSectionView(input: {
  audience: AudienceTab;
  libraryMode: boolean;
  campaignParam: string | null;
  offer: FounderOffer | null;
  priced: boolean;
}): FounderSectionView {
  if (input.audience !== "lawyers" || input.libraryMode || !input.offer) return "hidden";
  if (input.offer.state === "open") return input.priced ? "card" : "hidden";
  if (input.campaignParam !== FOUNDER_CAMPAIGN_ID) return "hidden";
  if (input.offer.state === "closed") return "closed";
  if (input.offer.state === "paused") return "paused";
  if (input.offer.state === "pre") return "pre";
  return "hidden";
}

// ── the button ──────────────────────────────────────────────────────────────

/**
 * "pending" (l7, decision 1): the lawyer's signup is still being checked
 * (held for review included) — he may pay; the seat activates when he is
 * approved and is refunded in full if he is not.
 */
export type FounderVerification = "verified" | "pending" | "unverified" | "unknown" | "loading";
/** "pending" (l7): he paid while his licence was pending — the seat waits for the check. */
export type FounderMember = boolean | "pending" | "unknown" | "loading";

/** l7 decision 1, the owner's sentence, shown before a pending lawyer pays and after. */
export const FOUNDER_PENDING_NOTE = "تُفعَّل الباقة بعد توثيق رخصتك، وإن لم تُوثَّق يُردّ المبلغ كاملاً.";
/** l7: the button of a lawyer who paid while pending. */
export const FOUNDER_PENDING_MEMBER_LABEL = "مقعدك محجوز بانتظار توثيق رخصتك";

export interface FounderCtaState {
  /** useUser() still resolving. */
  sessionLoading: boolean;
  signedIn: boolean;
  userType: string | null;
  practiceKind: "advocate" | "consultant" | null;
  /** lawyer_profiles.verification_status, from GET /api/v1/profile. */
  verification: FounderVerification;
  /** GET /api/v1/membership/founder's `member`. */
  member: FounderMember;
  /** usePaymentsStatus(). */
  gateway: { disabled: boolean; provider: string | null; loading?: boolean };
}

export type FounderCta = { note: string | null } & (
  | { kind: "loading"; label: string }
  | { kind: "guest"; label: string; href: string; registerLabel: string; registerHref: string }
  | { kind: "lawyers_only"; label: string }
  | { kind: "member"; label: string }
  | { kind: "verify"; label: string; href: string }
  | { kind: "wait"; label: string }
  | { kind: "unavailable"; label: string }
  | { kind: "checkout"; label: string; href: string }
);

/**
 * What the card's button does, in this order:
 *   1. session loading → nothing yet (a member must never see the guest CTA);
 *   2. guest → sign in, then /checkout (plus «أنشئ حساب محامٍ»);
 *   3. signed in, not a lawyer → «للمحامين المرخّصين» (the item sells to lawyers only);
 *   4. membership loading → nothing yet; a member → «أنت عضو مؤسس»
 *      (before verification: a member's licence was verified at activation);
 *   4b. l7: paid while pending → «مقعدك محجوز بانتظار توثيق رخصتك» + FOUNDER_PENDING_NOTE;
 *   5. verification loading → nothing yet; unverified (rejected, suspended,
 *      no lawyer row) → «وثّق رخصتك أولاً»; pending (l7, decision 1) → the
 *      buy steps below with FOUNDER_PENDING_NOTE;
 *   6. gateway loading → wait; checkoutHref null (gateway off / stub) →
 *      FOUNDER_GATEWAY_PAUSED_TEXT «البيع متوقف مؤقتاً — …» (l8); else /checkout.
 *   l8: a guest is told the sale is paused too (once the status has loaded)
 *   instead of being sent to sign in for a purchase he cannot make.
 * An unreadable profile or membership ("unknown") never blocks: the checkout
 * gate (founder_reserve_seat) decides. A consultant gets FOUNDER_CONSULTANT_NOTE
 * on every lawyer state (R19), and since 17 Nov a consultant who is not a
 * member gets FOUNDER_ADVOCATE_ONLY_TEXT instead of any buy step.
 */
export function founderCta(s: FounderCtaState): FounderCta {
  if (s.sessionLoading) return { kind: "loading", label: "جارٍ التحميل…", note: null };
  if (!s.signedIn && s.gateway.loading === true) return { kind: "loading", label: "جارٍ التحميل…", note: null };
  if (!s.signedIn && saleGatewayPaused(s.gateway)) return { kind: "unavailable", label: FOUNDER_GATEWAY_PAUSED_TEXT, note: null };
  if (!s.signedIn) {
    return {
      kind: "guest",
      label: "سجّل الدخول للاشتراك",
      href: FOUNDER_GUEST_LOGIN_HREF,
      registerLabel: "أنشئ حساب محامٍ",
      registerHref: FOUNDER_REGISTER_HREF,
      note: null,
    };
  }
  if (s.userType !== "lawyer") {
    return { kind: "lawyers_only", label: "باقة المؤسس للمحامين المرخّصين فقط", note: null };
  }
  const note = s.practiceKind === "consultant" ? FOUNDER_CONSULTANT_NOTE : null;
  if (s.member === "loading") return { kind: "loading", label: "جارٍ التحميل…", note };
  if (s.member === true) return { kind: "member", label: "أنت عضو مؤسس", note };
  if (s.member === "pending") return { kind: "member", label: FOUNDER_PENDING_MEMBER_LABEL, note: FOUNDER_PENDING_NOTE };
  if (s.practiceKind === "consultant") return { kind: "lawyers_only", label: FOUNDER_ADVOCATE_ONLY_TEXT, note };
  if (s.verification === "loading") return { kind: "loading", label: "جارٍ التحميل…", note };
  if (s.verification === "unverified") {
    return { kind: "verify", label: "وثّق رخصتك أولاً", href: FOUNDER_VERIFY_HREF, note };
  }
  // l7 (decision 1): a pending lawyer may pay — told plainly what happens next
  const buyNote = s.verification === "pending" ? FOUNDER_PENDING_NOTE : note;
  if (s.gateway.loading === true) return { kind: "wait", label: "جارٍ التحقق من بوابة الدفع…", note: buyNote };
  const href = checkoutHref(FOUNDER_PLAN_ID, "once", gatewayAllowsCheckout(s.gateway), true);
  if (!href) return { kind: "unavailable", label: FOUNDER_GATEWAY_PAUSED_TEXT, note: buyNote };
  return { kind: "checkout", label: "اشترك الآن", href, note: buyNote };
}

/**
 * GET /api/v1/profile → the lawyer's verification. Only an exact 'verified'
 * is verified; an exact 'pending' (l7: still being checked, held included) is
 * pending; anything else (rejected, suspended, null) is unverified.
 */
export function founderVerificationFromProfile(reply: unknown): Exclude<FounderVerification, "loading"> {
  if (!isObject(reply) || !("roleProfile" in reply)) return "unknown";
  const role = reply.roleProfile;
  if (role === null) return reply.roleProfileReadFailed === true ? "unknown" : "unverified";
  if (!isObject(role)) return "unknown";
  if (role.verification_status === "verified") return "verified";
  return role.verification_status === "pending" ? "pending" : "unverified";
}

/** GET /api/v1/membership/founder → member, "pending" (l7: paid, licence being checked), or "unknown" for an error body. */
export function founderMemberFromReply(reply: unknown): Exclude<FounderMember, "loading"> {
  if (!isObject(reply) || typeof reply.member !== "boolean") return "unknown";
  if (!reply.member && reply.pendingVerification === true) return "pending";
  return reply.member;
}
