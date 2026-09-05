import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { validateCommunityReportInput, type CommunityReportInputBody } from "@/lib/services/communityReportsInput";
import { COMMUNITY_REPORT_SELECT, communityReportDbErrorResponse, toCommunityReportDto, type CommunityReportRow } from "./_shared";

/**
 * POST /api/v1/community/reports — «إبلاغ» on a community post or answer.
 * Body: { targetType: 'post'|'answer', targetId: uuid, reason, details? }
 *
 * Owner item ٦٩ remainder. Any signed-in user may report (no role
 * restriction — `assertRole()` with no allowlist just requires a session);
 * a guest gets the same 401 every other write-path in this codebase answers
 * with, and the button's own UI (ReportContentButton) never lets a guest
 * reach this call in the first place.
 *
 * `reporter_user_id` is ALWAYS `user.id` from the verified session — never
 * read from the request body, so a forged `reporterUserId` in the payload
 * (there isn't one in the validated shape, but the point holds even if a
 * caller sends one) can never attribute a report to someone else. RLS's own
 * `with check (reporter_user_id = auth.uid())` is the second, independent
 * enforcement of the same rule.
 *
 * A second report of the same (targetType, targetId) by the same user hits
 * the table's UNIQUE (target_type, target_id, reporter_user_id) and comes
 * back here as Postgres 23505 → 409 «سبق أن أبلغت عن هذا المحتوى» (never a
 * second row, never a silent 200 pretending a new report was recorded).
 */
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

    const validation = validateCommunityReportInput(body as CommunityReportInputBody);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { targetType, targetId, reason, details } = validation.value;

    const { data, error } = await supabase
      .from("community_reports")
      .insert({
        target_type: targetType,
        target_id: targetId,
        reporter_user_id: user.id,
        reason,
        details,
      })
      .select(COMMUNITY_REPORT_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = communityReportDbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toCommunityReportDto(data as CommunityReportRow) }, { status: 201 });
  } catch (err) {
    console.error("[community/reports POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
