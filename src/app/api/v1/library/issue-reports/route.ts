import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { validateLibraryIssueReportInput } from "@/lib/services/feedbackInput";
import { LIBRARY_ISSUE_REPORT_SELECT, libraryIssueReportDbErrorResponse, toLibraryIssueReportDto, type LibraryIssueReportRow } from "./_shared";

/**
 * POST /api/v1/library/issue-reports — «أبلغ عن خطأ في هذه المادة».
 * Signed-in only. A guest gets 401 with «سجّل الدخول لإرسال البلاغ» — the
 * exact copy the screen shows, kept here rather than left to
 * `assertRole`'s generic 401 because this is the only server-side place
 * that string can live before a caller of `feedbackService` exists.
 * `user_id` always comes from the session, never the body.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) {
      return NextResponse.json({ error: "سجّل الدخول لإرسال البلاغ" }, { status: 401 });
    }
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

    const validation = validateLibraryIssueReportInput(body as Record<string, unknown>);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const input = validation.value;

    const { data, error } = await supabase
      .from("library_issue_reports")
      .insert({
        user_id: user.id,
        law_slug: input.lawSlug,
        article_ref: input.articleRef,
        kind: input.kind,
        description: input.description,
      })
      .select(LIBRARY_ISSUE_REPORT_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = libraryIssueReportDbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toLibraryIssueReportDto(data as LibraryIssueReportRow) }, { status: 201 });
  } catch (err) {
    console.error("[library/issue-reports POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
