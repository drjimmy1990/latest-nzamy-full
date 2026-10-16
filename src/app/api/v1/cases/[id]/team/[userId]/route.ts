import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { isTeamFeatureMissing } from "../_team";

/**
 * DELETE /api/v1/cases/[id]/team/[userId] — takes one explicitly added member
 * off the case team (owner decision ١٦٩, migration 20261017_41). RLS ("case
 * team removable by case managers") admits the case's lead, its filer and the
 * firm owner only; anybody else matches 0 rows, answered 404 like a row that
 * is not there. The lead and the filer are on the team by the case itself and
 * have no row to remove.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, userId } = await context.params;

    const { error, count } = await supabase
      .from("case_team_members")
      .delete({ count: "exact" })
      .eq("request_id", id)
      .eq("user_id", userId);
    if (error) {
      if (isTeamFeatureMissing(error.code)) {
        return NextResponse.json({ error: "فريق القضية غير مفعّل بعد على هذه المنصة." }, { status: 503 });
      }
      console.error("[cases/team DELETE] failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر إزالة العضو من فريق القضية." }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json(
        { error: "العضو ليس في فريق هذه القضية، أو لا تملك إدارة فريقها." },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[cases/team DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إزالة العضو من فريق القضية." }, { status: 500 });
  }
}
