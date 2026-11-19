/**
 * offersServer.ts — the database half of the offers system (owner item 5).
 * Every read and write here is the SERVICE client's: the three tables have
 * RLS on with no policy and no session privilege (20261128_50), so a browser
 * can never read an offer that is not meant for it — the routes hand each
 * user only what offerRules.ts lets through.
 *
 * Nothing here touches seats, reservations or payments: the founder offer
 * READS the campaign (founder_campaign + founder_seat_summary(), the same two
 * reads GET /api/v1/campaigns/active makes) and payment_orders (paid orders
 * of the offer's plan_ref: "already bought" and the purchases count).
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { FOUNDER_CAMPAIGN_ID } from "@/lib/membership/founderPlan";
import {
  FOUNDER_MEMBERSHIP_ON_SALE,
  founderSummaryFromRpc,
  founderWindow,
  type FounderSeatSummary,
} from "@/lib/pricing/campaigns";
import {
  FOUNDER_OFFER_SLUG,
  OFFER_COLUMNS,
  audienceKeyFor,
  compareOffers,
  founderOfferCopyFromRow,
  offerAvailability,
  offerCardDto,
  offerMatchesViewer,
  pickPopup,
  type AdminOfferDto,
  type CampaignState,
  type DismissalRow,
  type FounderOfferCopy,
  type OfferRow,
  type OfferViewer,
  type OffersReply,
} from "./offerRules";

export const isMissingTable = (code: string | undefined | null) => code === "42P01" || code === "PGRST205";

/** Thrown for a failed read the route answers 503 to. */
export class OffersReadError extends Error {}

type Db = SupabaseClient;

// ── the founder campaign (read only) ────────────────────────────────────────

/** The founder campaign now, or null when it is not configured or could not be read. */
export async function readFounderCampaignState(db: Db, now: Date): Promise<CampaignState | null> {
  if (!FOUNDER_MEMBERSHIP_ON_SALE) return null;
  const { data, error } = await db.from("platform_settings").select("value").eq("key", "founder_campaign").maybeSingle();
  if (error) return null;
  const value = (data as { value?: unknown } | null)?.value ?? null;
  if (!founderWindow(value, null, now, FOUNDER_MEMBERSHIP_ON_SALE)) return null;
  let summary: FounderSeatSummary | null = null;
  const rpc = await db.rpc("founder_seat_summary");
  if (!rpc.error) summary = founderSummaryFromRpc(rpc.data);
  const w = founderWindow(value, summary, now, FOUNDER_MEMBERSHIP_ON_SALE);
  if (!w) return null;
  return { state: w.state, seatsLeft: w.seatsLeft, capacity: w.seatsTotal, endsAtExclusive: w.endsAtExclusive };
}

// ── the viewer ──────────────────────────────────────────────────────────────

async function verificationOf(db: Db, table: "lawyer_profiles" | "firm_profiles" | "business_profiles", column: "user_id" | "owner_user_id", userId: string): Promise<boolean | null> {
  const { data, error } = await db.from(table).select("verification_status").eq(column, userId).limit(1);
  if (error) return null;
  const row = Array.isArray(data) ? (data[0] as { verification_status?: unknown } | undefined) : undefined;
  return row ? row.verification_status === "verified" : false;
}

