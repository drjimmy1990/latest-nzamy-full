/**
 * webhookCore.ts — what POST /api/v1/payments/webhook does with one Moyasar
 * delivery (payments B1, Task 6, fix round 1). The route
 * (src/app/api/v1/payments/webhook/route.ts) parses the JSON and calls
 * handleWebhookWith with the real service client, fulfillOrder and the env;
 * the tests drive it with a fake service client and fulfilment.
 *
 *   1. checkWebhook: `secret_token` against the webhook secret (SHA-256 +
 *      timingSafeEqual) BEFORE any database work — a bad secret is 401, a
 *      malformed body 400. The service client is built only after it.
 *   2. The event row (payment_webhook_events, service role only) is inserted
 *      BEFORE anything is done. A repeat event id whose stored outcome is
 *      final → 200 {duplicate: true}. A repeat whose outcome is null or
 *      'pending…' (the earlier delivery answered 503 so Moyasar would retry,
 *      or it crashed) runs again — fulfillOrder is idempotent.
 *   3. An event whose `live` disagrees with the mode of the configured key →
 *      mode_mismatch, 200: that key cannot fetch the payment, so a retry
 *      could never succeed.
 *   4. payment_paid / payment_failed / payment_faild (both spellings are in
 *      Moyasar's docs): fulfil the order that carries this payment id, or
 *      else the one named by the payment's metadata.order_id (none → no_order,
 *      200). fulfillOrder re-fetches the payment with the secret key; the
 *      body is only a trigger and its `live` is passed as liveFlag.
 *      payment_refunded / payment_voided: recorded only (B1 refunds are
 *      admin-initiated, Task 9). Anything else: ignored.
 *   5. The outcome is written to the event row after fulfilment. 'pending'
 *      answers 503 so Moyasar delivers again (6 attempts over about 3.5
 *      hours); every other outcome answers 200.
 *
 * claimed_elsewhere is FINAL here: fulfillOrder answers
 * already_done:claimed_elsewhere when another call (the result page, the
 * sweep, a parallel delivery) won the claim and is granting. The webhook
 * answers 200 and does not retry. If that claimer crashed mid-grant, the
 * order is left paid with fulfilled_at null, and the sweep
 * (/api/v1/cron/payments-sweep, part c) resumes the grant after
 * RESUME_AFTER_MS — the webhook is not the recovery path.
 *
 * A missing table answers 503 (Moyasar retries), logged once; never 500.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test`
 * loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FulfillOrderInput, FulfillResult } from "./fulfillCore.ts";
import { isMissingPaymentsObject } from "./fulfillDecision.ts";
import {
  checkWebhook,
  isFinalWebhookOutcome,
  modeOfSecretKey,
  webhookAction,
  webhookOutcomeLabel,
  webhookStatusFor,
  type WebhookCheck,
} from "./webhookCheck.ts";

export interface WebhookDeps {
  /** The service client — called only once the secret is verified. */
  admin: () => Promise<SupabaseClient>;
  /** fulfillOrder (src/lib/payments/fulfillOrder.ts) or fulfillOrderWith bound to deps. */
  fulfill: (input: FulfillOrderInput) => Promise<FulfillResult>;
  /** MOYASAR_WEBHOOK_SECRET */
  webhookSecret: string | undefined;
  /** MOYASAR_SECRET_KEY — read for its sk_test_/sk_live_ prefix only. */
  secretKey: string | undefined;
}

export interface WebhookReply {
  status: 200 | 400 | 401 | 503;
  body: Record<string, unknown>;
}

type OkCheck = Extract<WebhookCheck, { ok: true }>;

const RETRY: WebhookReply = { status: 503, body: { received: false, retry: true } };

const missingLogged = new Set<string>();

function logMissingOnce(step: string, code: string | undefined): void {
  if (missingLogged.has(step)) return;
  missingLogged.add(step);
  console.warn(`[payments/webhook] ${step}: a B1 migration is not applied yet (${code ?? "?"}); answering 503 so Moyasar retries`);
}

