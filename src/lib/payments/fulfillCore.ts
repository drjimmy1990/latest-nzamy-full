/**
 * fulfillCore.ts — the ONE place a Moyasar payment becomes a purchase
 * (Moyasar payments B1, Task 5), with its IO injected. ./fulfillOrder.ts wires
 * the real service client, Moyasar client and notifier; the tests drive this
 * file with fakes (fulfillCore.test.ts). Three callers reach it, possibly at
 * the same time for the same payment:
 *   - the result page the payer returns to (callback),
 *   - the webhook (passes the body's `live` as `liveFlag`),
 *   - the sweep, POST /api/v1/cron/payments-sweep (passes `resume: true`).
 *
 * The steps:
 *   1. read the order; fetch the payment from Moyasar with the platform key;
 *   2. fulfillDecision (./fulfillDecision.ts) — the payment must name this
 *      order and match its amount, currency and mode;
 *   3. on 'grant', claim the order: claim_payment_order (20261022_30) sets
 *      status 'paid', the payment id, the mode, paid_at and the receipt number
 *      in ONE conditional UPDATE. One row back: this call claimed it. Zero
 *      rows: another call already did → 'already_done';
 *   4. save the card token (plans only) — before the grant, because the
 *      subscription row points at the saved card;
 *   5. grantPurchase (./grantPurchase.ts); the coupon the order carried (P7,
 *      metadata.coupon) is recorded in coupon_usage — only now that the order
 *      is paid, only for a live payment and only when the grant happened
 *      (not «already entitled»), idempotent per order, never blocking the
 *      grant (a coupon paid twice by one buyer — which checkout and
 *      payment_orders_coupon_once_key now refuse — is still fulfilled and
 *      marked metadata.coupon_reused for admin review); then fulfilled_at =
 *      now() — only while it is still null, so exactly one call stamps it;
 *   6. the Arabic in-app notification, sent by the call that stamped.
 *
 * A grant failure after the claim leaves fulfilled_at null; the sweep resumes
 * such an order (no Moyasar call needed: the claim already verified the
 * payment) once RESUME_AFTER_MS has passed since the claim, so it never races
 * the call that claimed it. Every grant is keyed on the order and never
 * grants twice (see grantPurchase.ts).
 *
 * When the user already holds a better plan, nothing is replaced: the order
 * is stamped fulfilled with metadata.already_entitled = true and the user is
 * told the administration will review a refund — the outcome is
 * 'already_done' with reason 'already_entitled'.
 *
 * Money that bought nothing leaves a durable trace: whenever the fetched
 * payment is PAID and does not settle the order (a rejected payment, a closed
 * order, a payment already on another order), metadata.paid_unmatched =
 * {payment_id, reason, at} is MERGED into the order (merge_payment_order_metadata,
 * 20261022_30 — other keys are never overwritten).
 *
 * The founder membership (P3, kind 'membership', 20261101_10):
 *   - the grant is founder_activate (grantPurchase.ts). A paid order that
 *     gets no seat (seat_unavailable / not_verified / already_member) takes
 *     the «already entitled» path above: stamped fulfilled, flagged
 *     already_entitled, the payer told the administration will review a
 *     refund — and every admin alerted ONCE (deps.notifyAdmins), by the call
 *     that stamped, so a retry or a second caller never alerts again;
 *   - a dead membership payment frees its reserved seat at once
 *     (deps.releaseFounderSeat → founder_release_order): when this call
 *     records the failure, and whenever a failed / voided / cancelled
 *     membership order is seen again. The webhook, the result page and the
 *     sweep all reach it through here. Best-effort: a release that fails
 *     changes no answer (the sweep's founder_release_expired catches it
 *     within the 2-hour reservation, releaseExpiredFounderSeats below).
 *
 * Deploy order: a missing table, column or function of the B1 migrations
 * (42P01 / 42703 / 42883 / PGRST202 / PGRST204 / PGRST205) answers 'pending',
 * logged once per step. Nothing here throws.
 *
 * Relative imports only (and type-only package imports): `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient, MoyasarPayment } from "./moyasarClient.ts";
import { resolveItem } from "./catalog.ts";
import { grantPurchase, type FounderRefundReason, type GrantPurchaseDeps } from "./grantPurchase.ts";
import { recordCouponUsage } from "./couponServer.ts";
import {
  fulfilmentNoticeAr,
  fulfillDecision,
  isMissingPaymentsObject,
  paidUnmatchedReason,
  pickPaidPayment,
  resumeAllowed,
} from "./fulfillDecision.ts";

export type FulfillOutcome = "granted" | "already_done" | "failed" | "pending" | "rejected";

export interface FulfillResult {
  outcome: FulfillOutcome;
  /**
   * Why, in machine words — except for 'failed', where it is Moyasar's own
   * message for the declined payment (shown to the payer). Notable values:
   * 'already_entitled' (already_done: paid, nothing replaced, refund review),
   * 'order_refunded' (already_done), 'claimed_elsewhere' (already_done:
   * another call is granting — not yet a success), 'fulfilment_in_progress'
   * (pending), 'gateway_disabled', 'schema_missing', 'payment_not_final'.
   */
  reason?: string;
  /** The receipt number once the order is paid. */
  receiptNumber?: string | null;
}

