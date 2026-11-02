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
 * comes from quote(), never a typed number.
 *
 * Pure: relative imports only, so `node --test` loads it (founderCard.test.ts).
 */

import { formatHalalas, quote, PAYABLE_ITEMS, type PayableItem } from "../payments/catalog.ts";
import { checkoutHref, gatewayAllowsCheckout } from "../payments/checkoutView.ts";
import {
  FOUNDER_CAMPAIGN_ID,
  FOUNDER_CREDITS,
  FOUNDER_MEMBERSHIP_MONTHS,
  FOUNDER_PLAN_ID,
} from "../membership/founderPlan.ts";
import { toArabicDigits } from "../services/arabicCount.ts";
import { USER_TYPE_TO_AUDIENCE } from "./audienceForUserType.ts";
import type { AudienceTab } from "../../constants/pricing/pricing.types.ts";

// ── the copy ────────────────────────────────────────────────────────────────

/** The card's id: the campaign link's `#founder-plan`. */
export const FOUNDER_PLAN_ANCHOR = "founder-plan";

export const FOUNDER_CARD_TITLE = "باقة المحامي المؤسس";

const MONTHS = toArabicDigits(FOUNDER_MEMBERSHIP_MONTHS);

export const FOUNDER_TERM_LINE = `للسنة الأولى، ${MONTHS} شهرًا من التفعيل`;

export const FOUNDER_BENEFITS: readonly string[] = Object.freeze([
  `${toArabicDigits(FOUNDER_CREDITS.drafting_work)} أعمال بالصائغ القانوني (يمكن تكرار النوع)`,
  "مخرج مستقل واحد تختاره من: محترف العقود، الرأي الفصل، المحاكي الشامل، داعم الاتجاه (قريبًا)",
  `المكتبة القانونية ${MONTHS} شهرًا`,
  "إدارة المكتب: قريبًا — ضمن مدة العضوية المحسوبة من التفعيل",
]);

export const FOUNDER_FINE_PRINT = "لا يُعدّ سعر السنة الأولى سعر تجديد ثابتًا";

/** Shown instead of a dead anchor when the campaign link arrives after the sale closed. */
export const FOUNDER_CLOSED_TEXT = "انتهت حملة المؤسس أو اكتملت مقاعدها";

/**
 * R19: legal-drafter and wargaming are consultantBlocked, so a consultant
 * cannot spend the works or the simulator output. Checkout stays open until
 * the owner answers ٤٠٧.
 */
export const FOUNDER_CONSULTANT_NOTE = "حساب المستشار: لا يشمل الصائغ القانوني والمحاكي الشامل";

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

function groupedAr(n: number): string {
  return toArabicDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));
}

/** «المقاعد المتبقية: N من ١٬٠٩٦» — the capacity is the live one (the admin may change it, R1). */
export function founderSeatsLine(seatsLeft: number, capacity: number): string {
  return `المقاعد المتبقية: ${groupedAr(seatsLeft)} من ${groupedAr(capacity)}`;
}

// ── GET /api/v1/campaigns/active → the offer ────────────────────────────────

export type FounderOffer =
  | { state: "open"; seatsLeft: number; capacity: number }
  | { state: "closed" }
  /** The route could not read the setting or the seats (or the fetch failed). */
  | { state: "unavailable" };

const UNAVAILABLE: FounderOffer = { state: "unavailable" };
const CLOSED: FounderOffer = { state: "closed" };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPositiveInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/**
 * The route's body as the card reads it. `campaign: null` (outside the
 * dates, or the code switch off) and `onSale: false` (full, paused) are
 * "closed"; `founderUnavailable: true`, a malformed body, or an on-sale
 * campaign with unusable numbers are "unavailable" — never reported as an
 * ended campaign.
 */
export function founderOfferFromApi(body: unknown): FounderOffer {
  if (!isObject(body) || body.founderUnavailable === true) return UNAVAILABLE;
  if (body.campaign === null) return CLOSED;
  const c = body.campaign;
  if (!isObject(c)) return UNAVAILABLE;
  if (c.onSale !== true) return CLOSED;
  if (c.planId !== FOUNDER_PLAN_ID || !isPositiveInt(c.seatsLeft) || !isPositiveInt(c.capacity)) return UNAVAILABLE;
  return { state: "open", seatsLeft: c.seatsLeft, capacity: c.capacity };
}

// ── whether the section renders ─────────────────────────────────────────────

const AUDIENCES = new Set<string>(Object.values(USER_TYPE_TO_AUDIENCE));

/** The URL's `audience` when it names a /pricing tab, else null. */
export function audienceFromParam(value: string | null | undefined): AudienceTab | null {
  return typeof value === "string" && AUDIENCES.has(value) ? (value as AudienceTab) : null;
}

export type FounderSectionView = "hidden" | "card" | "closed";

/**
 * The lawyers tab (not library mode) shows the card while the sale is open
 * and the price is known. A closed sale says «انتهت حملة المؤسس…» only to a
 * visitor whose URL carries campaign=founder-2026; a failed read or a page
 * still loading (`offer` null) shows nothing.
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
  if (input.offer.state === "closed" && input.campaignParam === FOUNDER_CAMPAIGN_ID) return "closed";
  return "hidden";
}

// ── the button ──────────────────────────────────────────────────────────────

export type FounderVerification = "verified" | "unverified" | "unknown" | "loading";
export type FounderMember = boolean | "unknown" | "loading";

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
 *   5. verification loading → nothing yet; unverified → «وثّق رخصتك أولاً»;
 *   6. gateway loading → wait; checkoutHref null (gateway off / stub) →
 *      «الدفع الإلكتروني غير متاح حاليًا»; else /checkout.
 * An unreadable profile or membership ("unknown") never blocks: the checkout
 * gate (founder_reserve_seat) decides. A consultant gets FOUNDER_CONSULTANT_NOTE
 * on every lawyer state (R19).
 */
export function founderCta(s: FounderCtaState): FounderCta {
  if (s.sessionLoading) return { kind: "loading", label: "جارٍ التحميل…", note: null };
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
  if (s.verification === "loading") return { kind: "loading", label: "جارٍ التحميل…", note };
  if (s.verification === "unverified") {
    return { kind: "verify", label: "وثّق رخصتك أولاً", href: FOUNDER_VERIFY_HREF, note };
  }
  if (s.gateway.loading === true) return { kind: "wait", label: "جارٍ التحقق من بوابة الدفع…", note };
  const href = checkoutHref(FOUNDER_PLAN_ID, "once", gatewayAllowsCheckout(s.gateway), true);
  if (!href) return { kind: "unavailable", label: "الدفع الإلكتروني غير متاح حاليًا", note };
  return { kind: "checkout", label: "اشترك الآن", href, note };
}

/** GET /api/v1/profile → the lawyer's verification. Only an exact 'verified' counts. */
export function founderVerificationFromProfile(reply: unknown): Exclude<FounderVerification, "loading"> {
  if (!isObject(reply) || !("roleProfile" in reply)) return "unknown";
  const role = reply.roleProfile;
  if (role === null) return reply.roleProfileReadFailed === true ? "unknown" : "unverified";
  if (!isObject(role)) return "unknown";
  return role.verification_status === "verified" ? "verified" : "unverified";
}

/** GET /api/v1/membership/founder → member, or "unknown" for an error body. */
export function founderMemberFromReply(reply: unknown): Exclude<FounderMember, "loading"> {
  if (!isObject(reply) || typeof reply.member !== "boolean") return "unknown";
  return reply.member;
}
