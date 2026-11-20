/**
 * offerRules.ts — the offers system (owner message of 18 Nov 2026, item 5),
 * everything that decides without a database:
 *   - who an offer is for (account type, verification, buyers excluded);
 *   - whether it is open now (status, the server-clock window, seats — the
 *     founder offer reads the founder campaign's own window and counter);
 *   - which ONE offer pops up (highest priority whose closed popup is past
 *     its return delay), and on which pages a popup may open at all;
 *   - the admin's create / edit input, checked field by field;
 *   - the API body the browser reads (offersFromApi), checked again.
 *
 * SQL: supabase/migrations/20261128_50_offers.sql. The server half is
 * ./offersServer.ts; the routes are /api/v1/offers (per user) and
 * /api/v1/admin/offers (staff).
 *
 * `requires_invite_code` (owner: an empty column only) is never selected,
 * never validated and never shown: OFFER_COLUMNS leaves it out on purpose.
 *
 * Pure: relative imports only, so `node --test` loads it (offerRules.test.ts).
 */

import { FOUNDER_CAMPAIGN_ID } from "../membership/founderPlan.ts";
import { countPhraseAr, toArabicDigits } from "../services/arabicCount.ts";
import type { FounderWindowState } from "../pricing/campaigns.ts";

// ── the vocabulary ──────────────────────────────────────────────────────────

/**
 * The audience keys. `lawyer` is the ADVOCATE lawyer only; the legal
 * consultant (a lawyer account with practice_kind 'consultant') is its own
 * key, so an offer for lawyers never reaches him unless the admin ticks it.
 * `guest` (l11 O17, register 20): a visitor who is not signed in — the
 * /pricing strip shows him the offers that name it. No signed-in account is
 * ever a guest (audienceKeyFor never answers it); a guest offer is for every
 * visitor, so its verification is "any" (offerInputToColumns, and a CHECK in
 * 20261201_20).
 */
export const OFFER_AUDIENCE_KEYS = ["lawyer", "consultant", "firm", "individual", "corporate", "guest"] as const;
export type OfferAudienceKey = (typeof OFFER_AUDIENCE_KEYS)[number];

export const OFFER_AUDIENCE_LABELS_AR: Readonly<Record<OfferAudienceKey, string>> = Object.freeze({
  lawyer: "محامٍ مترافع",
  consultant: "مستشار قانوني",
  firm: "مكتب محاماة",
  individual: "فرد",
  corporate: "منشأة",
  guest: "زائر غير مسجّل",
});

/** l11 O17: the visitor's audience key (never a signed-in account's). */
export const GUEST_AUDIENCE: OfferAudienceKey = "guest";

/** A guest offer needs verification "any" — a visitor has none (offerInputToColumns). */
export const GUEST_NEEDS_ANY_AR = "عرض الزوار يظهر لكل زائر: اختر «الكل» في حالة التوثيق";

/** The visitor's viewer: no account, nothing bought, no seat. */
export const GUEST_VIEWER: Readonly<{ audience: OfferAudienceKey; verified: null; boughtPlanRefs: ReadonlySet<string>; founderSeat: false }> =
  Object.freeze({ audience: GUEST_AUDIENCE, verified: null, boughtPlanRefs: new Set<string>(), founderSeat: false as const });

export const OFFER_VERIFICATIONS = ["any", "verified", "unverified"] as const;
export type OfferVerification = (typeof OFFER_VERIFICATIONS)[number];

export const OFFER_VERIFICATION_LABELS_AR: Readonly<Record<OfferVerification, string>> = Object.freeze({
  any: "الكل",
  verified: "الموثَّقون فقط",
  unverified: "غير الموثَّقين فقط",
});