/** Who is looking: audience key, verification, what he already bought. */
export async function readViewer(db: Db, userId: string, planRefs: readonly string[], wantsFounderSeat: boolean): Promise<OfferViewer> {
  const profile = await db.from("profiles").select("user_type, verified_at, nafath_verified").eq("id", userId).maybeSingle();
  if (profile.error) throw new OffersReadError(`profile: ${profile.error.code}`);
  const p = (profile.data ?? null) as { user_type?: unknown; verified_at?: unknown; nafath_verified?: unknown } | null;
  if (!p) return { audience: null, verified: null, boughtPlanRefs: new Set(), founderSeat: false };

  let practiceKind: unknown = null;
  let verified: boolean | null = null;
  let pendingVerification = false;
  if (p.user_type === "lawyer") {
    const lp = await db.from("lawyer_profiles").select("practice_kind, verification_status").eq("user_id", userId).maybeSingle();
    // Fail closed: an unread practice kind would read a consultant as an advocate.
    if (lp.error) throw new OffersReadError(`lawyer profile: ${lp.error.code}`);
    const row = (lp.data ?? null) as { practice_kind?: unknown; verification_status?: unknown } | null;
    practiceKind = row?.practice_kind ?? null;
    verified = row ? row.verification_status === "verified" : false;
    // l9 row 24: a pending licence may still be offered the founder seat (offerMatchesViewer).
    pendingVerification = row?.verification_status === "pending";
  } else if (p.user_type === "firm") {
    verified = await verificationOf(db, "firm_profiles", "owner_user_id", userId);
  } else if (p.user_type === "corporate") {
    verified = await verificationOf(db, "business_profiles", "owner_user_id", userId);
  } else if (p.user_type === "individual") {
    verified = Boolean(p.verified_at) || p.nafath_verified === true;
  }
  const audience = audienceKeyFor(p.user_type, practiceKind);

  const bought = new Set<string>();
  if (audience && planRefs.length) {
    const orders = await db
      .from("payment_orders")
      .select("item_id")
      .eq("user_id", userId)
      .eq("status", "paid")
      .in("item_id", [...planRefs])
      .limit(100);
    if (orders.error) throw new OffersReadError(`orders: ${orders.error.code}`);
    for (const o of (orders.data ?? []) as Array<{ item_id?: unknown }>) if (typeof o.item_id === "string") bought.add(o.item_id);
  }

  let founderSeat = false;
  if (audience && wantsFounderSeat) {
    const seat = await db
      .from("founder_seats")
      .select("id")
      .eq("user_id", userId)
      .eq("campaign_id", FOUNDER_CAMPAIGN_ID)
      .in("status", ["active", "pending_verification"])
      .limit(1);
    if (seat.error && !isMissingTable(seat.error.code)) throw new OffersReadError(`founder seat: ${seat.error.code}`);
    founderSeat = !seat.error && Array.isArray(seat.data) && seat.data.length > 0;
  }
  return { audience, verified, pendingVerification, boughtPlanRefs: bought, founderSeat };
}

/** Paid orders of `planRef` since `sinceIso` (all buyers) — an offer's own seats and its purchases stat. */
export async function countPurchases(db: Db, planRef: string, sinceIso: string | null, untilIso: string | null = null): Promise<number | null> {
  let q = db.from("payment_orders").select("id", { count: "exact", head: true }).eq("item_id", planRef).eq("status", "paid");
  if (sinceIso) q = q.gte("paid_at", sinceIso);
  if (untilIso) q = q.lt("paid_at", untilIso);
  const { count, error } = await q;
  if (error) return null;
  return typeof count === "number" ? count : null;
}

// ── GET /api/v1/offers ──────────────────────────────────────────────────────

const EMPTY: OffersReply = { offers: [], popupId: null, sessionKey: null };

/** The popup's per-sign-in key: changes whenever the user signs in again. */
export function sessionKeyFor(user: Pick<User, "id" | "last_sign_in_at">): string {
  return `${user.id}:${user.last_sign_in_at ?? "-"}`;
}

/**
 * The offers this user may see now, in display order, and the one the popup
 * shows. Before 20261128_50 runs: no offers. A failed read of the user or
 * his orders throws OffersReadError (the route answers 503, the browser
 * shows nothing): an offer is never shown on a guess.
 */
