/**
 * fulfillOrder.ts — the ONE place a Moyasar payment becomes a purchase
 * (Moyasar payments B1, Task 5). SERVER-ONLY: it uses the service role and
 * the Moyasar secret key. Three callers reach it, possibly at the same time
 * for the same payment:
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
 *   5. grantPurchase (./grantPurchase.ts), then fulfilled_at = now() — only
 *      while it is still null, so exactly one call stamps it;
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
 * Deploy order: a missing table, column or function of the B1 migrations
 * (42P01 / 42703 / 42883 / PGRST202 / PGRST204 / PGRST205) answers 'pending',
 * logged once per step. Nothing here throws.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig } from "@/lib/access-control";
import { recordNotification } from "@/lib/notify";
import { createMoyasarClient, type MoyasarClient, type MoyasarPayment } from "./moyasarClient.ts";
import { PAYABLE_ITEMS } from "./catalog.ts";
import { grantPurchase } from "./grantPurchase.ts";
import {
  fulfilmentNoticeAr,
  fulfillDecision,
  isMissingPaymentsObject,
  resumeAllowed,
} from "./fulfillDecision.ts";

export type FulfillOutcome = "granted" | "already_done" | "failed" | "pending" | "rejected";

export interface FulfillResult {
  outcome: FulfillOutcome;
  /**
   * Why, in machine words — except for 'failed', where it is Moyasar's own
   * message for the declined payment (shown to the payer). Notable values:
   * 'already_entitled' (already_done: paid, nothing replaced, refund review),
   * 'fulfilment_in_progress' (pending: another call claimed it and is
   * granting), 'gateway_disabled', 'schema_missing', 'payment_not_final'.
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

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;
type DbError = { code?: string; message?: string } | null | undefined;

const ORDER_COLUMNS =
  "id, user_id, merchant, kind, item_id, billing, total_halalas, currency, status, moyasar_payment_id, live, receipt_number, paid_at, fulfilled_at, failure_message, metadata";

const OPEN_STATUSES = ["created", "initiated"];

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
 * Saves the payment's card token for the user; returns the payment_methods
 * row id, or null. Never fails the purchase: a card that cannot be saved only
 * means B2 cannot renew without asking.
 */
async function saveCard(
  admin: ServiceClient,
  client: MoyasarClient,
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
  admin: ServiceClient,
  order: OrderRow,
  payment: MoyasarPayment | null,
  client: MoyasarClient | null,
): Promise<FulfillResult> {
  const receiptNumber = order.receipt_number;

  if (!order.user_id) {
    // The account was deleted after checkout: nothing can be granted. Close
    // the order so the sweep stops; an admin refunds it from the orders page.
    console.error("[payments] fulfillOrder: paid order has no user (account deleted) — refund it:", order.id);
    const { error } = await admin
      .from("payment_orders")
      .update({ fulfilled_at: new Date().toISOString(), metadata: { ...(order.metadata ?? {}), no_user: true } })
      .eq("id", order.id)
      .is("fulfilled_at", null);
    if (error) return pendingForDbError("no-user stamp", error);
    return { outcome: "rejected", reason: "order_has_no_user", receiptNumber };
  }

  if (!Object.hasOwn(PAYABLE_ITEMS, order.item_id)) {
    console.error("[payments] fulfillOrder: paid order for an item the catalog does not know:", order.id, order.item_id);
    return { outcome: "pending", reason: "unknown_item", receiptNumber };
  }
  const item = PAYABLE_ITEMS[order.item_id];

  const token = payment?.source?.token;
  const paymentMethodId = item.saveCard && token && client ? await saveCard(admin, client, order, token) : null;

  const granted = await grantPurchase(
    { id: order.id, user_id: order.user_id, kind: order.kind, item_id: order.item_id, billing: order.billing },
    { paymentMethodId },
  );
  if (!granted.ok) {
    if (granted.missing) logMissingOnce("grant", { code: "missing", message: granted.error });
    else console.error("[payments] fulfillOrder: the grant failed; the sweep will retry:", order.id, granted.error);
    return { outcome: "pending", reason: granted.missing ? "schema_missing" : "grant_failed", receiptNumber };
  }

  const stamp: Record<string, unknown> = { fulfilled_at: new Date().toISOString() };
  if (granted.alreadyEntitled) stamp.metadata = { ...(order.metadata ?? {}), already_entitled: true };
  const { data: stamped, error: stampErr } = await admin
    .from("payment_orders")
    .update(stamp)
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
  await recordNotification({ userId: order.user_id, title: notice.title, body: notice.body, href: notice.href });

  return granted.alreadyEntitled
    ? { outcome: "already_done", reason: "already_entitled", receiptNumber }
    : { outcome: "granted", receiptNumber };
}

