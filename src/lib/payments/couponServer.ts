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
 *     fulfilment writes). A failed, cancelled or voided order never consumed
 *     it, nor did a test-mode payment (live = false) or a paid order that
 *     granted nothing (metadata.already_entitled) — the same set the
 *     database's payment_orders_coupon_once_key counts (20261026_20).
 *   - then, when the coupon applies: the buyer's OTHER open orders carrying
 *     it (P7 review, finding 1). A fresh one (its intent still payable) for
 *     another item, or one a payment already reached, refuses the code —
 *     COUPON_PENDING_AR — so two tabs cannot both pay with one code. The
 *     same item's fresh open orders are left to checkout's supersede step
 *     (and the database guard answers the same 400 if one survives). An
 *     order whose intent has expired (COUPON_OPEN_ORDER_LIFETIME_MS) does not
 *     count for the preview; checkout closes it ('cancelled') once Moyasar
 *     lists no payment for it beyond a failed one, refuses when it lists
 *     one, and answers 503 when it cannot tell. An order a payment reached
 *     (3-D Secure abandoned) blocks for the sweep's 7-day lookback, then is
 *     closed the same way when Moyasar lists only failed / initiated
 *     payments for it — a code is never locked for good.
 *   - validateCouponWith — the preview behind POST /api/v1/coupons/validate:
 *     the same steps as checkout (account type, audience, the book's quote)
 *     and the same priceWithCoupon, so the preview equals the charge.
 *   - recordCouponUsage — fulfilment's half: one coupon_usage row for a paid
 *     LIVE order that carried a coupon and was granted, idempotent (unique
 *     order_id, 20261026_20). It never blocks what the buyer paid for.
 *   - releaseCouponUsage — the refund route's half: a void inside the
 *     90-minute window removes the order's row (the trigger lowers
 *     used_count); a later refund keeps the coupon used.
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient } from "./moyasarClient.ts";
import { buyerAllowed, formatHalalas, PAYABLE_ITEMS, quote, resolveItem, type Billing, type PayableItem } from "./catalog.ts";
import {
  applyDiscount,
  COUPON_INVALID_AR,
  COUPONS_UNAVAILABLE_AR,
  couponRefusalAr,
  evaluateCoupon,
  isFirstOrderCoupon,
  type CouponRow,
  type DiscountedQuote,
} from "./couponRules.ts";
import { isMissingPaymentsObject, SWEEP_LOOKBACK_MS } from "./fulfillDecision.ts";
import { isMissingFeatureColumn } from "../library/optionalColumn.ts";
import { activeLaunchPrice, bookEntry, PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";
import { SUPERSEDE_WINDOW_MS } from "./checkoutRules.ts";
import { COUPON_ATTEMPTS, RATE_LIMITED_AR, type CouponAttemptBudget } from "./couponAttempts.ts";

export const COUPON_COLUMNS =
  "id, code, discount_type, discount_value, min_order_amount, eligible_user_types, max_uses, used_count, valid_from, valid_until, active, max_discount_pct, excluded_kinds, metadata";

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
 * best one, and the item's own is it; pricing doc §13أ.3). Today that is a
 * launch price RUNNING on `now` for this billing (owner ٣٠٣) — the same rule
 * quote() charges by, so the coupon is refused exactly while the launch price
 * is charged, and accepted again on the listed price once the campaign ends.
 * P3 (the founder membership) must keep its discounted prices visible here.
 */
export function itemIsDiscounted(
  itemId: string,
  billing: Billing,
  now: Date,
  book: Readonly<Record<string, BookEntry>> = PRICE_BOOK,
): boolean {
  const entry = bookEntry(itemId, book);
  return !!entry && activeLaunchPrice(entry, billing, now) !== null;
}

/** The code sits on another of the buyer's orders that may still be paid. */
export const COUPON_PENDING_AR = "هذا الكود مستخدم في طلب آخر قيد الدفع — أكمل ذلك الطلب أو ألغِه";

/** The database's backstop (20261026_20): one counted order per (buyer, coupon). */
export const COUPON_ORDER_INDEX = "payment_orders_coupon_once_key";

/** True for the unique violation of COUPON_ORDER_INDEX (and of no other key). */
export function isCouponOrderConflict(error: DbError): boolean {
  return error?.code === "23505" && typeof error.message === "string" && error.message.includes(COUPON_ORDER_INDEX);
}

/**
 * An intent lives one hour from creation (checkoutRules.SUPERSEDE_WINDOW_MS
 * adds a margin): after that no one can pay with it, so an open order older
 * than this that no payment reached is abandoned.
 */
export const COUPON_OPEN_ORDER_LIFETIME_MS = SUPERSEDE_WINDOW_MS;

export type CouponPricing =
  | { ok: true; coupon: { id: string; code: string }; quote: DiscountedQuote }
  | { ok: false; status: 400 | 503; error: string };

export interface CouponPricingInput {
  code: string;
  userId: string;
  userType: string | null;
  item: Pick<PayableItem, "id" | "kind">;
  billing: Billing;
  netHalalas: number;
  now: Date;
  book?: Readonly<Record<string, BookEntry>>;
  /**
   * Checkout passes its Moyasar client: an expired open order carrying the
   * code is then closed when no payment reached it. The preview passes
   * nothing (undefined) and only ignores such an order; null = checkout with
   * no way to ask Moyasar (answers 503 rather than guess).
   */
  gateway?: Pick<MoyasarClient, "listPaymentsByOrder"> | null;
}

const unavailable = (): CouponPricing => ({ ok: false, status: 503, error: COUPONS_UNAVAILABLE_AR });

/**
 * Whether a paid / refunded order consumed its coupon: not a test-mode
 * payment (live = false) and not one that granted nothing (already_entitled).
 * Decided here, not in a PostgREST filter: a `neq` on a JSON key drops every
 * row where the key is absent — nearly every order.
 */
export function orderConsumedCoupon(row: { live?: boolean | null; metadata?: Record<string, unknown> | null }): boolean {
  if (row.live === false) return false;
  return row.metadata?.already_entitled !== true;
}

/**
 * Owner ٣٠٥: whether the buyer already has a paid order on the platform — of
 * any kind, for any item: a PAID or REFUNDED payment_orders row. A voided
 * order (cancelled inside the 90-minute window, ٣٠٦) does not count, nor does
 * one still open, failed or cancelled. null = could not tell: the caller
 * refuses rather than guesses.
 */
async function hasEarlierPaidOrder(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from("payment_orders")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["paid", "refunded"])
    .limit(1);
  if (error) {
    console.error("[coupons] reading earlier paid orders failed:", error.code);
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}

/** null = could not tell (an error): the caller refuses rather than guesses. */
async function alreadyUsed(admin: SupabaseClient, couponId: string, userId: string): Promise<boolean | null> {
  const [orders, usage] = await Promise.all([
    admin
      .from("payment_orders")
      .select("id, live, metadata")
      .eq("user_id", userId)
      .in("status", ["paid", "refunded"])
      .eq("metadata->coupon->>id", couponId)
      .limit(50),
    admin.from("coupon_usage").select("id").eq("coupon_id", couponId).eq("user_id", userId).limit(1),
  ]);
  if (orders.error || usage.error) {
    console.error("[coupons] reading earlier use failed:", orders.error?.code ?? usage.error?.code);
    return null;
  }
  const rows = Array.isArray(orders.data)
    ? (orders.data as Array<{ live?: boolean | null; metadata?: Record<string, unknown> | null }>)
    : [];
  return rows.some(orderConsumedCoupon) || (Array.isArray(usage.data) && usage.data.length > 0);
}

// ── the buyer's other open orders carrying the code (finding 1) ────────────

export interface OpenCouponOrderRow {
  id: string;
  item_id: string;
  status: string;
  created_at: string;
  moyasar_intent_id: string | null;
  moyasar_payment_id: string | null;
}

/**
 * The buyer's open orders carrying the coupon, sorted:
 *   - blocking: still payable (younger than the intent lifetime) and for
 *     ANOTHER item; or a payment already reached it (moyasar_payment_id — a
 *     3-D Secure page still open, say) and it is younger than the sweep's
 *     lookback (SWEEP_LOOKBACK_MS, 7 days): the sweep / webhook may still
 *     settle it;
 *   - stale: expired with no payment id; or reached and older than the
 *     sweep's lookback — nothing settles it any more, so it must not lock the
 *     code forever. Closed only after staleOrderClosable;
 *   - the rest (the same item, still fresh) are checkout's supersede step.
 */
export function sortOpenCouponOrders(
  rows: readonly OpenCouponOrderRow[] | null | undefined,
  itemId: string,
  nowMs: number,
): { blocking: OpenCouponOrderRow[]; stale: OpenCouponOrderRow[] } {
  const blocking: OpenCouponOrderRow[] = [];
  const stale: OpenCouponOrderRow[] = [];
  for (const r of rows ?? []) {
    if (r.status !== "created" && r.status !== "initiated") continue;
    const created = Date.parse(r.created_at);
    // an unreadable date is treated as fresh: never closed on a guess
    const age = Number.isFinite(created) ? nowMs - created : 0;
    if (r.moyasar_payment_id) {
      if (age >= SWEEP_LOOKBACK_MS) stale.push(r);
      else blocking.push(r);
      continue;
    }
    const expired = age >= COUPON_OPEN_ORDER_LIFETIME_MS;
    if (expired) stale.push(r);
    else if (r.item_id !== itemId) blocking.push(r);
  }
  return { blocking, stale };
}

/**
 * A stale open order may be closed only when no payment can still settle it:
 *   - no intent ever left the server ('created', no intent / payment id);
 *   - or Moyasar lists only failed payments for the order;
 *   - or, once the order is older than the sweep's lookback (7 days — past
 *     it nothing tries to settle the order), only failed and `initiated`
 *     ones (a 3-D Secure page abandoned long ago).
 * A paid / authorized / captured / refunded / voided payment (or any other
 * status) keeps it open for an admin; so does a reached order that Moyasar
 * lists nothing for, or a listing that failed. A very late paid webhook on a
 * closed order still leaves metadata.paid_unmatched for an admin
 * (fulfillCore).
 */
export function staleOrderClosable(
  row: Pick<OpenCouponOrderRow, "status" | "moyasar_intent_id" | "moyasar_payment_id" | "created_at">,
  listed: ReadonlyArray<{ status: string }> | null,
  nowMs: number,
): boolean {
  if (row.status === "created" && !row.moyasar_intent_id && !row.moyasar_payment_id) return true;
  if (!listed) return false;
  if (row.moyasar_payment_id && listed.length === 0) return false;
  const created = Date.parse(row.created_at);
  const pastLookback = Number.isFinite(created) && nowMs - created >= SWEEP_LOOKBACK_MS;
  return listed.every((p) => p.status === "failed" || (pastLookback && p.status === "initiated"));
}

type PendingOutcome = "clear" | "pending" | "unknown";

async function otherOpenOrders(
  admin: SupabaseClient,
  input: { couponId: string; userId: string; itemId: string; now: Date; gateway?: CouponPricingInput["gateway"] },
): Promise<PendingOutcome> {
  const { data, error } = await admin
    .from("payment_orders")
    .select("id, item_id, status, created_at, moyasar_intent_id, moyasar_payment_id")
    .eq("user_id", input.userId)
    .in("status", ["created", "initiated"])
    .eq("metadata->coupon->>id", input.couponId)
    .limit(20);
  if (error) {
    console.error("[coupons] reading the buyer's open orders failed:", error.code);
    return "unknown";
  }
  const { blocking, stale } = sortOpenCouponOrders(data as OpenCouponOrderRow[] | null, input.itemId, input.now.getTime());
  if (blocking.length > 0) return "pending";
  if (stale.length === 0 || input.gateway === undefined) return "clear"; // the preview: checkout closes them
  if (input.gateway === null) return "unknown";

  for (const row of stale) {
    let listed: Array<{ status: string }> | null = null;
    if (!(row.status === "created" && !row.moyasar_intent_id && !row.moyasar_payment_id)) {
      const r = await input.gateway.listPaymentsByOrder(row.id);
      if (!r.ok) {
        console.warn("[coupons] listing an expired order's payments failed:", row.id, r.status);
        return "unknown";
      }
      listed = r.data;
    }
    if (!staleOrderClosable(row, listed, input.now.getTime())) return "pending";
    const close = admin
      .from("payment_orders")
      .update({ status: "cancelled" })
      .eq("id", row.id)
      .eq("user_id", input.userId)
      .in("status", ["created", "initiated"]);
    // only the payment id that was judged (a new one landing meanwhile keeps it open)
    const { error: closeErr } = row.moyasar_payment_id
      ? await close.eq("moyasar_payment_id", row.moyasar_payment_id)
      : await close.is("moyasar_payment_id", null);
    if (closeErr) {
      console.error("[coupons] closing an expired couponed order failed:", row.id, closeErr.code);
      return "unknown";
    }
    console.info("[coupons] closed an expired couponed order no payment reached:", row.id);
  }
  return "clear";
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
  const earlier = isFirstOrderCoupon(row) ? await hasEarlierPaidOrder(admin, input.userId) : false;
  if (earlier === null) return unavailable();

  const decision = evaluateCoupon(row, {
    netHalalas: input.netHalalas,
    kind: input.item.kind,
    userType: input.userType,
    alreadyUsed: used,
    itemDiscounted: itemIsDiscounted(input.item.id, input.billing, input.now, input.book),
    hasEarlierPaidOrder: earlier,
    now: input.now,
  });
  if (!decision.ok) return { ok: false, status: 400, error: couponRefusalAr(decision, formatHalalas) };

  const pending = await otherOpenOrders(admin, {
    couponId: row.id,
    userId: input.userId,
    itemId: input.item.id,
    now: input.now,
    gateway: input.gateway,
  });
  if (pending === "unknown") return unavailable();
  if (pending === "pending") return { ok: false, status: 400, error: COUPON_PENDING_AR };
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
  /** The per-buyer try budget (couponAttempts.ts); the shared one unless a test passes its own. */
  attempts?: CouponAttemptBudget;
  now?: () => Date;
  catalog?: Readonly<Record<string, PayableItem>>;
  book?: Readonly<Record<string, BookEntry>>;
}

export type ValidateReply =
  | {
      status: 200;
      body: { code: string; quote: { listNet: number; discount: number; net: number; vat: number; total: number } };
    }
  | { status: 400 | 403 | 429 | 503; body: { error: string } };

const PREVIEW_FAILED_AR = "تعذّر التحقق من كود الخصم، حاول مرة أخرى بعد قليل";

export async function validateCouponWith(deps: ValidateDeps, input: ValidateInput): Promise<ValidateReply> {
  const { admin } = deps;
  // every preview spends a try (finding 4): the answer is an oracle
  const attempts = deps.attempts ?? COUPON_ATTEMPTS;
  if (!attempts.check(input.userId).ok) return { status: 429, body: { error: RATE_LIMITED_AR } };
  attempts.spend(input.userId);

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
  // the request's clock, as checkout's: the preview equals the charge (٣٠٣)
  const now = deps.now?.() ?? new Date();
  const q = quote(input.itemId, input.billing, catalog, now);
  if (!q.ok) return { status: 400, body: { error: COUPON_INVALID_AR } };

  const priced = await priceWithCoupon(admin, {
    code: input.code,
    userId: input.userId,
    userType,
    item: q.item,
    billing: input.billing,
    netHalalas: q.netHalalas,
    now,
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

export type CouponUsageOutcome = "none" | "test_mode" | "recorded" | "already_recorded" | "reused" | "not_recorded";

/**
 * One coupon_usage row for a PAID order that carried a coupon. Only a LIVE
 * payment consumes it (`live` is set by the claim): a test-mode payment
 * (staff / test accounts) never records a use nor counts toward used_count
 * ("test_mode"). The caller records only when the grant happened — never for
 * an «already entitled» order, which bought nothing. Idempotent:
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
  order: { id: string; user_id: string | null; live?: boolean | null; metadata: Record<string, unknown> | null },
): Promise<CouponUsageOutcome> {
  const coupon = orderCoupon(order.metadata);
  if (!coupon || !order.user_id) return "none";
  if (order.live !== true) return "test_mode";
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

/**
 * The void path of a refund (inside the 90-minute window): the order's
 * coupon_usage row is removed, so the coupon is the buyer's again (the
 * trigger lowers used_count; a voided order is outside the counted set). A
 * refund after the window keeps it used. Idempotent (deleting nothing is
 * fine); never fails the refund.
 */
export async function releaseCouponUsage(admin: SupabaseClient, orderId: string): Promise<boolean> {
  try {
    const { error } = await admin.from("coupon_usage").delete().eq("order_id", orderId);
    if (!error) return true;
    if (!isMissingPaymentsObject(error.code)) {
      console.error("[coupons] releasing a voided order's coupon failed:", orderId, error.code, error.message);
    }
    return false;
  } catch (err) {
    console.error("[coupons] releasing a voided order's coupon threw:", orderId, err instanceof Error ? err.message : err);
    return false;
  }
}