export async function loadOffersForUser(db: Db, user: Pick<User, "id" | "last_sign_in_at">, now: Date): Promise<OffersReply> {
  const rows = await db.from("offers").select(OFFER_COLUMNS).eq("status", "active").order("priority", { ascending: false }).limit(50);
  if (rows.error) {
    if (isMissingTable(rows.error.code)) return { ...EMPTY, sessionKey: sessionKeyFor(user) };
    throw new OffersReadError(`offers: ${rows.error.code}`);
  }
  const active = ((rows.data ?? []) as unknown as OfferRow[]).slice().sort(compareOffers);
  if (active.length === 0) return { ...EMPTY, sessionKey: sessionKeyFor(user) };

  const planRefs = [...new Set(active.map((r) => r.plan_ref).filter((r): r is string => !!r))];
  const viewer = await readViewer(db, user.id, planRefs, active.some((r) => r.campaign_id === FOUNDER_CAMPAIGN_ID));
  const mine = active.filter((r) => offerMatchesViewer(r, viewer));
  if (mine.length === 0) return { ...EMPTY, sessionKey: sessionKeyFor(user) };

  const nowMs = now.getTime();
  const campaign = mine.some((r) => r.campaign_id) ? await readFounderCampaignState(db, now) : null;
  const open: Array<{ row: OfferRow; card: ReturnType<typeof offerCardDto> }> = [];
  for (const row of mine) {
    let purchases = 0;
    if (!row.campaign_id && row.seats_total !== null && row.plan_ref) {
      const n = await countPurchases(db, row.plan_ref, row.starts_at ?? row.created_at, row.ends_at);
      if (n === null) continue; // seats unknown: never shown on a guess
      purchases = n;
    }
    const a = offerAvailability(row, nowMs, { purchases, campaign });
    if (a.open) open.push({ row, card: offerCardDto(row, a) });
  }
  if (open.length === 0) return { ...EMPTY, sessionKey: sessionKeyFor(user) };

  const dismissals = await db
    .from("offer_dismissals")
    .select("offer_id, dismissed_at")
    .eq("user_id", user.id)
    .in("offer_id", open.map((o) => o.row.id));
  // A failed read of the dismissals keeps the cards and opens no popup.
  const popup = dismissals.error ? null : pickPopup(open.map((o) => o.row), (dismissals.data ?? []) as DismissalRow[], nowMs);
  return { offers: open.map((o) => o.card), popupId: popup?.id ?? null, sessionKey: sessionKeyFor(user) };
}

// ── POST /api/v1/offers/[id]/events ─────────────────────────────────────────

export type OfferEventKind = "impression" | "dismiss" | "click";

/** The same event from the same user within this window counts once. */
const DEDUPE_MS: Readonly<Record<OfferEventKind, number>> = { impression: 30 * 60_000, click: 60_000, dismiss: 0 };

/**
 * Records one event of an ACTIVE offer. A dismissal also stamps
 * offer_dismissals (the popup's return clock). Returns false when the offer
 * is not active (or the tables are missing); throws on any other failure.
 */
export async function recordOfferEvent(db: Db, userId: string, offerId: string, kind: OfferEventKind, now: Date): Promise<boolean> {
  const offer = await db.from("offers").select("id, status").eq("id", offerId).maybeSingle();
  if (offer.error) {
    if (isMissingTable(offer.error.code)) return false;
    throw new OffersReadError(`offer: ${offer.error.code}`);
  }
  if (!offer.data || (offer.data as { status?: unknown }).status !== "active") return false;

  if (kind === "dismiss") {
    const prior = await db.from("offer_dismissals").select("dismiss_count").eq("offer_id", offerId).eq("user_id", userId).maybeSingle();
    if (prior.error) throw new OffersReadError(`dismissal: ${prior.error.code}`);
    const count = (prior.data as { dismiss_count?: unknown } | null)?.dismiss_count;
    const write = prior.data
      ? db.from("offer_dismissals").update({ dismissed_at: now.toISOString(), dismiss_count: (typeof count === "number" ? count : 1) + 1 }).eq("offer_id", offerId).eq("user_id", userId)
      : db.from("offer_dismissals").insert({ offer_id: offerId, user_id: userId, dismissed_at: now.toISOString() });
    const w = await write;
    if (w.error) throw new OffersReadError(`dismissal write: ${w.error.code}`);
  } else if (DEDUPE_MS[kind] > 0) {
    const since = new Date(now.getTime() - DEDUPE_MS[kind]).toISOString();
    const recent = await db
      .from("offer_events")
      .select("id")
      .eq("offer_id", offerId)
      .eq("user_id", userId)
      .eq("kind", kind)
      .gte("created_at", since)
      .limit(1);
    if (!recent.error && Array.isArray(recent.data) && recent.data.length > 0) return true;
  }
  const ev = await db.from("offer_events").insert({ offer_id: offerId, user_id: userId, kind });
  if (ev.error) throw new OffersReadError(`event: ${ev.error.code}`);
  return true;
}