export interface FulfillOrderInput {
  orderId: string;
  /** The Moyasar payment id (callback `id`, webhook `data.id`, or the stored one). */
  paymentId: string;
  merchant: "platform" | "office";
  /** The webhook body's `live`; must agree with the gateway mode. */
  liveFlag?: boolean;
  /**
   * The sweep only: finish a paid order whose grant did not complete, once
   * RESUME_AFTER_MS has passed since the claim.
   */
  resume?: boolean;
}

/** The Moyasar calls fulfilment makes. */
export type GatewayClient = Pick<MoyasarClient, "mode" | "fetchPayment" | "fetchToken" | "listPaymentsByOrder">;

export interface FulfilDeps extends GrantPurchaseDeps {
  /** The platform Moyasar client, or null while the gateway is off. */
  gateway: () => Promise<GatewayClient | null>;
  /** recordNotification (src/lib/notify.ts). */
  notify: (input: { userId: string; title: string; body: string; href: string }) => Promise<void>;
  /** The clock (tests pin it). */
  now?: () => Date;
  /** P3: founder_release_order — frees a dead membership order's reserved seat. Best-effort. */
  releaseFounderSeat?: (orderId: string) => Promise<void>;
  /** P3: the in-site bell of every admin (library_monitor_notify_admins, 20261031_10). Best-effort. */
  notifyAdmins?: (input: { title: string; body: string; href: string }) => Promise<void>;
}

interface OrderRow {
  id: string;
  user_id: string | null;
  merchant: string | null;
  kind: string;
  item_id: string;
  billing: string;
  total_halalas: number;
  currency: string;
  status: string;
  moyasar_payment_id: string | null;
  live: boolean | null;
  receipt_number: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  failure_message: string | null;
  metadata: Record<string, unknown> | null;
}

type DbError = { code?: string; message?: string } | null | undefined;

const ORDER_COLUMNS =
  "id, user_id, merchant, kind, item_id, billing, total_halalas, currency, status, moyasar_payment_id, live, receipt_number, paid_at, fulfilled_at, failure_message, metadata";

const OPEN_STATUSES = ["created", "initiated"];

/** A membership order in one of these holds no payment that can still land: its seat is freed. */
const DEAD_STATUSES = new Set(["failed", "voided", "cancelled"]);

/** Where an admin refunds a paid order. */
export const ADMIN_ORDERS_HREF = "/dashboard/admin/subscriptions/orders";

const FOUNDER_REFUND_WHY_AR: Readonly<Record<FounderRefundReason, string>> = {
  seat_unavailable: "اكتملت مقاعد المؤسسين قبل تأكيد الدفع",
  not_verified: "رخصة المحامي غير موثّقة عند تأكيد الدفع",
  already_member: "المشتري عضو مؤسس بالفعل بعملية أخرى",
};

const missingLogged = new Set<string>();

/** Logs a missing B1 table / column / function once per step and process. */
function logMissingOnce(step: string, error: DbError): void {
  if (missingLogged.has(step)) return;
  missingLogged.add(step);
  console.warn(
    `[payments] fulfillOrder: ${step} — a B1 migration is not applied yet (${error?.code ?? "?"}); answering pending until it is`,
  );
}

function pendingForDbError(step: string, error: DbError): FulfillResult {
  if (isMissingPaymentsObject(error?.code)) {
    logMissingOnce(step, error);
    return { outcome: "pending", reason: "schema_missing" };
  }
  console.error(`[payments] fulfillOrder: ${step} failed:`, error?.code, error?.message);
  return { outcome: "pending", reason: `${step}_failed` };
}

