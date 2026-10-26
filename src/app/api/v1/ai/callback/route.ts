import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { callbackWith } from "@/lib/ai/runCore";

/**
 * POST /api/v1/ai/callback — n8n only (plan §2.1, §2.3): a job tool's result
 * or a progress step, settled by callbackWith (src/lib/ai/runCore.ts).
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `X-Nzamy-Key` must equal NZAMY_AI_CALLBACK_KEY (a different secret
 * from NZAMY_AI_KEY, which the app sends to n8n), compared through SHA-256 +
 * timingSafeEqual. Unset or wrong → 401. No user session, so no assertRole and
 * no freeze gate. A replay does nothing: a run takes one final result and its
 * status only moves forward. Exempt from the proxy's general rate limit
 * (src/lib/rateLimitRoutes.ts): every call comes from n8n's one address.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-nzamy-key"), process.env.NZAMY_AI_CALLBACK_KEY)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    const admin = await createServiceClient();
    const reply = await callbackWith(admin, body);
    return NextResponse.json(reply.body, { status: reply.status });
  } catch (err) {
    console.error("[ai/callback] threw:", err);
    // 503 → n8n retries; the sweeper refunds the run if it never lands.
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
