import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { parseStatusFilter, LIBRARY_ISSUE_STATUSES } from "@/lib/services/feedbackInput";
import { LIBRARY_ISSUE_REPORT_SELECT, toLibraryIssueReportDto, type LibraryIssueReportRow } from "@/app/api/v1/library/issue-reports/_shared";

/**
 * GET /api/v1/admin/library-issue-reports?status=all|new|reviewed|fixed|rejected
 * — every «أبلغ عن خطأ في هذه المادة» report (RLS's `public.is_admin()`
 * SELECT grant), newest first, with `userName` hydrated from
 * `profiles.display_name` via the service client (the allowed use of that
 * client here) — skipped for reports whose reporter account was deleted
 * (`user_id` is nullable on this table).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["admin"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const filter = parseStatusFilter(searchParams.get("status"), LIBRARY_ISSUE_STATUSES);
    if (!filter.ok) {
      return NextResponse.json({ error: `status يجب أن يكون all أو أحد: ${LIBRARY_ISSUE_STATUSES.join(", ")}` }, { status: 400 });
    }

    let query = supabase
      .from("library_issue_reports")
      .select(LIBRARY_ISSUE_REPORT_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });
    if (filter.value) query = query.eq("status", filter.value);

    const { data, error, count } = await query;
    if (error) {
      console.error("[admin/library-issue-reports GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل بلاغات المكتبة." }, { status: 500 });
    }

    const rows = (data ?? []) as LibraryIssueReportRow[];
    const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id))];
    const names = new Map<string, string | null>();
    if (userIds.length > 0) {
      try {
        const service = await createServiceClient();
        const { data: profiles, error: profilesError } = await service.from("profiles").select("id, display_name").in("id", userIds);
        if (profilesError) {
          console.error("[admin/library-issue-reports GET] profile lookup failed:", profilesError.message, profilesError.code);
        } else {
          for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
            names.set(p.id, p.display_name ?? null);
          }
        }
      } catch (err) {
        console.error("[admin/library-issue-reports GET] profile lookup threw:", err);
      }
    }

    return NextResponse.json({
      data: rows.map((row) => toLibraryIssueReportDto(row, row.user_id ? names.get(row.user_id) ?? null : null)),
      total: count ?? rows.length,
    });
  } catch (err) {
    console.error("[admin/library-issue-reports GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
