import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { isMissingColumnError } from "@/lib/services/archivedRows";
import {
  CLIENT_NOTES_ARCHIVE_UNAVAILABLE_AR, NOTE_SELECT_WITH_ARCHIVE, toNoteDto, type NoteRow,
} from "../_shared";

/**
 * /api/v1/lawyer/clients/[id]/notes/[noteId]
 *
 * CODE-F36 (owner package 2026-10-30): «حذف» is ARCHIVE now, with an undo.
 *
 *   DELETE  archives the note: sets `deleted_at` (the 20261030_30 trigger
 *           stamps the time and `deleted_by` from the session). The row stays;
 *           it leaves the normal list and appears in the author's «المؤرشفة».
 *           Answers 200 { data } — the archived note, so the screen can offer
 *           «تراجع» against the row the server holds.
 *   PATCH   { action: "restore" } — brings an archived note back.
 *
 * Both are the AUTHOR's alone, as delete was: `author_user_id = caller` here,
 * and the RLS update policy says the same. `client_id = id` on top, so a note
 * cannot be reached from under another client's URL.
 *
 * Before migration 20261030_30 runs there is no `deleted_at` column: both
 * answer 503 CLIENT_NOTES_ARCHIVE_UNAVAILABLE_AR. Nothing is ever hard-deleted
 * in its place — and after the migration the API roles hold no DELETE at all.
 *
 * Retention: an archived note is kept until its author restores it — no
 * automatic purge (see the migration header).
 */

async function setArchived(
  context: { params: Promise<{ id: string; noteId: string }> },
  archive: boolean,
  tag: string,
) {
  const auth = await assertRole(["lawyer", "firm"]);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;
  const { id, noteId } = await context.params;

  let query = supabase
    .from("lawyer_client_notes")
    // The value is a placeholder for «now»: the trigger overwrites it with the
    // server's now() and stamps deleted_by itself.
    .update({ deleted_at: archive ? new Date().toISOString() : null })
    .eq("id", noteId)
    .eq("client_id", id)
    .eq("author_user_id", user.id);
  query = archive ? query.is("deleted_at", null) : query.not("deleted_at", "is", null);
  const { data, error } = await query.select(NOTE_SELECT_WITH_ARCHIVE).maybeSingle();

  if (isMissingColumnError(error, "deleted_at")) {
    return NextResponse.json({ error: CLIENT_NOTES_ARCHIVE_UNAVAILABLE_AR }, { status: 503 });
  }
  if (error) {
    console.error(`[lawyer/clients/notes ${tag}] update failed:`, error.message, error.code);
    if (error.code === "42501") {
      return NextResponse.json({ error: "لا تملك صلاحية تعديل هذه الملاحظة." }, { status: 403 });
    }
    return NextResponse.json({ error: archive ? "تعذّرت أرشفة الملاحظة." : "تعذّرت استعادة الملاحظة." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: archive ? "الملاحظة غير موجودة أو مؤرشفة من قبل." : "الملاحظة غير موجودة في المؤرشفة." },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: toNoteDto(data as NoteRow, user.id) });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    return await setArchived(context, true, "DELETE(archive)");
  } catch (err) {
    console.error("[lawyer/clients/notes DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت أرشفة الملاحظة." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const body = (await request.json().catch(() => null)) as { action?: string } | null;
    if (body?.action !== "restore") {
      return NextResponse.json({ error: "الإجراء غير معروف." }, { status: 400 });
    }
    return await setArchived(context, false, "PATCH(restore)");
  } catch (err) {
    console.error("[lawyer/clients/notes PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت استعادة الملاحظة." }, { status: 500 });
  }
}
