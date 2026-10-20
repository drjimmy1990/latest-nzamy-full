import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fulfillOrder } from "@/lib/payments/fulfillOrder";
import { handleWebhookWith } from "@/lib/payments/webhookCore";

/**
 * POST /api/v1/payments/webhook — Moyasar's event deliveries (payments B1,
 * Task 6). Registered in the Moyasar dashboard with the secret
 * MOYASAR_WEBHOOK_SECRET and the events payment_paid, payment_failed,
 * payment_refunded, payment_voided.
 *
 * This file only parses the JSON and wires the real dependencies; what
 * happens to a delivery — the secret check before any database work, the
 * event row first, duplicates, the 503-on-pending retry, the outcome after —
 * is handleWebhookWith in src/lib/payments/webhookCore.ts (documented and
 * tested there). claimed_elsewhere is final on this path: the sweep, not a
 * webhook retry, recovers a claimer that crashed mid-grant.
 *
 * Outside the general rate limiter (src/lib/rateLimitRoutes.ts). Never 500.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await handleWebhookWith(
    {
      admin: createServiceClient,
      fulfill: fulfillOrder,
      webhookSecret: process.env.MOYASAR_WEBHOOK_SECRET,
      secretKey: process.env.MOYASAR_SECRET_KEY,
    },
    body,
  ).catch(() => {
    console.error("[payments/webhook] the handler threw");
    return { status: 503 as const, body: { received: false, retry: true } };
  });
  return NextResponse.json(result.body, { status: result.status });
}