export const OFFER_STATUSES = ["draft", "active", "paused"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABELS_AR: Readonly<Record<OfferStatus, string>> = Object.freeze({
  draft: "مسودة",
  active: "فعّال",
  paused: "متوقف",
});

/** The founder offer's slug (the seeded first row) — the same id as its campaign. */
export const FOUNDER_OFFER_SLUG = FOUNDER_CAMPAIGN_ID;

/** Owner item 5: a closed popup returns after 3 days unless the admin sets another delay. */
export const DEFAULT_RETURN_MINUTES = 3 * 24 * 60;
export const MAX_RETURN_MINUTES = 525600;

export const OFFER_TITLE_MAX = 120;
export const OFFER_BODY_MAX = 1000;
export const OFFER_CTA_LABEL_MAX = 40;
export const OFFER_HREF_MAX = 300;
export const OFFER_MEDIA_MAX = 500;
export const OFFER_PRIORITY_MIN = -1000;
export const OFFER_PRIORITY_MAX = 1000;

/** Every column the code reads. requires_invite_code is deliberately absent. */
export const OFFER_COLUMNS =
  "id, slug, title, body, media_url, media_kind, cta_label, cta_href, audience_account_types, " +
  "audience_verification, exclude_buyers, plan_ref, campaign_id, starts_at, ends_at, seats_total, " +
  "seats_used, priority, status, dismiss_return_minutes, created_at, updated_at";

export interface OfferRow {
  id: string;
  slug: string | null;
  title: string;
  body: string;
  media_url: string | null;
  media_kind: "image" | "video" | null;
  cta_label: string;
  cta_href: string;
  audience_account_types: string[];
  audience_verification: OfferVerification;
  exclude_buyers: boolean;
  plan_ref: string | null;
  campaign_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  seats_total: number | null;
  seats_used: number;
  priority: number;
  status: OfferStatus;
  dismiss_return_minutes: number;
  created_at: string;
  updated_at: string;
}

// ── small checks ────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A same-site path: "/x", never "//host" or "/\host" (read as another host). */
export function isSameSitePath(v: unknown): v is string {
  return typeof v === "string" && v.length <= OFFER_HREF_MAX && /^\/(?![/\\])/.test(v) && !/[\s<>"']/.test(v);
}

/** A media URL: an https URL or a same-site path. */
export function isMediaUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > OFFER_MEDIA_MAX || /[\s<>"']/.test(v)) return false;
  return /^https:\/\/[^/\s]+\//.test(v) || /^\/(?![/\\])/.test(v);
}

const parseMs = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || !iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

// ── the viewer ──────────────────────────────────────────────────────────────

/**
 * profiles.user_type (+ lawyer_profiles.practice_kind) → the audience key, or
 * null for an account type no offer can target (admin, provider, …).
 */
export function audienceKeyFor(userType: unknown, practiceKind: unknown): OfferAudienceKey | null {
  switch (userType) {
    case "lawyer":
      return practiceKind === "consultant" ? "consultant" : "lawyer";
    case "firm":
      return "firm";
    case "individual":
      return "individual";
    case "corporate":
      return "corporate";
    default:
      return null;
  }
}

export interface OfferViewer {
  audience: OfferAudienceKey | null;
  /** true / false when read; null when the read failed (a verification-bound offer then stays hidden). */
  verified: boolean | null;
  /**
   * A lawyer whose licence is still being checked (lawyer_profiles
   * .verification_status 'pending'). Optional: only the founder offer reads it.
   */
  pendingVerification?: boolean;
  /** plan_refs this user has a PAID order of. */
  boughtPlanRefs: ReadonlySet<string>;
  /** An active or pending-verification founder seat (the founder offer's own "bought"). */
  founderSeat: boolean;
}

/**
 * Is this offer meant for this viewer? (status / window / seats are offerAvailability's.)
 *
 * File 15 row 24 / file 12 item 2 (batch l9): «أي محامٍ يسجّل يظهر له بوب أب
 * عرض المؤسس». Since l7 (decision 1) a lawyer whose licence is still PENDING
 * may pay for the founder seat (it waits as pending_verification), so the
 * founder offer's "verified" audience also reaches a pending advocate lawyer.
 * A rejected / unverified lawyer and the consultant stay outside it; every
 * other offer keeps the plain verified rule.
 */
export function founderAudienceAdmits(row: Pick<OfferRow, "campaign_id">, viewer: OfferViewer): boolean {
  return row.campaign_id === FOUNDER_CAMPAIGN_ID && viewer.audience === "lawyer" && viewer.pendingVerification === true;
}

export function offerMatchesViewer(row: Pick<OfferRow, "audience_account_types" | "audience_verification" | "exclude_buyers" | "plan_ref" | "campaign_id">, viewer: OfferViewer): boolean {
  if (!viewer.audience || !row.audience_account_types.includes(viewer.audience)) return false;
  if (row.audience_verification === "verified" && viewer.verified !== true && !founderAudienceAdmits(row, viewer)) return false;
  if (row.audience_verification === "unverified" && viewer.verified !== false) return false;
  if (row.exclude_buyers) {
    if (row.plan_ref && viewer.boughtPlanRefs.has(row.plan_ref)) return false;
    if (row.campaign_id === FOUNDER_CAMPAIGN_ID && viewer.founderSeat) return false;
  }
  return true;
}

// ── open or not (server clock) ──────────────────────────────────────────────

/** The founder campaign as the server read it (founderWindow() in pricing/campaigns.ts). */
export interface CampaignState {
  state: FounderWindowState;
  seatsLeft: number | null;
  capacity: number | null;
  /** ISO of the first instant the campaign is over. */
  endsAtExclusive: string | null;
}

export type OfferClosedReason = "draft" | "paused" | "not_started" | "ended" | "sold_out" | "campaign_closed";

export type OfferAvailability =
  | { open: true; seatsLeft: number | null; seatsTotal: number | null; endsAt: string | null }
  | { open: false; reason: OfferClosedReason; seatsLeft: number | null; seatsTotal: number | null };

/**
 * Is the offer open at `nowMs` (the SERVER's clock)?
 *   - status must be active;
 *   - starts_at ≤ now < ends_at (either end may be empty);
 *   - a founder-linked offer also needs the campaign `live` — its seats and
 *     end are the campaign's (null `campaign` = unreadable → closed);
 *   - an offer with its own seats: left = total − (seats_used + paid
 *     purchases of plan_ref since it opened), 0 → sold out.
 */
export function offerAvailability(
  row: Pick<OfferRow, "status" | "starts_at" | "ends_at" | "campaign_id" | "seats_total" | "seats_used">,
  nowMs: number,
  input: { purchases: number; campaign: CampaignState | null },
): OfferAvailability {
  const closed = (reason: OfferClosedReason, seatsLeft: number | null = null, seatsTotal: number | null = null): OfferAvailability =>
    ({ open: false, reason, seatsLeft, seatsTotal });
  if (row.status !== "active") return closed(row.status === "draft" ? "draft" : "paused");
  const starts = parseMs(row.starts_at);
  const ends = parseMs(row.ends_at);
  if (starts !== null && nowMs < starts) return closed("not_started");
  if (ends !== null && nowMs >= ends) return closed("ended");

  if (row.campaign_id) {
    const c = input.campaign;
    if (!c) return closed("campaign_closed");
    if (c.state === "sold_out") return closed("sold_out", 0, c.capacity);
    if (c.state === "ended") return closed("ended");
    if (c.state !== "live") return closed("campaign_closed");
    const campaignEnd = parseMs(c.endsAtExclusive);
    if (campaignEnd !== null && nowMs >= campaignEnd) return closed("ended");
    if (c.seatsLeft !== null && c.seatsLeft <= 0) return closed("sold_out", 0, c.capacity);
    const endMs = [ends, campaignEnd].filter((t): t is number => t !== null).sort((a, b) => a - b)[0];
    return {
      open: true,
      seatsLeft: c.seatsLeft,
      seatsTotal: c.capacity,
      endsAt: endMs === undefined ? null : new Date(endMs).toISOString(),
    };
  }

  if (row.seats_total !== null && row.seats_total !== undefined) {
    const used = Math.max(0, row.seats_used) + Math.max(0, input.purchases);
    const left = Math.max(row.seats_total - used, 0);
    if (left <= 0) return closed("sold_out", 0, row.seats_total);
    return { open: true, seatsLeft: left, seatsTotal: row.seats_total, endsAt: ends === null ? null : new Date(ends).toISOString() };
  }
  return { open: true, seatsLeft: null, seatsTotal: null, endsAt: ends === null ? null : new Date(ends).toISOString() };
}

// ── ordering and the popup ──────────────────────────────────────────────────

/** Highest priority first; on a tie the older offer first. */
export function compareOffers(a: Pick<OfferRow, "priority" | "created_at">, b: Pick<OfferRow, "priority" | "created_at">): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  return (parseMs(a.created_at) ?? 0) - (parseMs(b.created_at) ?? 0);
}

export interface DismissalRow {
  offer_id: string;
  dismissed_at: string;
}

/**
 * The ONE offer the popup shows: the highest-priority open offer whose last
 * dismissal is older than its return delay (or never dismissed). `offers`
 * must already be the viewer's open offers in display order.
 */
export function pickPopup<T extends Pick<OfferRow, "id" | "dismiss_return_minutes">>(
  offers: readonly T[],
  dismissals: readonly DismissalRow[],
  nowMs: number,
): T | null {
  const last = new Map<string, number>();
  for (const d of dismissals) {
    const t = parseMs(d.dismissed_at);
    if (t !== null && (!last.has(d.offer_id) || t > (last.get(d.offer_id) as number))) last.set(d.offer_id, t);
  }
  for (const o of offers) {
    const at = last.get(o.id);
    if (at === undefined) return o;
    const minutes = Number.isInteger(o.dismiss_return_minutes) && o.dismiss_return_minutes > 0 ? o.dismiss_return_minutes : DEFAULT_RETURN_MINUTES;
    if (nowMs >= at + minutes * 60_000) return o;
  }
  return null;
}

/**
 * Pages where the popup may open (owner item 5: never during signup,
 * payment or the terms): the signed-in dashboards only, never the admin
 * console, billing, a wallet / top-up, a checkout or payment step, the
 * terms, onboarding or a signup step.
 */
const BLOCKED_SEGMENTS = new Set([
  "admin",
  "billing",
  "wallet",
  "checkout",
  "payment",
  "payments",
  "pay",
  "subscription",
  "terms",
  "founder-terms",
  "refund-policy",
  "privacy",
  "onboarding",
  "register",
  "signup",
  "offers",
]);

export function popupAllowedOnPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split(/[?#]/)[0];
  if (p !== "/dashboard" && !p.startsWith("/dashboard/")) return false;
  return !p.split("/").some((seg) => BLOCKED_SEGMENTS.has(seg.toLowerCase()));
}

// ── what the browser gets ───────────────────────────────────────────────────

export interface OfferCardDto {
  id: string;
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  ctaLabel: string;
  ctaHref: string;
  seatsLeft: number | null;
  seatsTotal: number | null;
  /** ISO, server clock; null when the offer has no end. */
  endsAt: string | null;
  /**
   * l11 O9: the price-book item the offer is about (offers.plan_ref), or null
   * for a general offer. /checkout shows only the offers of the item being
   * bought and the general ones (offersForItem).
   */
  planRef: string | null;
}

/** offers_plan_ref_check (20261128_50): a price-book id. */
const PLAN_REF_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * l11 O9: the offers /checkout shows for `itemId` — those about that item and
 * the general ones (no plan_ref); never an offer about another item.
 */
export function offersForItem<T extends Pick<OfferCardDto, "planRef">>(offers: readonly T[], itemId: string | null | undefined): T[] {
  if (!itemId) return offers.filter((o) => o.planRef === null);
  return offers.filter((o) => o.planRef === null || o.planRef === itemId);
}

export function offerCardDto(row: OfferRow, a: Extract<OfferAvailability, { open: true }>): OfferCardDto {
  const media = row.media_url && row.media_kind && isMediaUrl(row.media_url) ? row.media_url : null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    mediaUrl: media,
    mediaKind: media ? row.media_kind : null,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    seatsLeft: a.seatsLeft,
    seatsTotal: a.seatsTotal,
    endsAt: a.endsAt,
    planRef: row.plan_ref && PLAN_REF_RE.test(row.plan_ref) ? row.plan_ref : null,
  };
}

export interface OffersReply {
  offers: OfferCardDto[];
  popupId: string | null;
  /** Changes with every sign-in: the popup's "not again in this session" key. */
  sessionKey: string | null;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

function cardFromApi(v: unknown): OfferCardDto | null {
  if (!isObject(v)) return null;
  const { id, title, body, mediaUrl, mediaKind, ctaLabel, ctaHref, seatsLeft, seatsTotal, endsAt, planRef } = v;
  if (typeof id !== "string" || !id || typeof title !== "string" || !title.trim()) return null;
  if (typeof ctaLabel !== "string" || !ctaLabel.trim() || !isSameSitePath(ctaHref)) return null;
  const media = isMediaUrl(mediaUrl) && (mediaKind === "image" || mediaKind === "video") ? mediaUrl : null;
  return {
    id,
    title,
    body: typeof body === "string" ? body : "",
    mediaUrl: media,
    mediaKind: media ? (mediaKind as "image" | "video") : null,
    ctaLabel,
    ctaHref,
    seatsLeft: isCount(seatsLeft) ? seatsLeft : null,
    seatsTotal: isCount(seatsTotal) ? seatsTotal : null,
    endsAt: typeof endsAt === "string" && parseMs(endsAt) !== null ? endsAt : null,
    planRef: typeof planRef === "string" && PLAN_REF_RE.test(planRef) ? planRef : null,
  };
}

/** GET /api/v1/offers → what the popup, the «العروض» item and the cards read; null for an unusable body. */
export function offersFromApi(body: unknown): OffersReply | null {
  if (!isObject(body) || !Array.isArray(body.offers)) return null;
  const offers = body.offers.map(cardFromApi).filter((c): c is OfferCardDto => c !== null);
  const popupId = typeof body.popupId === "string" && offers.some((o) => o.id === body.popupId) ? body.popupId : null;
  const sessionKey = typeof body.sessionKey === "string" && body.sessionKey ? body.sessionKey : null;
  return { offers, popupId, sessionKey };
}

/** The popup's sessionStorage key: one per sign-in (owner: never again in the same session). */
export const POPUP_SESSION_PREFIX = "nzamy:offers:popup-seen:";

const SEATS = { zero: null, one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعدًا", hundreds: "مقعد" };

/** «بقي ٥ مقاعد من ١٠٠» — null for an offer without seats. */
export function offerSeatsLineAr(card: Pick<OfferCardDto, "seatsLeft" | "seatsTotal">): string | null {
  if (card.seatsLeft === null) return null;
  const left = countPhraseAr(card.seatsLeft, SEATS);
  if (!left) return null;
  return card.seatsTotal !== null ? `بقي ${left} من ${toArabicDigits(card.seatsTotal)}` : `بقي ${left}`;
}

/** «ينتهي العرض في ١٧ ديسمبر ٢٠٢٦» (Riyadh) — the last instant before the exclusive end. */
export function offerEndsLineAr(endsAt: string | null): string | null {
  const t = parseMs(endsAt);
  if (t === null) return null;
  const day = new Intl.DateTimeFormat("ar-SA", {
    calendar: "gregory",
    numberingSystem: "arab",
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(t - 1));
  return `ينتهي العرض في ${day}`;
}

// ── the founder campaign's copy (banner + lawyer dashboard card) ────────────

/** What the founder banner and the lawyer dashboard card read from the founder offer row. */
export interface FounderOfferCopy {
  /** false once the admin stopped (or drafted) the offer: the promotion steps aside, the sale does not. */
  promoted: boolean;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

export function founderOfferCopyFromRow(row: unknown): FounderOfferCopy | null {
  if (!isObject(row)) return null;
  const { status, title, body, cta_label: ctaLabel, cta_href: ctaHref } = row;
  if (typeof title !== "string" || !title.trim() || typeof ctaLabel !== "string" || !ctaLabel.trim()) return null;
  if (!isSameSitePath(ctaHref)) return null;
  return {
    promoted: status === "active",
    title: title.trim(),
    body: typeof body === "string" ? body.trim() : "",
    ctaLabel: ctaLabel.trim(),
    ctaHref,
  };
}

/** GET /api/v1/campaigns/active's `founderOffer` (null: no row yet, or unreadable — keep the built-in copy). */
export function founderOfferCopyFromApi(body: unknown): FounderOfferCopy | null {
  if (!isObject(body) || !isObject(body.founderOffer)) return null;
  const f = body.founderOffer;
  if (typeof f.promoted !== "boolean") return null;
  const copy = founderOfferCopyFromRow({
    status: f.promoted ? "active" : "paused",
    title: f.title,
    body: f.body,
    cta_label: f.ctaLabel,
    cta_href: f.ctaHref,
  });
  return copy;
}

// ── the admin's input ───────────────────────────────────────────────────────

export type OfferInputResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string };

const BAD = (error: string): OfferInputResult => ({ ok: false, error });

export const FOUNDER_LOCKED_AR =
  "عرض المؤسس مرتبط بالحملة: جمهوره (المحامي المترافع الموثَّق أو الذي ينتظر توثيق رخصته) ومقاعده وبنده ثابتة، ويُعدَّل نصه وصورته وأولويته وحالته فقط.";

/** The admin list's audience line for the founder offer (its stored value is 'verified'). */
export const FOUNDER_AUDIENCE_NOTE_AR = "الموثَّقون ومن ينتظر توثيق رخصته";

const LOCKED_ON_CAMPAIGN = ["audience", "verification", "excludeBuyers", "planRef", "seatsTotal", "seatsUsed"] as const;

function text(v: unknown, max: number, label: string, required: boolean): string | OfferInputResult {
  if (typeof v !== "string") return BAD(`${label}: نص مطلوب`);
  const t = v.trim();
  if (required && !t) return BAD(`${label} مطلوب`);
  if (t.length > max) return BAD(`${label}: الحد ${toArabicDigits(max)} حرفًا`);
  return t;
}

function isoOrNull(v: unknown, label: string): string | null | OfferInputResult {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return BAD(`${label}: تاريخ غير صالح`);
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return BAD(`${label}: تاريخ غير صالح`);
  return new Date(t).toISOString();
}

function intIn(v: unknown, min: number, max: number, label: string): number | OfferInputResult {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    return BAD(`${label}: عدد صحيح من ${toArabicDigits(min)} إلى ${toArabicDigits(max)}`);
  }
  return v;
}

const failed = (v: unknown): v is { ok: false; error: string } => isObject(v) && v.ok === false;

/**
 * The admin's body (camelCase) → the columns to write. `existing` is the row
 * being edited (null on create): on create the required fields must be
 * there; on edit only the fields sent are written. A founder-linked row
 * refuses any change to its audience, seats or plan (FOUNDER_LOCKED_AR).
 * `knownPlanRefs`: the price-book ids a plan_ref may name.
 */
export function offerInputToColumns(
  body: unknown,
  existing: (Pick<OfferRow, "campaign_id" | "starts_at" | "ends_at"> & Partial<Pick<OfferRow, "audience_account_types" | "audience_verification">>) | null,
  knownPlanRefs: ReadonlySet<string>,
): OfferInputResult {
  if (!isObject(body)) return BAD("صيغة الطلب غير صالحة");
  const create = existing === null;
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.hasOwn(body, k);

  if (existing?.campaign_id && LOCKED_ON_CAMPAIGN.some((k) => has(k))) return BAD(FOUNDER_LOCKED_AR);
  if (has("campaignId") || has("slug") || has("requiresInviteCode")) return BAD("حقل غير قابل للتعديل");

  if (create || has("title")) {
    const t = text(body.title, OFFER_TITLE_MAX, "العنوان", true);
    if (failed(t)) return t;
    out.title = t;
  }
  if (create || has("body")) {
    const t = body.body === undefined ? "" : text(body.body, OFFER_BODY_MAX, "النص", false);
    if (failed(t)) return t;
    out.body = t;
  }
  if (create || has("ctaLabel")) {
    const t = text(body.ctaLabel, OFFER_CTA_LABEL_MAX, "نص الزر", true);
    if (failed(t)) return t;
    out.cta_label = t;
  }
  if (create || has("ctaHref")) {
    const href = typeof body.ctaHref === "string" ? body.ctaHref.trim() : body.ctaHref;
    if (!isSameSitePath(href)) return BAD("رابط الزر: مسار داخل الموقع يبدأ بـ / (مثل /founder)");
    out.cta_href = href;
  }
  if (has("mediaUrl") || has("mediaKind")) {
    const url = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : null;
    if (!url) {
      out.media_url = null;
      out.media_kind = null;
    } else {
      if (!isMediaUrl(url)) return BAD("رابط الصورة أو الفيديو: https:// أو مسار داخل الموقع");
      if (body.mediaKind !== "image" && body.mediaKind !== "video") return BAD("نوع الوسائط: صورة أو فيديو");
      out.media_url = url;
      out.media_kind = body.mediaKind;
    }
  }
  if (create || has("audience")) {
    const a = body.audience;
    if (!Array.isArray(a) || a.length === 0) return BAD("اختر نوع حساب واحدًا على الأقل");
    if (!a.every((k) => (OFFER_AUDIENCE_KEYS as readonly unknown[]).includes(k))) return BAD("نوع حساب غير معروف");
    out.audience_account_types = OFFER_AUDIENCE_KEYS.filter((k) => a.includes(k));
  }
  if (create || has("verification")) {
    const v = body.verification ?? "any";
    if (!(OFFER_VERIFICATIONS as readonly unknown[]).includes(v)) return BAD("حالة التوثيق غير معروفة");
    out.audience_verification = v;
  }
  if (create || has("excludeBuyers")) {
    const v = body.excludeBuyers ?? true;
    if (typeof v !== "boolean") return BAD("استثناء المشترين: نعم أو لا");
    out.exclude_buyers = v;
  }
  if (create || has("planRef")) {
    const v = typeof body.planRef === "string" ? body.planRef.trim() : body.planRef;
    if (v === null || v === undefined || v === "") out.plan_ref = null;
    else if (typeof v !== "string" || !knownPlanRefs.has(v)) return BAD("البند المرتبط ليس من قائمة الأسعار");
    else out.plan_ref = v;
  }
  if (create || has("startsAt")) {
    const v = isoOrNull(body.startsAt ?? null, "البداية");
    if (failed(v)) return v;
    out.starts_at = v;
  }
  if (create || has("endsAt")) {
    const v = isoOrNull(body.endsAt ?? null, "النهاية");
    if (failed(v)) return v;
    out.ends_at = v;
  }
  // l11 O17: a guest offer is for every visitor — verification "any" (the
  // stored values when this edit does not send them; a CHECK backs it)
  const audience = (Object.hasOwn(out, "audience_account_types") ? out.audience_account_types : existing?.audience_account_types ?? []) as string[];
  const verification = Object.hasOwn(out, "audience_verification") ? out.audience_verification : existing?.audience_verification ?? "any";
  if (audience.includes(GUEST_AUDIENCE) && verification !== "any") return BAD(GUEST_NEEDS_ANY_AR);
  const starts = (Object.hasOwn(out, "starts_at") ? out.starts_at : existing?.starts_at ?? null) as string | null;
  const ends = (Object.hasOwn(out, "ends_at") ? out.ends_at : existing?.ends_at ?? null) as string | null;
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) return BAD("النهاية يجب أن تكون بعد البداية");

  if (create || has("seatsTotal")) {
    const v = body.seatsTotal ?? null;
    if (v === null || v === "") out.seats_total = null;
    else {
      const n = intIn(v, 1, 1_000_000, "عدد المقاعد");
      if (failed(n)) return n;
      out.seats_total = n;
    }
  }
  if (create || has("seatsUsed")) {
    const n = intIn(body.seatsUsed ?? 0, 0, 1_000_000, "المقاعد المستهلكة يدويًا");
    if (failed(n)) return n;
    out.seats_used = n;
  }
  if (create || has("priority")) {
    const n = intIn(body.priority ?? 0, OFFER_PRIORITY_MIN, OFFER_PRIORITY_MAX, "الأولوية");
    if (failed(n)) return n;
    out.priority = n;
  }
  if (create || has("status")) {
    const v = body.status ?? "draft";
    if (!(OFFER_STATUSES as readonly unknown[]).includes(v)) return BAD("الحالة: مسودة أو فعّال أو متوقف");
    out.status = v;
  }
  if (create || has("returnMinutes")) {
    const n = intIn(body.returnMinutes ?? DEFAULT_RETURN_MINUTES, 1, MAX_RETURN_MINUTES, "مدة عودة النافذة بالدقائق");
    if (failed(n)) return n;
    out.dismiss_return_minutes = n;
  }
  if (!create && Object.keys(out).length === 0) return BAD("لا توجد حقول للتحديث");
  return { ok: true, values: out };
}

/** The admin list's row: the offer, minus requires_invite_code, plus its stats. */
export interface AdminOfferDto {
  id: string;
  slug: string | null;
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  ctaLabel: string;
  ctaHref: string;
  audience: string[];
  verification: OfferVerification;
  excludeBuyers: boolean;
  planRef: string | null;
  campaignLinked: boolean;
  startsAt: string | null;
  endsAt: string | null;
  seatsTotal: number | null;
  seatsUsed: number;
  priority: number;
  status: OfferStatus;
  returnMinutes: number;
  updatedAt: string;
  /** Open right now on the server clock (status, window, seats); reason when closed. */
  openNow: boolean;
  closedReason: OfferClosedReason | null;
  seatsLeft: number | null;
  stats: { impressions: number; dismissals: number; clicks: number; reachedUsers: number; purchases: number | null };
}

export const CLOSED_REASON_AR: Readonly<Record<OfferClosedReason, string>> = Object.freeze({
  draft: "مسودة",
  paused: "متوقف",
  not_started: "لم يبدأ بعد",
  ended: "انتهت مدته",
  sold_out: "اكتملت المقاعد",
  campaign_closed: "الحملة غير مفتوحة الآن",
});
