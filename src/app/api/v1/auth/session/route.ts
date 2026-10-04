import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthOutcome } from "@/lib/auth/resolveAuthOutcome";
import { sessionResponseFor } from "@/lib/auth/sessionResponse";

/**
 * GET /api/v1/auth/session — the login handshake.
 *
 * Contract (the decision itself is the pure sessionResponseFor in
 * src/lib/auth/sessionResponse.ts, tested in its own .test.ts; ./route.test.ts
 * pins what only this file can show):
 *   200 { userId: string, userType: string | null }  the server sees the session
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
  if (outcome === "ok" && user) {
    const { data } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  }

  const decision = sessionResponseFor(outcome, user?.id ?? null, profile);

  return NextResponse.json(decision.body, {
    status: decision.status,
    headers: { "Cache-Control": "no-store" },
  });
}
