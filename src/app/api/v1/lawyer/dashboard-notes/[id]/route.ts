import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import {
  DASHBOARD_NOTE_SELECT,
  noteDbError,
  parseNotePatch,
  toDashboardNoteDto,
  type DashboardNoteRow,
  type NoteVisibility,
} from "@/lib/dashboardNotes/notesInput";
import { resolveNoteFirmId } from "../_shared";

/**
 * PATCH  /api/v1/lawyer/dashboard-notes/[id]  { body?, color?, pinned?, visibility?, caseRequestId? }
 * DELETE /api/v1/lawyer/dashboard-notes/[id]
 *
 * The author only (RLS USING author_user_id = auth.uid(); a colleague who may
 * read a shared note gets 404 here). When the scope or the linked case
 * changes, the note's firm is derived again from the NEW pair — the UPDATE
 * policy re-tests the new row with the same rule as an insert.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });

    const parsed = parseNotePatch(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const patch = parsed.value;

    const { data: current, error: readError } = await supabase
      .from("dashboard_notes")
      .select("id, visibility, case_request_id")
      .eq("id", id)
      .eq("author_user_id", user.id)
      .maybeSingle();
    if (readError) {
      console.error("[dashboard-notes PATCH] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تعديل الملاحظة." }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });

    const update: Record<string, unknown> = {};
    if (patch.body !== undefined) update.body = patch.body;
    if (patch.color !== undefined) update.color = patch.color;
    if (patch.pinned !== undefined) update.pinned = patch.pinned;

    if (patch.visibility !== undefined || patch.caseRequestId !== undefined) {
      const visibility = (patch.visibility ?? current.visibility) as NoteVisibility;
      const caseRequestId = patch.caseRequestId !== undefined ? patch.caseRequestId : (current.case_request_id as string | null);
      if (visibility === "case_team" && !caseRequestId) {
        return NextResponse.json({ error: "ملاحظة فريق القضية تحتاج قضية مرتبطة." }, { status: 400 });
      }
      const firm = await resolveNoteFirmId(supabase, user.id, visibility, caseRequestId);
      if ("error" in firm) return NextResponse.json({ error: firm.error }, { status: 400 });
      update.visibility = visibility;
      update.case_request_id = caseRequestId;
      update.firm_id = firm.firmId;
    }

    const { data, error } = await supabase
      .from("dashboard_notes")
      .update(update)
      .eq("id", id)
      .eq("author_user_id", user.id)
      .select(DASHBOARD_NOTE_SELECT)
      .maybeSingle();
    if (error) {
      console.error("[dashboard-notes PATCH] update failed:", error.message, error.code);
      const mapped = noteDbError(error);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (!data) return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });
    return NextResponse.json({ data: toDashboardNoteDto(data as unknown as DashboardNoteRow, user.id, null) });
  } catch (err) {
    console.error("[dashboard-notes PATCH] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تعديل الملاحظة." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });

    const { data, error } = await supabase
      .from("dashboard_notes")
      .delete()
      .eq("id", id)
      .eq("author_user_id", user.id)
      .select("id");
    if (error) {
      console.error("[dashboard-notes DELETE] failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الملاحظة." }, { status: 500 });
    }
    if (!data || data.length === 0) return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[dashboard-notes DELETE] unexpected:", err);
    return NextResponse.json({ error: "تعذّر حذف الملاحظة." }, { status: 500 });
  }
}
