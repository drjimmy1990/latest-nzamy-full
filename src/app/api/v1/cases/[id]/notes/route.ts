import { NextResponse, NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import {
  CASE_NOTE_SELECT,
  MAX_BODY_LENGTH,
  VALID_VISIBILITY,
  toCaseNoteDto,
  hydrateAuthorNames,
  caseNoteDbErrorResponse,
  type CaseNoteRow,
} from "./_shared";
import { resolveCaseTeamFirmId, resolveFirmVisibilityFirmId } from "./_resolveFirmVisibility";
import { liveRowsOnly } from "@/lib/services/archivedRows";

/**
 * /api/v1/cases/[id]/notes — owner item 65 remainder ("the case file cannot
 * save a note — no table").
 *
 * Backed by `public.case_notes` (migration 20260910_case_notes.sql), the same
 * shape as `public.lawyer_client_notes` (Phase 2). `id` in the path is
 * `service_requests.id` (text) — the same case-file anchor
 * hearings/tasks/case_stages/deadlines already use; see the note on
 * src/app/api/v1/lawyer/case-stages/[caseId]/route.ts.
 *
 * `visibility` (owner decision ١٦٩): `private` = the author alone;
 * `case_team` = the case team (`public.case_team_user_ids`); `firm` = the
 * author's active firm colleagues too (through `can_access_case_row`). Since
 * 20261017_41 RLS also pins each scope's `firm_id` (`case_note_scope_ok`), so
 * the API's choice below is not the only gate. RLS already hides a
 * `private` note of someone else's from this account, and already refuses an
 * insert on a case the caller cannot read — the SELECT below asks for every
 * row this account may read and lets the policy filter; the POST below lets
 * the 42501 the DB raises on an unreadable case surface as a screen-copy 403
 * rather than a raw permission string.
 */

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    // Live notes only — archived ones (N3.9, 20261025_51) are listed by
    // /api/v1/cases/[id]/archived to the people who may restore them. RLS
    // already hides another writer's archive from a colleague; the filter
    // keeps a supervisor's normal list free of it too.
    const { data, error, count } = await liveRowsOnly((excludeArchived) => {
      let q = supabase
        .from("case_notes")
        .select(CASE_NOTE_SELECT, { count: "exact" })
        .eq("request_id", id);
      if (excludeArchived) q = q.is("deleted_at", null);
      return q.order("created_at", { ascending: false });
    });

    if (error) {
      console.error("[cases/notes GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل ملاحظات القضية." }, { status: 500 });
    }

    const rows = (data ?? []) as CaseNoteRow[];
    const names = await hydrateAuthorNames(rows);
    return NextResponse.json({
      data: rows.map((row) => toCaseNoteDto(row, user.id, names.get(row.author_user_id) ?? null)),
      total: count ?? rows.length,
    });
  } catch (err) {
    console.error("[cases/notes GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل ملاحظات القضية." }, { status: 500 });
  }
}

/**
 * POST /api/v1/cases/[id]/notes
 * Body: { body, visibility }
 *
 * `visibility: "case_team"` requires a FIRM case and an active membership in
 * that firm (`resolveCaseTeamFirmId` — a firm-less case has no team).
 *
 * `visibility: "firm"` requires the caller to be an ACTIVE member of the
 * CASE's own firm right now — the note's `firm_id` is that firm, never a
 * value the client sends, and never just any firm the caller happens to be
 * active in (see `resolveFirmVisibilityFirmId`). A caller with no qualifying
 * active membership gets a 400 rather than a silently-private note under a
 * label promising otherwise.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "معرّف القضية غير صالح." }, { status: 400 });
    }

    const requestBody = await request.json().catch(() => null);
    const { body, visibility } = (requestBody ?? {}) as { body?: string; visibility?: string };

    const trimmedBody = typeof body === "string" ? body.trim() : "";
    if (!trimmedBody) {
      return NextResponse.json({ error: "نص الملاحظة مطلوب." }, { status: 400 });
    }
    if (trimmedBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `نص الملاحظة يجب ألا يتجاوز ${MAX_BODY_LENGTH} حرفًا.` }, { status: 400 });
    }
    if (!visibility || !VALID_VISIBILITY.has(visibility)) {
      return NextResponse.json({ error: "نطاق الملاحظة يجب أن يكون: خاصة بك، أو لفريق القضية، أو لكل المكتب." }, { status: 400 });
    }

    let firmId: string | null = null;
    if (visibility === "firm" || visibility === "case_team") {
      const resolved = visibility === "firm"
        ? await resolveFirmVisibilityFirmId(supabase, user.id, id)
        : await resolveCaseTeamFirmId(supabase, user.id, id);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      firmId = resolved.firmId;
    }

    const { data, error } = await supabase
      .from("case_notes")
      .insert({
        request_id: id,
        author_user_id: user.id,
        firm_id: firmId,
        body: trimmedBody,
        visibility,
      })
      .select(CASE_NOTE_SELECT)
      .single();

    if (error || !data) {
      console.error("[cases/notes POST] insert error:", error?.message, error?.code);
      const mapped = caseNoteDbErrorResponse(error);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    const row = data as CaseNoteRow;
    const names = await hydrateAuthorNames([row]);
    return NextResponse.json({ data: toCaseNoteDto(row, user.id, names.get(user.id) ?? null) });
  } catch (err) {
    console.error("[cases/notes POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ الملاحظة." }, { status: 500 });
  }
}