/**
 * Merges `patch` into payment_orders.metadata in one statement
 * (merge_payment_order_metadata, 20261022_30): other keys are kept. Never
 * fails the caller; a missing function is logged once.
 */
export async function mergeOrderMetadata(
  admin: SupabaseClient,
  orderId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await admin.rpc("merge_payment_order_metadata", { p_order: orderId, p_patch: patch });
    if (!error) return true;
    if (isMissingPaymentsObject(error.code)) logMissingOnce("metadata merge", error);
    else console.error("[payments] fulfillOrder: metadata merge failed:", orderId, error.code, error.message);
    return false;
  } catch (err) {
    console.error("[payments] fulfillOrder: metadata merge threw:", orderId, err instanceof Error ? err.message : err);
    return false;
  }
}

/** P3: frees the reserved founder seat of a dead membership order. Never fails the caller. */
async function releaseFounderSeatOf(deps: FulfilDeps, orderId: string): Promise<void> {
  if (!deps.releaseFounderSeat) return;
  try {
    await deps.releaseFounderSeat(orderId);
  } catch (err) {
    console.warn("[payments] fulfillOrder: freeing the founder seat failed (the sweep frees it):", orderId, err instanceof Error ? err.message : err);
  }
}

/** P3: one alert to every admin — a paid membership granted nothing and needs a refund. Never fails the caller. */
async function alertAdminsFounderRefund(
  deps: FulfilDeps,
  order: OrderRow,
  reason: FounderRefundReason,
  receiptNumber: string | null,
): Promise<void> {
  console.error("[payments] fulfillOrder: a paid founder membership was not activated — admin refund:", order.id, reason);
  if (!deps.notifyAdmins) return;
  const receipt = receiptNumber ? ` رقم الإيصال: ${receiptNumber}.` : "";
  try {
    await deps.notifyAdmins({
      title: "عضوية مؤسس مدفوعة لم تُفعَّل — يلزم استرداد",
      body: `${FOUNDER_REFUND_WHY_AR[reason]} (${reason}). الطلب ${order.id}.${receipt}`,
      href: ADMIN_ORDERS_HREF,
    });
  } catch (err) {
    console.error("[payments] fulfillOrder: the admin alert failed:", order.id, err instanceof Error ? err.message : err);
  }
}

/**
 * The sweep (P3): founder_release_expired frees every reserved seat past its
 * reserved_until whose order is not paid. The number freed, or null when it
 * could not run (a missing function before 20261101_10, an error). Never throws.
 */
