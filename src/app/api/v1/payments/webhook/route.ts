import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fulfillOrder } from "@/lib/payments/fulfillOrder";
import { isMissingPaymentsObject } from "@/lib/payments/fulfillDecision";
import {
  checkWebhook,
  isFinalWebhookOutcome,
  modeOfSecretKey,
  webhookAction,
  webhookOutcomeLabel,
  webhookStatusFor,
  type WebhookCheck,
} from "@/lib/payments/webhookCheck";

/**
 * POST /api/v1/payments/webhook — Moyasar's event deliveries (payments B1,
 * Task 6). Registered in the Moyasar dashboard with the secret
 * MOYASAR_WEBHOOK_SECRET and the events payment_paid, payment_failed,
 * payment_refunded, payment_voided.
 *
 *   1. checkWebhook: `secret_token` against MOYASAR_WEBHOOK_SECRET (SHA-256 +
 *      timingSafeEqual) BEFORE any database work — a bad secret is 401, a
 *      malformed body 400.
 *   2. The event row (payment_webhook_events, service role only) is inserted
 *      BEFORE anything is done. A repeat event id whose stored outcome is
 *      final → 200 {duplicate: true}. A repeat whose outcome is null or
 *      'pending…' (the earlier delivery answered 503 so Moyasar would retry)
 *      runs again — fulfillOrder is idempotent.
 *   3. payment_paid / payment_failed / payment_faild (both spellings are in
 *      Moyasar's docs): fulfillOrder for the order that carries this payment
 *      id, or else the order named by the payment's metadata.order_id.
 *      fulfillOrder re-fetches the payment with the secret key; the body is
 *      only a trigger, and its `live` is passed as liveFlag.
 *      payment_refunded / payment_voided: recorded only (B1 refunds are
 *      admin-initiated, Task 9). Anything else: recorded as ignored.
 *   4. The outcome is written to the event row. 'pending' answers 503 so
 *      Moyasar delivers again (6 attempts over about 3.5 hours; the sweep
 *      catches what is left); every other outcome answers 200.
 *
 * An event whose `live` disagrees with the mode of the configured key is
 * recorded as mode_mismatch and answered 200: that key cannot fetch the
 * payment, so retrying could never succeed.
 *
 * Outside the general rate limiter (src/lib/rateLimitRoutes.ts).
 * Deploy order: a missing table answers 503 (Moyasar retries), logged once;
 * never 500.
 */

type Admin = Awaited<ReturnType<typeof createServiceClient>>;
type OkCheck = Extract<WebhookCheck, { ok: true }>;

const missingLogged = new Set<string>();

function logMissingOnce(step: string, code: string | undefined): void {
  if (missingLogged.has(step)) return;
  missingLogged.add(step);
  console.warn(`[payments/webhook] ${step}: a B1 migration is not applied yet (${code ?? "?"}); answering 503 so Moyasar retries`);
}

const retryLater = () => NextResponse.json({ received: false, retry: true }, { status: 503 });

async function handleEvent(admin: Admin, check: OkCheck): Promise<{ label: string; status: 200 | 503 }> {
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

  const result = await fulfillOrder({ orderId, paymentId: check.paymentId, merchant: "platform", liveFlag: check.live });
  if (result.outcome === "rejected") {
    console.warn("[payments/webhook] payment rejected:", check.eventId, orderId, result.reason);
  }
  return { label: webhookOutcomeLabel(result), status: webhookStatusFor(result.outcome) };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const check = checkWebhook(body, process.env.MOYASAR_WEBHOOK_SECRET ?? "", modeOfSecretKey(process.env.MOYASAR_SECRET_KEY));
  if (!check.ok) {
    return NextResponse.json({ error: check.status === 401 ? "unauthorized" : "invalid event" }, { status: check.status });
  }

  let admin: Admin;
  try {
    admin = await createServiceClient();
  } catch {
    console.error("[payments/webhook] the service client could not be created");
    return retryLater();
  }

  const { error: insertErr } = await admin
    .from("payment_webhook_events")
    .insert({ event_id: check.eventId, merchant: "platform", type: check.type, payment_id: check.paymentId, live: check.live });
  if (insertErr) {
    if (isMissingPaymentsObject(insertErr.code)) {
      logMissingOnce("event insert", insertErr.code);
      return retryLater();
    }
    if (insertErr.code !== "23505") {
      console.error("[payments/webhook] recording the event failed:", check.eventId, insertErr.code);
      return retryLater();
    }
    // A repeat delivery of this event id.
    const { data: prior, error: priorErr } = await admin
      .from("payment_webhook_events")
      .select("outcome")
      .eq("event_id", check.eventId)
      .maybeSingle();
    if (priorErr) {
      console.error("[payments/webhook] reading the earlier delivery failed:", check.eventId, priorErr.code);
      return retryLater();
    }
    if (isFinalWebhookOutcome((prior as { outcome?: string | null } | null)?.outcome)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // the earlier delivery did not finish (or answered 503): run it again
  }

  const handled = await handleEvent(admin, check);

  const { error: outcomeErr } = await admin
    .from("payment_webhook_events")
    .update({ outcome: handled.label })
    .eq("event_id", check.eventId);
  if (outcomeErr) console.warn("[payments/webhook] recording the outcome failed:", check.eventId, outcomeErr.code);

  return handled.status === 503 ? retryLater() : NextResponse.json({ received: true });
}
