import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { validateFeatureRequestPatch } from "@/lib/services/feedbackInput";
import { FEATURE_REQUEST_SELECT, featureRequestDbErrorResponse, toFeatureRequestDto, type FeatureRequestRow } from "@/app/api/v1/feature-requests/_shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/v1/admin/feature-requests/[id] { status?, implementedNote? }
 * — triage. `updated_at` is bumped by `trg_feature_requests_updated_at`,
 * never set here. A pre-fetch with `.maybeSingle()` turns "no such row" (or
 * a row RLS hides) into a clean 404 instead of letting an
 * `.update(...).select().single()` on zero matched rows surface as
 * PostgREST's `PGRST116` and get laundered into a 500.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["admin"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "معرّف الطلب غير صالح." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const validation = validateFeatureRequestPatch(body as Record<string, unknown>);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const patch = validation.value;

    const { data: existing, error: fetchError } = await supabase.from("feature_requests").select("id").eq("id", id).maybeSingle();
    if (fetchError) {
      console.error("[admin/feature-requests/[id] PATCH] lookup failed:", fetchError.message, fetchError.code);
    }
    if (!existing) {
      return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.implementedNote !== undefined) update.implemented_note = patch.implementedNote;

    const { data, error } = await supabase.from("feature_requests").update(update).eq("id", id).select(FEATURE_REQUEST_SELECT).maybeSingle();
    if (error || !data) {
      const { status, message } = featureRequestDbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toFeatureRequestDto(data as FeatureRequestRow) });
  } catch (err) {
    console.error("[admin/feature-requests/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