export async function releaseExpiredFounderSeats(admin: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await admin.rpc("founder_release_expired");
    if (error) {
      if (isMissingPaymentsObject(error.code)) logMissingOnce("founder_release_expired", error);
      else console.error("[payments] founder_release_expired failed:", error.code, error.message);
      return null;
    }
    const n = Number(data);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.error("[payments] founder_release_expired threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The durable trace of a paid payment that did not settle this order. */
async function markPaidUnmatched(
  deps: FulfilDeps,
  orderId: string,
  paymentId: string,
  reason: string,
): Promise<void> {
  console.error("[payments] fulfillOrder: a PAID payment did not settle its order — admin review:", orderId, paymentId, reason);
  const at = (deps.now?.() ?? new Date()).toISOString();
  await mergeOrderMetadata(deps.admin, orderId, { paid_unmatched: { payment_id: paymentId, reason, at } });
}

/**
 * Saves the payment's card token for the user; returns the payment_methods
 * row id, or null. Never fails the purchase: a card that cannot be saved only
 * means B2 cannot renew without asking.
 */
async function saveCard(
  admin: SupabaseClient,
  client: GatewayClient,
  order: OrderRow,
  token: string,
): Promise<string | null> {
  if (!order.user_id) return null;
  try {
    const details = await client.fetchToken(token);
    const t = details.ok ? details.data : null;
    const { data, error } = await admin
      .from("payment_methods")
      .insert({
        user_id: order.user_id,
        merchant: order.merchant ?? "platform",
        token,
        live: client.mode === "live",
        brand: t?.brand ?? null,
        last_four: t?.lastFour ?? null,
        exp_month: t?.month ?? null,
        exp_year: t?.year ?? null,
      })
      .select("id")
      .single();
    if (!error && data) return String((data as { id: unknown }).id);
    if (error?.code === "23505") {
      // the card is already saved — reuse it if it is this user's
      const { data: existing } = await admin
        .from("payment_methods")
        .select("id")
        .eq("user_id", order.user_id)
        .eq("token", token)
        .maybeSingle();
      return existing ? String((existing as { id: unknown }).id) : null;
    }
    if (isMissingPaymentsObject(error?.code)) logMissingOnce("payment_methods insert", error);
    else console.error("[payments] fulfillOrder: saving the card failed:", error?.code, error?.message);
    return null;
  } catch (err) {
    console.error("[payments] fulfillOrder: saving the card threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Steps 4–6 for a claimed (status paid) order. */
async function finish(
  deps: FulfilDeps,
  order: OrderRow,
  payment: MoyasarPayment | null,
  client: GatewayClient | null,
): Promise<FulfillResult> {
  const { admin } = deps;
  const now = deps.now?.() ?? new Date();
  const receiptNumber = order.receipt_number;

  if (!order.user_id) {
    // The account was deleted after checkout: nothing can be granted. Close
    // the order so the sweep stops; an admin refunds it from the orders page.
    console.error("[payments] fulfillOrder: paid order has no user (account deleted) — refund it:", order.id);
    // The flag is merged (other keys, e.g. a concurrent paid_unmatched, are
    // kept) BEFORE the stamp, so a stamped order always carries it.
    if (!(await mergeOrderMetadata(admin, order.id, { no_user: true }))) {
      return { outcome: "pending", reason: "metadata_merge_failed", receiptNumber };
    }
    const { error } = await admin
      .from("payment_orders")
      .update({ fulfilled_at: now.toISOString() })
      .eq("id", order.id)
      .is("fulfilled_at", null);
    if (error) return pendingForDbError("no-user stamp", error);
    return { outcome: "rejected", reason: "order_has_no_user", receiptNumber };
  }

  // resolve, not sell: a paid order for a retired item is still fulfilled
  const item = resolveItem(order.item_id, deps.catalog);
  if (!item) {
    console.error("[payments] fulfillOrder: paid order for an item the catalog does not know:", order.id, order.item_id);
    return { outcome: "pending", reason: "unknown_item", receiptNumber };
  }

  const token = payment?.source?.token;
  const paymentMethodId = item.saveCard && token && client ? await saveCard(admin, client, order, token) : null;

  const granted = await grantPurchase(
    deps,
    { id: order.id, user_id: order.user_id, kind: order.kind, item_id: order.item_id, billing: order.billing },
    { paymentMethodId, now },
  );
  if (!granted.ok) {
    if (granted.missing) logMissingOnce("grant", { code: "missing", message: granted.error });
    else console.error("[payments] fulfillOrder: the grant failed; the sweep will retry:", order.id, granted.error);
    return { outcome: "pending", reason: granted.missing ? "schema_missing" : "grant_failed", receiptNumber };
  }

  // P7: a coupon is consumed only by a PAID, LIVE order that actually
  // granted something (couponServer.ts): an «already entitled» order bought
  // nothing and a test-mode payment is not a sale, so neither uses it up.
  if (!granted.alreadyEntitled && (await recordCouponUsage(admin, order)) === "reused") {
    await mergeOrderMetadata(admin, order.id, { coupon_reused: true });
  }

  // Masked payment details exist only so the receipt can show the last four.
  // Best-effort, after the grant: a failure never blocks or delays what the
  // user paid for (mergeOrderMetadata logs it); the receipt then reads
  // «تفاصيل البطاقة غير متاحة». Never persist the masked PAN.
  const lastFour = payment?.source?.number?.match(/(\d{4})$/)?.[1] ?? null;
  if (payment && lastFour && !order.metadata?.payment_method) {
    await mergeOrderMetadata(admin, order.id, {
      payment_method: { type: payment.source.type, last_four: lastFour },
    });
  }

  // already_entitled is merged (never replacing the other keys) BEFORE the
  // stamp: a refresh that finds the order fulfilled must also find the flag.
  if (granted.alreadyEntitled && !(await mergeOrderMetadata(admin, order.id, { already_entitled: true }))) {
    return { outcome: "pending", reason: "metadata_merge_failed", receiptNumber };
  }
  const { data: stamped, error: stampErr } = await admin
    .from("payment_orders")
    .update({ fulfilled_at: now.toISOString() })
    .eq("id", order.id)
    .is("fulfilled_at", null)
    .select("id");
  if (stampErr) return pendingForDbError("fulfilled_at stamp", stampErr);
  if (!Array.isArray(stamped) || stamped.length === 0) {
    // another call finished it first; it sent the notification
    return { outcome: "already_done", receiptNumber };
  }

  if (granted.alreadyEntitled) {
    console.warn("[payments] fulfillOrder: paid but already entitled — awaiting an admin refund review:", order.id);
  }
  const notice = fulfilmentNoticeAr({
    kind: item.kind,
    labelAr: item.labelAr,
    receiptNumber,
    alreadyEntitled: granted.alreadyEntitled,
  });
  await deps.notify({ userId: order.user_id, title: notice.title, body: notice.body, href: notice.href });
  if (granted.refundReason) await alertAdminsFounderRefund(deps, order, granted.refundReason, receiptNumber);

  return granted.alreadyEntitled
    ? { outcome: "already_done", reason: "already_entitled", receiptNumber }
    : { outcome: "granted", receiptNumber };
}

/** The sweep's resume: the claim already verified the payment; fetch it only for the card. */
async function resume(deps: FulfilDeps, order: OrderRow): Promise<FulfillResult> {
  let client: GatewayClient | null = null;
  let payment: MoyasarPayment | null = null;
  const item = resolveItem(order.item_id, deps.catalog) ?? null;
  if (item?.saveCard && order.moyasar_payment_id && (order.merchant ?? "platform") === "platform") {
    try {
      client = await deps.gateway();
      if (client) {
        const fetched = await client.fetchPayment(order.moyasar_payment_id);
        if (fetched.ok) payment = fetched.data;
      }
    } catch {
      client = null;
    }
  }
  return finish(deps, order, payment, client);
}

async function run(deps: FulfilDeps, input: FulfillOrderInput): Promise<FulfillResult> {
  if (typeof input?.orderId !== "string" || !input.orderId || typeof input.paymentId !== "string" || !input.paymentId) {
    return { outcome: "rejected", reason: "invalid_input" };
  }
  const { admin } = deps;

  const { data, error } = await admin.from("payment_orders").select(ORDER_COLUMNS).eq("id", input.orderId).maybeSingle();
  if (error) {
    if (error.code === "22P02") return { outcome: "rejected", reason: "order_not_found" }; // not a uuid
    return pendingForDbError("order read", error);
  }
  const order = data as OrderRow | null;
  if (!order) return { outcome: "rejected", reason: "order_not_found" };
  if ((order.merchant ?? "platform") !== input.merchant) return { outcome: "rejected", reason: "order_mismatch" };

  if (order.status === "paid" && !order.fulfilled_at) {
    if (input.resume && resumeAllowed(order, (deps.now?.() ?? new Date()).getTime())) return resume(deps, order);
    return { outcome: "pending", reason: "fulfilment_in_progress", receiptNumber: order.receipt_number };
  }
  if (order.status === "paid" || order.status === "refunded") {
    // A later call (the payer refreshing after the webhook finished) must see
    // what the first one saw: a kept plan awaiting a refund review, or a refund.
    const reason =
      order.metadata?.already_entitled === true
        ? "already_entitled"
        : order.status === "refunded"
          ? "order_refunded"
          : undefined;
    return { outcome: "already_done", ...(reason ? { reason } : {}), receiptNumber: order.receipt_number };
  }

  if (input.merchant !== "platform") {
    // office payments are B3; B1 never creates one
    return { outcome: "pending", reason: "merchant_unsupported" };
  }
  let client: GatewayClient | null;
  try {
    client = await deps.gateway();
  } catch {
    client = null;
  }
  if (!client) return { outcome: "pending", reason: "gateway_disabled" };

  const fetched = await client.fetchPayment(input.paymentId);
  if (!fetched.ok) {
    console.warn("[payments] fulfillOrder: fetching the payment failed:", input.orderId, fetched.status, fetched.type);
    return { outcome: "pending", reason: "payment_fetch_failed" };
  }
  const payment = fetched.data;
  const live = client.mode === "live";

  const decision = fulfillDecision(order, payment, client.mode, { merchant: input.merchant, liveFlag: input.liveFlag });

  const unmatched = paidUnmatchedReason(decision, payment, order);
  if (unmatched) await markPaidUnmatched(deps, order.id, payment.id, unmatched);

  if (typeof decision === "object") {
    console.warn("[payments] fulfillOrder: payment rejected:", decision.reject, "order", order.id, "payment", payment.id);
    return { outcome: "rejected", reason: decision.reject };
  }

  if (decision === "already_done") {
    if (order.kind === "membership" && DEAD_STATUSES.has(order.status)) await releaseFounderSeatOf(deps, order.id);
    // a declined order stays declined: the payer coming back again sees the failure
    if (order.status === "failed") return { outcome: "failed", reason: order.failure_message ?? "payment_failed" };
    return { outcome: "already_done", reason: `order_${order.status}`, receiptNumber: order.receipt_number };
  }

  if (decision === "wait") {
    // Keep the payment id (verified: it names this order at its price and
    // mode), so the sweep can look at this order again.
    const { error: waitErr } = await admin
      .from("payment_orders")
      .update({ moyasar_payment_id: payment.id })
      .eq("id", order.id)
      .in("status", OPEN_STATUSES)
      .is("moyasar_payment_id", null);
    if (waitErr && waitErr.code === "23505") {
      console.warn("[payments] fulfillOrder: the payment is already on another order:", payment.id);
      return { outcome: "rejected", reason: "order_mismatch" };
    }
    if (waitErr) return pendingForDbError("payment id stamp", waitErr);
    return { outcome: "pending", reason: "payment_not_final" };
  }

  if (decision === "record_failed") {
    const message = (payment.source?.message ?? "").slice(0, 500) || null;
    const { error: failErr } = await admin
      .from("payment_orders")
      .update({ status: "failed", moyasar_payment_id: payment.id, live, failure_message: message })
      .eq("id", order.id)
      .in("status", OPEN_STATUSES);
    if (failErr && failErr.code === "23505") {
      console.warn("[payments] fulfillOrder: the failed payment is already on another order:", payment.id);
      return { outcome: "rejected", reason: "order_mismatch" };
    }
    if (failErr) return pendingForDbError("failure record", failErr);
    if (order.kind === "membership") await releaseFounderSeatOf(deps, order.id);
    return { outcome: "failed", reason: message ?? "payment_failed" };
  }

  // decision === "grant": the claim
  const { data: rows, error: claimErr } = await admin.rpc("claim_payment_order", {
    p_order: order.id,
    p_payment_id: payment.id,
    p_live: live,
  });
  if (claimErr) {
    if (claimErr.code === "23505") {
      // payment_orders_moyasar_payment_id_key: this payment settled another order
      await markPaidUnmatched(deps, order.id, payment.id, "payment_on_other_order");
      return { outcome: "rejected", reason: "order_mismatch" };
    }
    return pendingForDbError("claim", claimErr);
  }
  const claimed = Array.isArray(rows) ? (rows[0] as OrderRow | undefined) : undefined;
  if (!claimed) {
    // Another call closed the order first. When it was settled by ANOTHER
    // payment (the payer paid twice), this paid payment bought nothing.
    const { data: current } = await admin.from("payment_orders").select("moyasar_payment_id").eq("id", order.id).maybeSingle();
    const settledBy = (current as { moyasar_payment_id?: string | null } | null)?.moyasar_payment_id ?? null;
    if (settledBy && settledBy !== payment.id) {
      await markPaidUnmatched(deps, order.id, payment.id, "order_settled_by_another_payment");
    }
    return { outcome: "already_done", reason: "claimed_elsewhere" };
  }

  return finish(deps, claimed, payment, client);
}

export async function fulfillOrderWith(deps: FulfilDeps, input: FulfillOrderInput): Promise<FulfillResult> {
  try {
    return await run(deps, input);
  } catch (err) {
    console.error("[payments] fulfillOrder threw:", err instanceof Error ? err.message : err);
    return { outcome: "pending", reason: "error" };
  }
}

/**
 * For the sweep's intent-only orders: the order's paid payment at Moyasar
 * (listPaymentsByOrder, newest paid), or null. The id is only handed to
 * fulfillOrderWith, which fetches and verifies the payment again before
 * anything is stamped.
 */
export async function findPaidPaymentWith(
  deps: Pick<FulfilDeps, "gateway">,
  orderId: string,
): Promise<{ ok: true; paymentId: string | null } | { ok: false; reason: string }> {
  try {
    const client = await deps.gateway();
    if (!client) return { ok: false, reason: "gateway_disabled" };
    const listed = await client.listPaymentsByOrder(orderId);
    if (!listed.ok) return { ok: false, reason: `list_failed_${listed.status}` };
    return { ok: true, paymentId: pickPaidPayment(listed.data, orderId)?.id ?? null };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "error" };
  }
}