/** The sweep's resume: the claim already verified the payment; fetch it only for the card. */
async function resume(admin: ServiceClient, order: OrderRow): Promise<FulfillResult> {
  let client: MoyasarClient | null = null;
  let payment: MoyasarPayment | null = null;
  const item = Object.hasOwn(PAYABLE_ITEMS, order.item_id) ? PAYABLE_ITEMS[order.item_id] : null;
  if (item?.saveCard && order.moyasar_payment_id && (order.merchant ?? "platform") === "platform") {
    try {
      const cfg = await getMoyasarConfig();
      if (cfg.enabled) {
        client = createMoyasarClient(cfg);
        const fetched = await client.fetchPayment(order.moyasar_payment_id);
        if (fetched.ok) payment = fetched.data;
      }
    } catch {
      client = null;
    }
  }
  return finish(admin, order, payment, client);
}

async function run(input: FulfillOrderInput): Promise<FulfillResult> {
  if (typeof input?.orderId !== "string" || !input.orderId || typeof input.paymentId !== "string" || !input.paymentId) {
    return { outcome: "rejected", reason: "invalid_input" };
  }

  const admin = await createServiceClient();
  const { data, error } = await admin.from("payment_orders").select(ORDER_COLUMNS).eq("id", input.orderId).maybeSingle();
  if (error) {
    if (error.code === "22P02") return { outcome: "rejected", reason: "order_not_found" }; // not a uuid
    return pendingForDbError("order read", error);
  }
  const order = data as OrderRow | null;
  if (!order) return { outcome: "rejected", reason: "order_not_found" };
  if ((order.merchant ?? "platform") !== input.merchant) return { outcome: "rejected", reason: "order_mismatch" };

  if (order.status === "paid" && !order.fulfilled_at) {
    if (input.resume && resumeAllowed(order, Date.now())) return resume(admin, order);
    return { outcome: "pending", reason: "fulfilment_in_progress", receiptNumber: order.receipt_number };
  }
  if (order.status === "paid" || order.status === "refunded") {
    return { outcome: "already_done", receiptNumber: order.receipt_number };
  }

  if (input.merchant !== "platform") {
    // office payments are B3; B1 never creates one
    return { outcome: "pending", reason: "merchant_unsupported" };
  }
  const cfg = await getMoyasarConfig();
  if (!cfg.enabled) return { outcome: "pending", reason: "gateway_disabled" };
  let client: MoyasarClient;
  try {
    client = createMoyasarClient(cfg);
  } catch {
    return { outcome: "pending", reason: "gateway_disabled" };
  }

  const fetched = await client.fetchPayment(input.paymentId);
  if (!fetched.ok) {
    console.warn("[payments] fulfillOrder: fetching the payment failed:", input.orderId, fetched.status, fetched.type);
    return { outcome: "pending", reason: "payment_fetch_failed" };
  }
  const payment = fetched.data;
  const live = client.mode === "live";

  const decision = fulfillDecision(order, payment, client.mode, { merchant: input.merchant, liveFlag: input.liveFlag });

  if (typeof decision === "object") {
    console.warn("[payments] fulfillOrder: payment rejected:", decision.reject, "order", order.id, "payment", payment.id);
    return { outcome: "rejected", reason: decision.reject };
  }

  if (decision === "already_done") {
    if (payment.status === "paid") {
      console.error(
        `[payments] fulfillOrder: a paid payment for a ${order.status} order — nothing granted, admin review needed:`,
        order.id,
        payment.id,
      );
    }
    // a declined order stays declined: the payer coming back again sees the failure
    if (order.status === "failed") return { outcome: "failed", reason: order.failure_message ?? "payment_failed" };
    return { outcome: "already_done", reason: `order_${order.status}`, receiptNumber: order.receipt_number };
  }

  if (decision === "wait") {
    // Keep the payment id, so the sweep can look at this order again.
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
      console.warn("[payments] fulfillOrder: the payment already settled another order:", payment.id, order.id);
      return { outcome: "rejected", reason: "order_mismatch" };
    }
    return pendingForDbError("claim", claimErr);
  }
  const claimed = Array.isArray(rows) ? (rows[0] as OrderRow | undefined) : undefined;
  if (!claimed) return { outcome: "already_done", reason: "claimed_elsewhere" };

  return finish(admin, claimed, payment, client);
}

export async function fulfillOrder(input: FulfillOrderInput): Promise<FulfillResult> {
  try {
    return await run(input);
  } catch (err) {
    console.error("[payments] fulfillOrder threw:", err instanceof Error ? err.message : err);
    return { outcome: "pending", reason: "error" };
  }
}
