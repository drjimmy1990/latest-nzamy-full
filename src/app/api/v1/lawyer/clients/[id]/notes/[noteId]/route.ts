import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * DELETE /api/v1/lawyer/clients/[id]/notes/[noteId]
 *
 * RLS ("client notes deletable by author") already restricts the delete to
 * the note's own author — this route adds `client_id = id` on top so a
 * caller cannot delete a note by guessing its id from under the wrong
 * client's URL. `count: "exact"` on the delete tells apart "deleted" from
 * "matched nothing" without a second round-trip.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, noteId } = await context.params;

    const { error, count } = await supabase
      .from("lawyer_client_notes")
      .delete({ count: "exact" })
      .eq("id", noteId)
      .eq("client_id", id);

    if (error) {
      console.error("[lawyer/clients/notes DELETE] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الملاحظة." }, { status: 500 });
    }

    if (!count) {
      return NextResponse.json({ error: "الملاحظة غير موجودة." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[lawyer/clients/notes DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف الملاحظة." }, { status: 500 });
  }
}
