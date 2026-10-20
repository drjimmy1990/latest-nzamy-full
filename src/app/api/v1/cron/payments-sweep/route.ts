import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  findPaidPaymentForOrder,
  fulfillOrder,
  mergePaymentOrderMetadata,
  type FulfillOutcome,
} from "@/lib/payments/fulfillOrder";
import {
  cronSecretMatches,
  isMissingPaymentsObject,
  RESUME_AFTER_MS,
  SWEEP_BATCH,
  SWEEP_INITIATED_AFTER_MS,
  SWEEP_LOOKBACK_MS,
  sweepAttemptPatch,
  sweepGaveUp,
} from "@/lib/payments/fulfillDecision";

/**
 * POST /api/v1/cron/payments-sweep — the safety net of Moyasar fulfilment
 * (payments B1, Task 5). The payer's return to the result page and the
 * webhook normally fulfil an order; this catches what both missed:
 *
 *   (a) orders still `initiated` more than 10 minutes (and less than 7 days)
 *       after checkout that carry a `moyasar_payment_id` — fulfillOrder
 *       fetches the payment again and grants, records the failure or waits.
 *       Newest first: abandoned 3-D Secure pages stay initiated for the whole
 *       lookback and must not crowd newer orders out of the batch;
 *   (b) the same window's initiated orders with only an intent id: the
 *       order's payments are listed at Moyasar by metadata[order_id]
 *       (listPaymentsByOrder) and, when one is paid (the newest paid),
 *       fulfillOrder runs with it — it fetches and verifies the payment again
 *       before anything is stamped. None paid → left alone;
 *   (c) orders `paid` more than 10 minutes ago whose `fulfilled_at` is still
 *       null (a grant failed after the claim) — fulfillOrder resumes the
 *       grant; every grant is keyed on the order, so nothing is granted twice.
 *       Each unfinished run adds one to metadata.sweep_attempts; after
 *       SWEEP_MAX_ATTEMPTS (20) the order is skipped and carries
 *       metadata.paid_unmatched {reason: 'sweep_gave_up'} for an admin. The
 *       given-up orders are filtered out in code from a window of
 *       4 × SWEEP_BATCH, oldest first.
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
  metadata?: Record<string, unknown> | null;
}

const merchantOf = (row: SweepRow): "platform" | "office" => (row.merchant === "office" ? "office" : "platform");

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = Date.now();
  const initiatedBefore = new Date(now - SWEEP_INITIATED_AFTER_MS).toISOString();
  const initiatedAfter = new Date(now - SWEEP_LOOKBACK_MS).toISOString();
  const paidBefore = new Date(now - RESUME_AFTER_MS).toISOString();

  const tally: Record<FulfillOutcome | "intent_only" | "intent_unpaid" | "gave_up" | "errors", number> = {
    granted: 0,
    already_done: 0,
    failed: 0,
    pending: 0,
    rejected: 0,
    intent_only: 0,
    intent_unpaid: 0,
    gave_up: 0,
    errors: 0,
  };

  async function settle(row: SweepRow, paymentId: string): Promise<FulfillOutcome | null> {
    try {
      const result = await fulfillOrder({ orderId: row.id, paymentId, merchant: merchantOf(row), resume: true });
      tally[result.outcome]++;
      if (result.outcome === "rejected") console.warn("[cron/payments-sweep] order rejected:", row.id, result.reason);
      return result.outcome;
    } catch (err) {
      console.error("[cron/payments-sweep] one order threw:", row.id, err);
      tally.errors++;
      return null;
    }
  }

  // (a) initiated orders with a payment id
  const { data: initiated, error: initiatedErr } = await admin
    .from("payment_orders")
    .select("id, merchant, moyasar_payment_id")
    .eq("status", "initiated")
    .lt("created_at", initiatedBefore)
    .gt("created_at", initiatedAfter)
    .not("moyasar_payment_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(SWEEP_BATCH);
  if (initiatedErr) {
    if (isMissingPaymentsObject(initiatedErr.code)) return NextResponse.json({ skipped: "schema_missing" });
    console.error("[cron/payments-sweep] initiated orders query failed:", initiatedErr.code, initiatedErr.message);
    tally.errors++;
  }
  for (const row of (initiated ?? []) as SweepRow[]) {
    if (row.moyasar_payment_id) await settle(row, row.moyasar_payment_id);
  }

  // (b) initiated orders with only an intent: ask Moyasar for the order's paid payment
  const { data: intentOnly, error: intentErr } = await admin
    .from("payment_orders")
    .select("id, merchant, moyasar_payment_id")
    .eq("status", "initiated")
    .lt("created_at", initiatedBefore)
    .gt("created_at", initiatedAfter)
    .is("moyasar_payment_id", null)
    .not("moyasar_intent_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(SWEEP_BATCH);
  if (intentErr) {
    console.error("[cron/payments-sweep] intent-only orders query failed:", intentErr.code, intentErr.message);
    tally.errors++;
  }
  for (const row of (intentOnly ?? []) as SweepRow[]) {
    tally.intent_only++;
    if (merchantOf(row) !== "platform") continue;
    const found = await findPaidPaymentForOrder(row.id);
    if (!found.ok) {
      console.warn("[cron/payments-sweep] listing the order's payments failed:", row.id, found.reason);
      tally.errors++;
      continue;
    }
    if (!found.paymentId) {
      tally.intent_unpaid++;
      continue;
    }
    await settle(row, found.paymentId);
  }

  // (c) paid orders whose grant did not finish
  const { data: unfulfilled, error: unfulfilledErr } = await admin
    .from("payment_orders")
    .select("id, merchant, moyasar_payment_id, metadata")
    .eq("status", "paid")
    .is("fulfilled_at", null)
    .lt("paid_at", paidBefore)
    .order("paid_at", { ascending: true })
    .limit(SWEEP_BATCH * 4);
  if (unfulfilledErr) {
    if (isMissingPaymentsObject(unfulfilledErr.code)) return NextResponse.json({ skipped: "schema_missing" });
    console.error("[cron/payments-sweep] unfulfilled orders query failed:", unfulfilledErr.code, unfulfilledErr.message);
    tally.errors++;
  }
  const resumable = ((unfulfilled ?? []) as SweepRow[]).filter((row) => {
    if (!sweepGaveUp(row.metadata)) return true;
    tally.gave_up++;
    return false;
  });
  for (const row of resumable.slice(0, SWEEP_BATCH)) {
    if (!row.moyasar_payment_id) continue;
    const outcome = await settle(row, row.moyasar_payment_id);
    if (outcome !== "granted" && outcome !== "already_done") {
      const patch = sweepAttemptPatch(row.metadata, row.moyasar_payment_id, new Date().toISOString());
      await mergePaymentOrderMetadata(row.id, patch);
      if (sweepGaveUp(patch)) {
        console.error("[cron/payments-sweep] giving up on a paid order — admin review:", row.id);
      }
    }
  }

  return NextResponse.json({
    swept: (initiated?.length ?? 0) + (intentOnly?.length ?? 0) + Math.min(resumable.length, SWEEP_BATCH),
    ...tally,
  });
}
