import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { CONSULTATION_STATUSES, isConsultationStatus } from "@/lib/services/consultationVocabulary";
import { CONSULTATION_SELECT, hydrateConsultations, toConsultationDto, type ConsultationRow } from "./_shared";

/**
 * /api/v1/lawyer/consultations — Phase 3 (الاستشارات), lawyer/firm side.
 *
 * Backed by `public.consultations` (20260905_phase3_consultations_and_contracts.sql),
 * born automatically with its `service_requests` row (a trigger — see the
 * migration DECISION 2). RLS ("consultations select") already scopes this to
 * rows the caller is a participant of (owner or active firm member via
 * `can_access_case_row`) — this route adds no extra filtering beyond status.
 */

/**
 * GET /api/v1/lawyer/consultations?status=<ConsultationStatus>|all&limit
 * Response: { data: LawyerConsultation[], total } — RLS-scoped, newest first;
 * the screen does its own sorting by scheduled date.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") || "all";
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 200;

    if (statusParam !== "all" && !isConsultationStatus(statusParam)) {
      return NextResponse.json(
        { error: `status يجب أن يكون أحد: ${[...CONSULTATION_STATUSES, "all"].join(", ")}` },
        { status: 400 },
      );
    }

    let query = supabase.from("consultations").select(CONSULTATION_SELECT, { count: "exact" });
    if (statusParam !== "all") query = query.eq("status", statusParam);

    const { data, error, count } = await query.order("created_at", { ascending: false }).limit(limit);

    if (error) {
      console.error("[lawyer/consultations GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل الاستشارات." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as ConsultationRow[];
    const extras = await hydrateConsultations(supabase, rows);
    const dtos = rows.map((r) => toConsultationDto(r, extras.get(r.id)));

    return NextResponse.json({ data: dtos, total: count ?? dtos.length });
  } catch (err) {
    console.error("[lawyer/consultations GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