// ── the founder banner / dashboard card copy ────────────────────────────────

/** The founder offer row's copy; null before 20261128_50 runs or on any read failure (callers keep their built-in copy). */
export async function readFounderOfferCopy(db: Db): Promise<FounderOfferCopy | null> {
  try {
    const { data, error } = await db
      .from("offers")
      .select("status, title, body, cta_label, cta_href")
      .eq("slug", FOUNDER_OFFER_SLUG)
      .maybeSingle();
    if (error || !data) return null;
    return founderOfferCopyFromRow(data);
  } catch {
    return null;
  }
}

// ── the admin list ──────────────────────────────────────────────────────────

interface CountsRow {
  offer_id: string;
  impressions: number | string;
  dismissals: number | string;
  clicks: number | string;
  reached_users: number | string;
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : 0);

export type AdminOffersResult = { migrationMissing: true } | { migrationMissing: false; offers: AdminOfferDto[]; statsError: boolean };

/** Every offer (newest edits first is the page's job) with its state now and its stats. */
export async function adminOffers(db: Db, now: Date): Promise<AdminOffersResult> {
  const rows = await db.from("offers").select(OFFER_COLUMNS).limit(500);
  if (rows.error) {
    if (isMissingTable(rows.error.code)) return { migrationMissing: true };
    throw new OffersReadError(`offers: ${rows.error.code}`);
  }
  const list = ((rows.data ?? []) as unknown as OfferRow[]).slice().sort(compareOffers);
  const counts = await db.rpc("offer_event_counts");
  const byOffer = new Map<string, CountsRow>();
  if (!counts.error) for (const c of (counts.data ?? []) as CountsRow[]) byOffer.set(c.offer_id, c);
  const campaign = list.some((r) => r.campaign_id) ? await readFounderCampaignState(db, now) : null;

  const out: AdminOfferDto[] = [];
  for (const r of list) {
    let purchases: number | null = null;
    if (r.plan_ref) {
      // The founder offer counts every paid founder order; another offer, those since it opened.
      purchases = r.campaign_id
        ? await countPurchases(db, r.plan_ref, null)
        : await countPurchases(db, r.plan_ref, r.starts_at ?? r.created_at, r.ends_at);
    }
    const a = offerAvailability(r, now.getTime(), { purchases: r.campaign_id ? 0 : purchases ?? 0, campaign });
    const c = byOffer.get(r.id);
    out.push({
      id: r.id,
      slug: r.slug,
      title: r.title,
      body: r.body,
      mediaUrl: r.media_url,
      mediaKind: r.media_kind,
      ctaLabel: r.cta_label,
      ctaHref: r.cta_href,
      audience: r.audience_account_types,
      verification: r.audience_verification,
      excludeBuyers: r.exclude_buyers,
      planRef: r.plan_ref,
      campaignLinked: r.campaign_id !== null,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      seatsTotal: r.seats_total,
      seatsUsed: r.seats_used,
      priority: r.priority,
      status: r.status,
      returnMinutes: r.dismiss_return_minutes,
      updatedAt: r.updated_at,
      openNow: a.open,
      closedReason: a.open ? null : a.reason,
      seatsLeft: a.seatsLeft,
      stats: {
        impressions: num(c?.impressions),
        dismissals: num(c?.dismissals),
        clicks: num(c?.clicks),
        reachedUsers: num(c?.reached_users),
        purchases,
      },
    });
  }
  return { migrationMissing: false, offers: out, statsError: Boolean(counts.error) };
}
