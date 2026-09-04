import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * DELETE /api/v1/lawyer/work-sessions/[id] — Phase 6.
 *
 * Own row only: RLS (`work_sessions` `for all using (user_id = auth.uid())`)
 * already guarantees a foreign id resolves to nothing, and the explicit
 * `.eq("user_id", user.id)` here is the same defense-in-depth every other
 * route in this tree adds on top of it. Either way a foreign or unknown id
 * deletes 0 rows, which this reads as 404 — the same
 * delete-then-check-`count` shape `contracts/[id]/obligations/[oid]/route.ts`
 * uses for its own owner-scoped delete.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { error, count } = await supabase
      .from("work_sessions")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[lawyer/work-sessions DELETE] delete failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الجلسة." }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lawyer/work-sessions DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف الجلسة." }, { status: 500 });
  }
}
