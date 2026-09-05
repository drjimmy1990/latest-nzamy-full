import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import {
  CASE_NOTE_SELECT,
  MAX_BODY_LENGTH,
  VALID_VISIBILITY,
  toCaseNoteDto,
  hydrateAuthorNames,
  caseNoteDbErrorResponse,
  type CaseNoteRow,
} from "../_shared";
import { resolveFirmVisibilityFirmId } from "../_resolveFirmVisibility";

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
    const auth = await assertRole(["lawyer", "firm"]);
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
        return NextResponse.json({ error: "نطاق الملاحظة يجب أن يكون خاصة أو ضمن المكتب." }, { status: 400 });
      }
      if (visibility === "firm") {
        const resolved = await resolveFirmVisibilityFirmId(supabase, user.id, id);
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
 * DELETE /api/v1/cases/[id]/notes/[noteId]
 * `count: "exact"` on the delete tells "deleted" apart from "matched
 * nothing" (RLS-refused or genuinely absent) without a second round-trip.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, noteId } = await context.params;

    const { error, count } = await supabase
      .from("case_notes")
      .delete({ count: "exact" })
      .eq("id", noteId)
      .eq("request_id", id);

    if (error) {
      console.error("[cases/notes DELETE] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الملاحظة." }, { status: 500 });
    }

    if (!count) {
      return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[cases/notes DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف الملاحظة." }, { status: 500 });
  }
}
