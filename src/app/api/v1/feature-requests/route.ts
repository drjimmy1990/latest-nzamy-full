import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { validateFeatureRequestInput } from "@/lib/services/feedbackInput";
import { FEATURE_REQUEST_SELECT, featureRequestDbErrorResponse, toFeatureRequestDto, type FeatureRequestRow } from "./_shared";

/**
 * /api/v1/feature-requests — Phase 6 (feature requests, item 151).
 *
 * GET  — the caller's own submissions, newest first. `.eq("user_id", user.id)`
 *   is explicit even though RLS already allows only "own row or admin" —
 *   an admin caller hitting THIS route must still only see their own
 *   requests, never everyone's (that is what /api/v1/admin/feature-requests
 *   is for).
 * POST — submit one. `user_id` always comes from the session, never the body.
 */

export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data, error, count } = await supabase
      .from("feature_requests")
      .select(FEATURE_REQUEST_SELECT, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[feature-requests GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل طلباتك." }, { status: 500 });
    }

    const rows = (data ?? []) as FeatureRequestRow[];
    return NextResponse.json({ data: rows.map((row) => toFeatureRequestDto(row)), total: count ?? rows.length });
  } catch (err) {
    console.error("[feature-requests GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const validation = validateFeatureRequestInput(body as Record<string, unknown>);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const input = validation.value;

    const { data, error } = await supabase
      .from("feature_requests")
      .insert({
        user_id: user.id,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
      })
      .select(FEATURE_REQUEST_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = featureRequestDbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toFeatureRequestDto(data as FeatureRequestRow) }, { status: 201 });
  } catch (err) {
    console.error("[feature-requests POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
