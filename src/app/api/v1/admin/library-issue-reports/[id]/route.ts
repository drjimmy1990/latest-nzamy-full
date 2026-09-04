import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { validateLibraryIssueStatusPatch } from "@/lib/services/feedbackInput";
import { LIBRARY_ISSUE_REPORT_SELECT, libraryIssueReportDbErrorResponse, toLibraryIssueReportDto, type LibraryIssueReportRow } from "@/app/api/v1/library/issue-reports/_shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/v1/admin/library-issue-reports/[id] { status } — triage.
 * `status` is required (matches `adminUpdateIssueReport`'s patch type in
 * feedbackService.ts, which carries no `?`). `updated_at` is bumped by
 * `trg_library_issue_reports_updated_at`, never set here. A pre-fetch with
 * `.maybeSingle()` turns "no such row" into a clean 404 instead of letting
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
      return NextResponse.json({ error: "معرّف البلاغ غير صالح." }, { status: 400 });
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

    const validation = validateLibraryIssueStatusPatch(body as Record<string, unknown>);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase.from("library_issue_reports").select("id").eq("id", id).maybeSingle();
    if (fetchError) {
      console.error("[admin/library-issue-reports/[id] PATCH] lookup failed:", fetchError.message, fetchError.code);
    }
    if (!existing) {
      return NextResponse.json({ error: "البلاغ غير موجود." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("library_issue_reports")
      .update({ status: validation.value.status })
      .eq("id", id)
      .select(LIBRARY_ISSUE_REPORT_SELECT)
      .maybeSingle();
    if (error || !data) {
      const { status, message } = libraryIssueReportDbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toLibraryIssueReportDto(data as LibraryIssueReportRow) });
  } catch (err) {
    console.error("[admin/library-issue-reports/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
