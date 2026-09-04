import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { parseStatusFilter, FEATURE_REQUEST_STATUSES } from "@/lib/services/feedbackInput";
import { FEATURE_REQUEST_SELECT, toFeatureRequestDto, type FeatureRequestRow } from "@/app/api/v1/feature-requests/_shared";

/**
 * GET /api/v1/admin/feature-requests?status=all|new|planned|implemented|declined
 * — every submission (RLS's `public.is_admin()` SELECT grant), newest first,
 * with `userName` hydrated from `profiles.display_name` via the service
 * client — the allowed use of that client here (a display-name lookup, not
 * a bypass of the actual read/write, which stays on the RLS-scoped client
 * `assertRole` returns).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["admin"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const filter = parseStatusFilter(searchParams.get("status"), FEATURE_REQUEST_STATUSES);
    if (!filter.ok) {
      return NextResponse.json({ error: `status يجب أن يكون all أو أحد: ${FEATURE_REQUEST_STATUSES.join(", ")}` }, { status: 400 });
    }

    let query = supabase
      .from("feature_requests")
      .select(FEATURE_REQUEST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });
    if (filter.value) query = query.eq("status", filter.value);

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin/feature-requests GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل طلبات الميزات." }, { status: 500 });
    }

    const rows = (data ?? []) as FeatureRequestRow[];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const names = new Map<string, string | null>();
    if (userIds.length > 0) {
      try {
        const service = await createServiceClient();
        const { data: profiles, error: profilesError } = await service.from("profiles").select("id, display_name").in("id", userIds);
        if (profilesError) {
          console.error("[admin/feature-requests GET] profile lookup failed:", profilesError.message, profilesError.code);
        } else {
          for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
            names.set(p.id, p.display_name ?? null);
          }
        }
      } catch (err) {
        console.error("[admin/feature-requests GET] profile lookup threw:", err);
      }
    }

    return NextResponse.json({
      data: rows.map((row) => toFeatureRequestDto(row, names.get(row.user_id) ?? null)),
      total: count ?? rows.length,
    });
  } catch (err) {
    console.error("[admin/feature-requests GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
