import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthOutcome } from "@/lib/auth/resolveAuthOutcome";
import { sessionResponseFor } from "@/lib/auth/sessionResponse";
import { recordStaffLogin, currentAccessToken } from "@/lib/auth/staffMfaServer";

/**
 * GET /api/v1/auth/session — the login handshake.
 *
 * Contract (the decision itself is the pure sessionResponseFor in
 * src/lib/auth/sessionResponse.ts, tested in its own .test.ts; ./route.test.ts
 * pins what only this file can show):
 *   200 { userId: string, userType: string | null,   the server sees the session
 *         defaultDashboardPath?: "/dashboard/firm" }  (present for an active firm member)
 *   401 { error: "غير مصرح — يرجى تسجيل الدخول" }     the server did NOT accept it
 *   503 { error: AUTH_UNAVAILABLE_AR }                the check could not be made
 *
 * `userType` comes from `profiles` read through the caller's own RLS-scoped
 * client ("users read own profile") — never the service role, and never guessed:
 * a missing row answers `null`, which is what the caller must react to.
 *
 * Never cached. A cached answer here would tell the next visitor on a shared
 * machine about the previous one's session.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const outcome = resolveAuthOutcome(user, authError);

  // Only read `profiles` when there is a user to read it for.
  let profile: { user_type?: string | null } | null = null;
  // N01-25/26/27: an ACTIVE firm membership moves a lawyer/individual's
  // landing to /dashboard/firm (src/lib/auth/firmLanding.ts). Own-row RLS read
  // ("<x>_members: own row …" — the same arm src/proxy.ts uses), in parallel
  // with the profile. A failed read counts as "not a member": the landing
  // falls back to the type's own dashboard, which is today's behaviour.
  let isActiveFirmMember = false;
  if (outcome === "ok" && user) {
    const [profileRead, membershipRead] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_type")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("firm_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);
    profile = profileRead.data;
    if (membershipRead.error) {
      console.error("[auth/session] firm membership read failed:", membershipRead.error.message, membershipRead.error.code);
    } else {
      isActiveFirmMember = !!membershipRead.data;
    }
  }

  const decision = sessionResponseFor(outcome, user?.id ?? null, profile, isActiveFirmMember);

  // Owner item 18 (batch l7): the new-login alert of a STAFF account, at the
  // password step (aal1) — the moment that tells the admin a password leaked.
  // After the answer, so the login never waits on it. The trail row and the
  // e-mail are written by staffMfaServer (service role, staff only); the
  // answer above stays the RLS-scoped decision it always was.
  if (outcome === "ok" && user && profile?.user_type === "admin") {
    const accessToken = await currentAccessToken(supabase);
    after(() => recordStaffLogin({ user, accessToken, trigger: "login" }));
  }

  return NextResponse.json(decision.body, {
    status: decision.status,
    headers: { "Cache-Control": "no-store" },
  });
}