async function handleEvent(
  admin: SupabaseClient,
  deps: WebhookDeps,
  check: OkCheck,
): Promise<{ label: string; status: 200 | 503 }> {
  if (!check.modeMatches) {
    console.warn("[payments/webhook] event mode does not match the configured key:", check.eventId, check.type);
    return { label: "mode_mismatch", status: 200 };
  }

  const action = webhookAction(check.type);
  if (action === "record") {
    return { label: "recorded", status: 200 };
  }
  if (action === "ignore") return { label: "ignored", status: 200 };

  const { data: byPayment, error: lookupErr } = await admin
    .from("payment_orders")
    .select("id")
    .eq("moyasar_payment_id", check.paymentId)
    .maybeSingle();
  if (lookupErr) {
    if (isMissingPaymentsObject(lookupErr.code)) logMissingOnce("order lookup", lookupErr.code);
    else console.error("[payments/webhook] order lookup failed:", check.eventId, lookupErr.code);
    return { label: "pending:order_lookup_failed", status: 503 };
  }
  const orderId = (byPayment as { id?: string } | null)?.id ?? check.orderId;
  if (!orderId) {
    console.warn("[payments/webhook] no order for the payment:", check.eventId, check.paymentId);
    return { label: "no_order", status: 200 };
  }

  const result = await deps.fulfill({ orderId, paymentId: check.paymentId, merchant: "platform", liveFlag: check.live });
  if (result.outcome === "rejected") {
    console.warn("[payments/webhook] payment rejected:", check.eventId, orderId, result.reason);
  }
  // pending → 503 (Moyasar retries); claimed_elsewhere is an already_done → 200 (see the header)
  return { label: webhookOutcomeLabel(result), status: webhookStatusFor(result.outcome) };
}

export async function handleWebhookWith(deps: WebhookDeps, body: unknown): Promise<WebhookReply> {
  const check = checkWebhook(body, deps.webhookSecret ?? "", modeOfSecretKey(deps.secretKey));
  if (!check.ok) {
    return { status: check.status, body: { error: check.status === 401 ? "unauthorized" : "invalid event" } };
  }

  let admin: SupabaseClient;
  try {
    admin = await deps.admin();
  } catch {
    console.error("[payments/webhook] the service client could not be created");
    return RETRY;
  }

  const { error: insertErr } = await admin
    .from("payment_webhook_events")
    .insert({ event_id: check.eventId, merchant: "platform", type: check.type, payment_id: check.paymentId, live: check.live });
  if (insertErr) {
    if (isMissingPaymentsObject(insertErr.code)) {
      logMissingOnce("event insert", insertErr.code);
      return RETRY;
    }
    if (insertErr.code !== "23505") {
      console.error("[payments/webhook] recording the event failed:", check.eventId, insertErr.code);
      return RETRY;
    }
    // A repeat delivery of this event id.
    const { data: prior, error: priorErr } = await admin
      .from("payment_webhook_events")
      .select("outcome")
      .eq("event_id", check.eventId)
      .maybeSingle();
    if (priorErr) {
      console.error("[payments/webhook] reading the earlier delivery failed:", check.eventId, priorErr.code);
      return RETRY;
    }
    if (isFinalWebhookOutcome((prior as { outcome?: string | null } | null)?.outcome)) {
      return { status: 200, body: { received: true, duplicate: true } };
    }
    // the earlier delivery did not finish (or answered 503): run it again
  }

  let handled: { label: string; status: 200 | 503 };
  try {
    handled = await handleEvent(admin, deps, check);
  } catch {
    console.error("[payments/webhook] handling the event threw:", check.eventId);
    handled = { label: "pending:error", status: 503 };
  }

  const { error: outcomeErr } = await admin
    .from("payment_webhook_events")
    .update({ outcome: handled.label })
    .eq("event_id", check.eventId);
  if (outcomeErr) console.warn("[payments/webhook] recording the outcome failed:", check.eventId, outcomeErr.code);

  return handled.status === 503 ? RETRY : { status: 200, body: { received: true } };
}
