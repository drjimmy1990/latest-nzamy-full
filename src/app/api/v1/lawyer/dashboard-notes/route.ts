import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { hydrateAuthorNames, type CaseNoteRow } from "@/app/api/v1/cases/[id]/notes/_shared";
import {
  DASHBOARD_NOTE_SELECT,
  NOTES_PAGE_LIMIT,
  noteDbError,
  parseNoteCreate,
  toDashboardNoteDto,
  type DashboardNoteRow,
} from "@/lib/dashboardNotes/notesInput";
import { resolveNoteFirmId } from "./_shared";

/**
 * /api/v1/lawyer/dashboard-notes — the sticky notes wall (N3.4, owner §٤٧ ٣).
 * Backed by public.dashboard_notes (20261025_31). Read and written with the
 * caller's own session: RLS decides which notes come back (the caller's own,
 * plus the firm / case-team notes shared with him) and refuses a note linked
 * to a case he does not work on, or shared under a firm that is not the case's.
 *
 * GET  → { data: DashboardNoteDto[] } — pinned first, then the latest edit.
 * POST { body, color?, pinned?, visibility?, caseRequestId? } → { data }
 */

export async function GET() {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data, error } = await supabase
      .from("dashboard_notes")
      .select(DASHBOARD_NOTE_SELECT)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(NOTES_PAGE_LIMIT);
    if (error) {
      console.error("[dashboard-notes GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل الملاحظات." }, { status: 500 });
    }
    const rows = (data ?? []) as unknown as DashboardNoteRow[];
    // hydrateAuthorNames reads only author_user_id; it labels rows RLS already returned.
    const names = await hydrateAuthorNames(rows as unknown as CaseNoteRow[]);
    return NextResponse.json({
      data: rows.map((r) => toDashboardNoteDto(r, user.id, names.get(r.author_user_id) ?? null)),
    });
  } catch (err) {
    console.error("[dashboard-notes GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل الملاحظات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const parsed = parseNoteCreate(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const firm = await resolveNoteFirmId(supabase, user.id, input.visibility, input.caseRequestId);
    if ("error" in firm) return NextResponse.json({ error: firm.error }, { status: 400 });

    const { data, error } = await supabase
      .from("dashboard_notes")
      .insert({
        author_user_id: user.id,
        firm_id: firm.firmId,
        case_request_id: input.caseRequestId,
        body: input.body,
        color: input.color,
        pinned: input.pinned,
        visibility: input.visibility,
      })
      .select(DASHBOARD_NOTE_SELECT)
      .single();
    if (error || !data) {
      console.error("[dashboard-notes POST] insert failed:", error?.message, error?.code);
      const mapped = noteDbError(error);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return NextResponse.json({ data: toDashboardNoteDto(data as unknown as DashboardNoteRow, user.id, null) }, { status: 201 });
  } catch (err) {
    console.error("[dashboard-notes POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر حفظ الملاحظة." }, { status: 500 });
  }
}
