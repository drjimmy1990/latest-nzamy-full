import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fulfillOrder, type FulfillOutcome } from "@/lib/payments/fulfillOrder";
import {
  cronSecretMatches,
  isMissingPaymentsObject,
  RESUME_AFTER_MS,
  SWEEP_BATCH,
  SWEEP_INITIATED_AFTER_MS,
  SWEEP_LOOKBACK_MS,
} from "@/lib/payments/fulfillDecision";

/**
 * POST /api/v1/cron/payments-sweep — the safety net of Moyasar fulfilment
 * (payments B1, Task 5). The payer's return to the result page and the
 * webhook normally fulfil an order; this catches what both missed:
 *
 *   (a) orders still `initiated` more than 10 minutes (and less than 7 days)
 *       after checkout that carry a `moyasar_payment_id` — fulfillOrder
 *       fetches the payment again and grants, records the failure or waits;
 *   (b) orders `paid` more than 10 minutes ago whose `fulfilled_at` is still
 *       null (a grant failed after the claim) — fulfillOrder resumes the
 *       grant; every grant is keyed on the order, so nothing is granted twice.
 *       Oldest first and without a lookback: a paid order must never be
 *       forgotten (one that keeps failing is logged on every run).
 *
 * Initiated orders that have only an intent id (no payment id yet) are
 * counted as `intent_only` and left alone: the Moyasar client has no
 * "payments of this intent" lookup, and the payment id reaches the order
 * from the result page or the webhook (a 'wait' stamps it).
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET, compared with
 * crypto.timingSafeEqual on SHA-256 digests (cronSecretMatches). An unset or
 * empty CRON_SECRET, or a wrong header, is 401. /api/v1/cron/* is outside the
 * general rate limiter (src/lib/rateLimitRoutes.ts).
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Every 10 minutes, like the deadlines job:
 *   n8n: Schedule Trigger → HTTP Request POST https://nezamy.sa/api/v1/cron/payments-sweep
 *        header x-cron-secret: <CRON_SECRET>
 *
 * Deploy order: before 20261022_10 runs the orders table is missing; the
 * route answers 200 with `skipped: "schema_missing"`, never 500.
 */

interface SweepRow {
  id: string;
  merchant: string | null;
  moyasar_payment_id: string | null;
}

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = Date.now();
  const initiatedBefore = new Date(now - SWEEP_INITIATED_AFTER_MS).toISOString();
  const initiatedAfter = new Date(now - SWEEP_LOOKBACK_MS).toISOString();
  const paidBefore = new Date(now - RESUME_AFTER_MS).toISOString();

  const tally: Record<FulfillOutcome | "intent_only" | "errors", number> = {
    granted: 0,
    already_done: 0,
    failed: 0,
    pending: 0,
    rejected: 0,
    intent_only: 0,
    errors: 0,
  };

  // (a) initiated orders
  const { data: initiated, error: initiatedErr } = await admin
    .from("payment_orders")
    .select("id, merchant, moyasar_payment_id")
    .eq("status", "initiated")
    .lt("created_at", initiatedBefore)
    .gt("created_at", initiatedAfter)
    .not("moyasar_payment_id", "is", null)
    // newest first: abandoned 3-D Secure pages stay initiated for the whole
    // lookback and must not crowd newer orders out of the batch
    .order("created_at", { ascending: false })
    .limit(SWEEP_BATCH);
  if (initiatedErr) {
    if (isMissingPaymentsObject(initiatedErr.code)) {
      return NextResponse.json({ skipped: "schema_missing" });
    }
    console.error("[cron/payments-sweep] initiated orders query failed:", initiatedErr.code, initiatedErr.message);
    tally.errors++;
  }

  // the intent-only ones, counted for the log
  const { count: intentOnly } = await admin
    .from("payment_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "initiated")
    .lt("created_at", initiatedBefore)
    .gt("created_at", initiatedAfter)
    .is("moyasar_payment_id", null);
  tally.intent_only = intentOnly ?? 0;

  // (b) paid orders whose grant did not finish
  const { data: unfulfilled, error: unfulfilledErr } = await admin
    .from("payment_orders")
    .select("id, merchant, moyasar_payment_id")
    .eq("status", "paid")
    .is("fulfilled_at", null)
    .lt("paid_at", paidBefore)
    .order("paid_at", { ascending: true })
    .limit(SWEEP_BATCH);
  if (unfulfilledErr) {
    if (isMissingPaymentsObject(unfulfilledErr.code)) {
      return NextResponse.json({ skipped: "schema_missing" });
    }
    console.error("[cron/payments-sweep] unfulfilled orders query failed:", unfulfilledErr.code, unfulfilledErr.message);
    tally.errors++;
  }

  const rows = [...((initiated ?? []) as SweepRow[]), ...((unfulfilled ?? []) as SweepRow[])];
  for (const row of rows) {
    if (!row.moyasar_payment_id) continue;
    try {
      const result = await fulfillOrder({
        orderId: row.id,
        paymentId: row.moyasar_payment_id,
        merchant: row.merchant === "office" ? "office" : "platform",
        resume: true,
      });
      tally[result.outcome]++;
      if (result.outcome === "rejected") {
        console.warn("[cron/payments-sweep] order rejected:", row.id, result.reason);
      }
    } catch (err) {
      console.error("[cron/payments-sweep] one order threw:", row.id, err);
      tally.errors++;
    }
  }

  return NextResponse.json({ swept: rows.length, ...tally });
}
