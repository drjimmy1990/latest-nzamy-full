import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * assertCaseWorker — who may call the case-file note and case-team routes.
 *
 * `assertRole(["lawyer", "firm"])` was the gate, but a firm's team is not only
 * lawyer and firm accounts: `POST /api/v1/firm/members` invites `lawyer` AND
 * `individual` accounts, and an assistant (owner decision ١٦٩: «المحامي +
 * المساعدين المرتبطين بالقضية») is usually the latter. Such a member reaches
 * the firm case page (the firm layout admits active members of any role) and
 * then got a 403 from every notes call, so «فريق القضية» would have been
 * unreadable by the very people it names.
 *
 * Admits: lawyer, firm and admin accounts, plus any account with an ACTIVE
 * `firm_members` row. RLS still decides every row (case_notes,
 * case_team_members — 20261017_41); this is defense in depth, not the gate.
 */
export async function assertCaseWorker(): ReturnType<typeof assertRole> {
  const auth = await assertRole();
  if (!auth.ok) return auth;
  if (auth.userType === "lawyer" || auth.userType === "firm" || auth.userType === "admin") return auth;

  const { data, error } = await auth.supabase
    .from("firm_members")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[assertCaseWorker] firm_members lookup failed:", error.message, error.code);
    return {
      ok: false,
      response: NextResponse.json({ error: "تعذّر التحقق من عضويتك في المكتب." }, { status: 500 }),
    };
  }
  if (!data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "غير مصرح — صلاحيات غير كافية" }, { status: 403 }),
    };
  }
  return auth;
}
