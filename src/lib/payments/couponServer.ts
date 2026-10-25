/**
 * couponServer.ts — the database half of coupons (owner answers of 25 Oct
 * 2026, P7; pricing doc §13أ). Every read goes through the SERVICE client:
 * since 20261026_20 no session may read public.coupons or coupon_usage.
 *
 *   - couponsAvailable — whether 20261026_20 has run (its max_discount_pct /
 *     excluded_kinds columns exist). Before it, the checkout page hides the
 *     coupon field, the validate route answers COUPONS_UNAVAILABLE_AR, and
 *     checkout refuses a code (never charging the full price to a buyer who
 *     expected a discount).
 *   - priceWithCoupon — the coupon's row, whether this buyer already used it,
 *     and couponRules.evaluateCoupon over the quote. "Already used" is read
 *     from payment_orders (a PAID or REFUNDED order of this buyer whose
 *     metadata.coupon.id is this coupon — written in the same insert as the
 *     order, so it cannot be lost) and from coupon_usage (the ledger
 *     fulfilment writes). A failed or cancelled order never consumed it.
 *   - validateCouponWith — the preview behind POST /api/v1/coupons/validate:
 *     the same steps as checkout (account type, audience, the book's quote)
 *     and the same priceWithCoupon, so the preview equals the charge.
 *   - recordCouponUsage — fulfilment's half: one coupon_usage row for a paid
 *     order that carried a coupon, idempotent (unique order_id, 20261026_20).
 *     It never blocks what the buyer paid for.
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buyerAllowed, formatHalalas, PAYABLE_ITEMS, quote, resolveItem, type Billing, type PayableItem } from "./catalog.ts";
import {
  applyDiscount,
  COUPON_INVALID_AR,
  COUPONS_UNAVAILABLE_AR,
  couponRefusalAr,
  evaluateCoupon,
  type CouponRow,
  type DiscountedQuote,
} from "./couponRules.ts";
import { isMissingPaymentsObject } from "./fulfillDecision.ts";
import { isMissingFeatureColumn } from "../library/optionalColumn.ts";
import { bookEntry, PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";

export const COUPON_COLUMNS =
  "id, code, discount_type, discount_value, min_order_amount, eligible_user_types, max_uses, used_count, valid_from, valid_until, active, max_discount_pct, excluded_kinds";

type DbError = { code?: string; message?: string } | null | undefined;

/**
 * The columns 20261026_20 adds; an error naming one means it has not run
 * (the tolerant-read test of src/lib/library/optionalColumn.ts).
 */
function namesNewColumn(error: DbError): boolean {
  return isMissingFeatureColumn(error, "max_discount_pct") || isMissingFeatureColumn(error, "excluded_kinds");
}

