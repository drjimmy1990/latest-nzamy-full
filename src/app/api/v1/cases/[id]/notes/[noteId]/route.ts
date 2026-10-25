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
} from "../_shared";
import { resolveCaseTeamFirmId, resolveFirmVisibilityFirmId } from "../_resolveFirmVisibility";
import { ARCHIVE_UNAVAILABLE_AR, isMissingFunctionError } from "@/lib/services/archivedRows";

/**
 * PATCH /api/v1/cases/[id]/notes/[noteId]
 * Body: { body?, visibility? } — at least one, both optional independently.
 *
 * RLS ("case notes updatable by author") already restricts the update to the
 * note's own author — `request_id = id` on top of that so a caller cannot
 * touch a note by guessing its id from under the wrong case's URL. A 0-row
 * result (RLS refused, or the row is simply not there) reads the same either
 * way to the caller: 404, never a raw 42501.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id, noteId } = await context.params;

    const requestBody = await request.json().catch(() => null);
    const { body, visibility } = (requestBody ?? {}) as { body?: string; visibility?: string };

    if (body === undefined && visibility === undefined) {
      return NextResponse.json({ error: "لا يوجد تعديل لحفظه." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};

    if (body !== undefined) {
      const trimmedBody = typeof body === "string" ? body.trim() : "";
      if (!trimmedBody) {
        return NextResponse.json({ error: "نص الملاحظة مطلوب." }, { status: 400 });
      }
      if (trimmedBody.length > MAX_BODY_LENGTH) {
        return NextResponse.json({ error: `نص الملاحظة يجب ألا يتجاوز ${MAX_BODY_LENGTH} حرفًا.` }, { status: 400 });
      }
      patch.body = trimmedBody;
    }

    if (visibility !== undefined) {
      if (!VALID_VISIBILITY.has(visibility)) {
        return NextResponse.json({ error: "نطاق الملاحظة يجب أن يكون: خاصة بك، أو لفريق القضية، أو لكل المكتب." }, { status: 400 });
      }
      if (visibility === "firm" || visibility === "case_team") {
        const resolved = visibility === "firm"
          ? await resolveFirmVisibilityFirmId(supabase, user.id, id)
          : await resolveCaseTeamFirmId(supabase, user.id, id);
        if ("error" in resolved) {
          return NextResponse.json({ error: resolved.error }, { status: 400 });
        }
        patch.firm_id = resolved.firmId;
      } else {
        patch.firm_id = null;
      }
      patch.visibility = visibility;
    }

    const { data, error } = await supabase
      .from("case_notes")
      .update(patch)
      .eq("id", noteId)
      .eq("request_id", id)
      .select(CASE_NOTE_SELECT);

    if (error) {
      console.error("[cases/notes PATCH] update failed:", error.message, error.code);
      const mapped = caseNoteDbErrorResponse(error);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    const rows = (data ?? []) as CaseNoteRow[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "الملاحظة غير موجودة أو لا تملك صلاحية تعديلها." }, { status: 404 });
    }

    const names = await hydrateAuthorNames(rows);
    return NextResponse.json({
      data: toCaseNoteDto(rows[0], user.id, names.get(rows[0].author_user_id) ?? null),
    });
  } catch (err) {
    console.error("[cases/notes PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ التعديل." }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/cases/[id]/notes/[noteId] — ARCHIVES the note (N3.9, owner
 * directive ٥: no hard delete). public.archive_case_note (20261025_51) lets the
 * author archive his own live note; the row stays, the firm owner is notified
 * (unless the note was private) and the case's supervisors can restore it from
 * «المحذوفات». Sessions hold no DELETE privilege on case_notes any more.
 *
 * Before 20261025_51 runs the function is missing: the answer is a 503 that
 * says so — never a hard delete in its place.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, noteId } = await context.params;

    // The note must belong to THIS case: the function takes only the id, so
    // the path's case is checked first through RLS (a note the caller cannot
    // read answers 404 like a missing one).
    const { data: own, error: readError } = await supabase
      .from("case_notes")
      .select("id")
      .eq("id", noteId)
      .eq("request_id", id)
      .maybeSingle();
    if (readError) {
      console.error("[cases/notes DELETE] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر أرشفة الملاحظة." }, { status: 500 });
    }
    if (!own) {
      return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });
    }

    const { data: archived, error } = await supabase.rpc("archive_case_note", { p_note: noteId });
    if (error) {
      if (isMissingFunctionError(error)) {
        return NextResponse.json({ error: ARCHIVE_UNAVAILABLE_AR }, { status: 503 });
      }
      console.error("[cases/notes DELETE] archive failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر أرشفة الملاحظة." }, { status: 500 });
    }
    if (archived !== true) {
      return NextResponse.json({ error: "لا يؤرشف الملاحظة إلا كاتبها." }, { status: 403 });
    }

    return NextResponse.json({ archived: true });
  } catch (err) {
    console.error("[cases/notes DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر أرشفة الملاحظة." }, { status: 500 });
  }
}
