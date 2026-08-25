import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";

/**
 * POST /api/v1/ai-review-requests — records a BetaReviewGate submission.
 *
 * BetaReviewGate (src/components/BetaReviewGate.tsx) tells the user their AI
 * output was "submitted for review", but until now that was purely a local
 * setSubmitted(true) — nothing was recorded anywhere. This route is the
 * server-side landing spot for that promise (table: ai_review_requests,
 * migration 20260811_ai_review_requests.sql).
 *
 * Public — no auth required, the gate is shown to logged-out visitors too.
 * The session user (if any) is attached best-effort. Rate-limited 5/min/IP.
 *
 * Best-effort by design: if the migration hasn't been applied yet (table
 * missing) or any other insert failure occurs, this still responds 200 with
 * { data: { queued: false } } rather than 500ing the gate's submit button —
 * BetaReviewGate shows its honest error/retry state based on HTTP ok, not on
 * `queued`.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFrom(request);
  const rl = rateLimit(`ai-review-requests:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "طلبات كثيرة جداً — حاول لاحقاً" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { tool?: unknown; scope?: unknown; payloadSummary?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const tool = typeof body.tool === "string" ? body.tool.trim() : "";
  if (!tool) {
    return NextResponse.json({ error: "اسم الأداة مطلوب" }, { status: 400 });
  }
  if (tool.length > 100) {
    return NextResponse.json({ error: "اسم الأداة طويل جداً" }, { status: 400 });
  }

  const scope =
    typeof body.scope === "string" && body.scope.trim() ? body.scope.trim() : "legal-data";
  if (scope.length > 50) {
    return NextResponse.json({ error: "قيمة النطاق طويلة جداً" }, { status: 400 });
  }

  let payloadSummary: string | null = null;
  if (typeof body.payloadSummary === "string" && body.payloadSummary.trim()) {
    payloadSummary = body.payloadSummary.trim();
    if (payloadSummary.length > 2000) {
      return NextResponse.json({ error: "ملخص الطلب طويل جداً" }, { status: 400 });
    }
  }

  // Session user is optional — the gate shows to logged-out visitors too.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  try {
    const admin = await createServiceClient();
    const { error } = await admin.from("ai_review_requests").insert({
      user_id: userId,
      tool,
      scope,
      payload_summary: payloadSummary,
    });

    if (error) {
      // Table not migrated yet, or any other insert failure — best-effort,
      // never fail the beta gate's UI over this.
      console.error("[ai-review-requests] insert failed:", error.message, error.code);
      return NextResponse.json({ data: { queued: false } });
    }

    return NextResponse.json({ data: { queued: true } });
  } catch (err) {
    console.error("[ai-review-requests] Unexpected error:", err);
    return NextResponse.json({ data: { queued: false } });
  }
}