/** True once 20261026_20 has run. Any error → false (the field stays hidden). */
export async function couponsAvailable(admin: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await admin.from("coupons").select("id, max_discount_pct, excluded_kinds").limit(1);
    if (!error) return true;
    if (!namesNewColumn(error) && !isMissingPaymentsObject(error.code)) {
      console.warn("[coupons] availability probe failed:", error.code, error.message);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * An item already sold at a discount takes no coupon (٢٧٩: one discount, the
 * best one, and the item's own is it). Today that is an entry with a launch /
 * campaign price; no entry has one yet, and quote() charges none. P3 (the
 * founder membership) and P5 (the individuals' launch prices) must keep their
 * discounted prices visible to this check.
 */
export function itemIsDiscounted(itemId: string, book: Readonly<Record<string, BookEntry>> = PRICE_BOOK): boolean {
  const entry = bookEntry(itemId, book);
  return !!entry?.launchPrices && entry.launchPrices.length > 0;
}

export type CouponPricing =
  | { ok: true; coupon: { id: string; code: string }; quote: DiscountedQuote }
  | { ok: false; status: 400 | 503; error: string };

export interface CouponPricingInput {
  code: string;
  userId: string;
  userType: string | null;
  item: Pick<PayableItem, "id" | "kind">;
  netHalalas: number;
  now: Date;
  book?: Readonly<Record<string, BookEntry>>;
}

const unavailable = (): CouponPricing => ({ ok: false, status: 503, error: COUPONS_UNAVAILABLE_AR });

/** null = could not tell (an error): the caller refuses rather than guesses. */
async function alreadyUsed(admin: SupabaseClient, couponId: string, userId: string): Promise<boolean | null> {
  const [orders, usage] = await Promise.all([
    admin
      .from("payment_orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["paid", "refunded"])
      .eq("metadata->coupon->>id", couponId)
      .limit(1),
    admin.from("coupon_usage").select("id").eq("coupon_id", couponId).eq("user_id", userId).limit(1),
  ]);
  if (orders.error || usage.error) {
    console.error("[coupons] reading earlier use failed:", orders.error?.code ?? usage.error?.code);
    return null;
  }
  return (Array.isArray(orders.data) && orders.data.length > 0) || (Array.isArray(usage.data) && usage.data.length > 0);
}

/** The coupon applied to one quote, or the refusal (same sentence for every unknown / used code). */
export async function priceWithCoupon(admin: SupabaseClient, input: CouponPricingInput): Promise<CouponPricing> {
  const { data, error } = await admin.from("coupons").select(COUPON_COLUMNS).eq("code", input.code).maybeSingle();
  if (error) {
    if (!namesNewColumn(error) && !isMissingPaymentsObject(error.code)) {
      console.error("[coupons] reading the coupon failed:", error.code, error.message);
    }
    return unavailable();
  }
  const row = data as CouponRow | null;
  if (!row) return { ok: false, status: 400, error: COUPON_INVALID_AR };

  const used = await alreadyUsed(admin, row.id, input.userId);
  if (used === null) return unavailable();

  const decision = evaluateCoupon(row, {
    netHalalas: input.netHalalas,
    kind: input.item.kind,
    userType: input.userType,
    alreadyUsed: used,
    itemDiscounted: itemIsDiscounted(input.item.id, input.book),
    now: input.now,
  });
  if (!decision.ok) return { ok: false, status: 400, error: couponRefusalAr(decision, formatHalalas) };
  return {
    ok: true,
    coupon: { id: row.id, code: row.code },
    quote: applyDiscount(input.netHalalas, decision.discountHalalas),
  };
}

// ── the preview: POST /api/v1/coupons/validate ─────────────────────────────

export interface ValidateInput {
  userId: string;
  code: string;
  itemId: string;
  billing: Billing;
}

export interface ValidateDeps {
  admin: SupabaseClient;
  now?: () => Date;
  catalog?: Readonly<Record<string, PayableItem>>;
  book?: Readonly<Record<string, BookEntry>>;
}

export type ValidateReply =
  | {
      status: 200;
      body: { code: string; quote: { listNet: number; discount: number; net: number; vat: number; total: number } };
    }
  | { status: 400 | 403 | 503; body: { error: string } };

const PREVIEW_FAILED_AR = "تعذّر التحقق من كود الخصم، حاول مرة أخرى بعد قليل";

export async function validateCouponWith(deps: ValidateDeps, input: ValidateInput): Promise<ValidateReply> {
  const { admin } = deps;
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("user_type")
    .eq("id", input.userId)
    .maybeSingle();
  if (profileErr || !profile) return { status: 503, body: { error: PREVIEW_FAILED_AR } };
  const rawType = (profile as { user_type?: unknown }).user_type;
  const userType = typeof rawType === "string" ? rawType : null;

  const catalog = deps.catalog ?? PAYABLE_ITEMS;
  const known = resolveItem(input.itemId, catalog);
  if (!known || !buyerAllowed(known, userType)) return { status: 400, body: { error: COUPON_INVALID_AR } };
  const q = quote(input.itemId, input.billing, catalog);
  if (!q.ok) return { status: 400, body: { error: COUPON_INVALID_AR } };

  const priced = await priceWithCoupon(admin, {
    code: input.code,
    userId: input.userId,
    userType,
    item: q.item,
    netHalalas: q.netHalalas,
    now: deps.now?.() ?? new Date(),
    book: deps.book,
  });
  if (!priced.ok) return { status: priced.status, body: { error: priced.error } };
  const d = priced.quote;
  return {
    status: 200,
    body: {
      code: priced.coupon.code,
      quote: { listNet: d.listNetHalalas, discount: d.discountHalalas, net: d.netHalalas, vat: d.vatHalalas, total: d.totalHalalas },
    },
  };
}

// ── fulfilment: the ledger row ──────────────────────────────────────────────

/** The coupon an order carried (payment_orders.metadata.coupon, written by checkout), or null. */
export function orderCoupon(
  metadata: Record<string, unknown> | null | undefined,
): { id: string; code: string; discountHalalas: number } | null {
  const c = metadata?.coupon as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return null;
  if (typeof c.id !== "string" || !c.id) return null;
  const discount = Number(c.discount_halalas);
  return {
    id: c.id,
    code: typeof c.code === "string" ? c.code : "",
    discountHalalas: Number.isSafeInteger(discount) && discount > 0 ? discount : 0,
  };
}

export type CouponUsageOutcome = "none" | "recorded" | "already_recorded" | "reused" | "not_recorded";

/**
 * One coupon_usage row for a PAID order that carried a coupon. Idempotent:
 * the unique order_id guard makes a retry a no-op ("already_recorded"). A
 * unique (coupon, user) conflict from ANOTHER order means the buyer paid two
 * couponed orders opened at the same time ("reused"): the order is still
 * fulfilled (he paid it) and the caller marks it for admin review. Any other
 * failure is logged and never blocks the grant ("not_recorded"): the
 * once-per-user check reads paid orders first, so a missing ledger row does
 * not reopen the coupon.
 */
export async function recordCouponUsage(
  admin: SupabaseClient,
  order: { id: string; user_id: string | null; metadata: Record<string, unknown> | null },
): Promise<CouponUsageOutcome> {
  const coupon = orderCoupon(order.metadata);
  if (!coupon || !order.user_id) return "none";
  try {
    const { error } = await admin.from("coupon_usage").insert({
      coupon_id: coupon.id,
      user_id: order.user_id,
      order_id: order.id,
      discount_applied: coupon.discountHalalas / 100,
    });
    if (!error) return "recorded";
    if (error.code === "23505") {
      const { data: mine, error: readErr } = await admin
        .from("coupon_usage")
        .select("id")
        .eq("order_id", order.id)
        .limit(1);
      if (!readErr && Array.isArray(mine) && mine.length > 0) return "already_recorded";
      console.error("[coupons] a coupon was paid twice by one buyer — admin review:", order.id, coupon.code);
      return "reused";
    }
    console.error("[coupons] recording the coupon use failed (the grant goes on):", order.id, error.code, error.message);
    return "not_recorded";
  } catch (err) {
    console.error("[coupons] recording the coupon use threw:", order.id, err instanceof Error ? err.message : err);
    return "not_recorded";
  }
}
