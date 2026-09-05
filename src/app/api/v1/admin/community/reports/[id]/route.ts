import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { validateCommunityReportStatusPatch, type CommunityReportStatusPatchBody } from "@/lib/services/communityReportsInput";
import { COMMUNITY_REPORT_SELECT, toCommunityReportDto, type CommunityReportRow } from "@/app/api/v1/community/reports/_shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// status → the audit action label recorded in admin_audit_events.
const STATUS_TO_AUDIT_ACTION: Record<string, string> = {
  new: "community_report_reopened",
  reviewed: "community_report_reviewed",
  dismissed: "community_report_dismissed",
  actioned: "community_report_actioned",
};

/**
 * PATCH /api/v1/admin/community/reports/[id] { status } — admin triage of
 * one report. Same client shape as
 * /api/v1/admin/community/moderation/[id]/route.ts's PATCH ON PURPOSE
 * (`requireAdmin()` + `createServiceClient()` throughout, including the
 * audit insert): `admin_audit_events` has RLS enabled with NO policies at
 * all (20260603_phase1_005_advanced_features.sql: "only service role — no
 * user access"), so even a signed-in admin's own RLS-scoped client cannot
 * write to it — only the service client can, regardless of who is acting.
 *
 * Every PATCH stamps `reviewed_by`/`reviewed_at` to the acting admin and
 * now(), whatever status is chosen — "reviewed_at" means "an admin last
 * touched this record's status", which stays true across every transition,
 * including one back to 'new'.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "معرّف البلاغ غير صالح." }, { status: 400 });
    }

    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
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

    const validation = validateCommunityReportStatusPatch(body as CommunityReportStatusPatchBody);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { status: newStatus } = validation.value;

    const admin = await createServiceClient();

    const { data: existing, error: readError } = await admin
      .from("community_reports")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      console.error("[admin/community/reports/[id] PATCH] read error:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل البلاغ." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "البلاغ غير موجود." }, { status: 404 });
    }

    const beforeStatus = (existing.status as string) ?? "new";
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await admin
      .from("community_reports")
      .update({ status: newStatus, reviewed_by: gate.userId, reviewed_at: nowIso })
      .eq("id", id)
      .select(COMMUNITY_REPORT_SELECT)
      .maybeSingle();

    if (updateError || !updated) {
      console.error("[admin/community/reports/[id] PATCH] update error:", updateError?.message, updateError?.code);
      return NextResponse.json({ error: "تعذّر تحديث حالة البلاغ." }, { status: 500 });
    }

    // Audit trail (best-effort — never fail the decision if logging fails),
    // matching /api/v1/admin/community/moderation/[id]/route.ts's own PATCH.
    try {
      await admin.from("admin_audit_events").insert({
        actor_id: gate.userId,
        actor_type: "admin",
        action: STATUS_TO_AUDIT_ACTION[newStatus] ?? "community_report_triaged",
        target_type: "community_report",
        target_id: id,
        before_state: { status: beforeStatus },
        after_state: { status: newStatus },
        metadata: { status: newStatus },
      });
    } catch (auditErr) {
      console.error("[admin/community/reports/[id] PATCH] audit insert failed:", auditErr);
    }

    return NextResponse.json({ data: toCommunityReportDto(updated as CommunityReportRow) });
  } catch (err) {
    console.error("[admin/community/reports/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
