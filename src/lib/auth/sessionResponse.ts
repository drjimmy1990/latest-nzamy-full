/**
 * sessionResponse — the login handshake's decision, as a pure function.
 *
 * WHY THE ROUTE EXISTS. `src/app/login/page.tsx` signed a user in with the
 * BROWSER client and then called `router.push(dest)` — a client-side
 * transition. Nothing ever checked that the SERVER had accepted the session
 * cookies before the app started rendering pages that depend on them, so a
 * handshake that half-failed (the cookie written, the server unable to verify
 * it) looked exactly like a successful login until the first server gate fired.
 * See docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md §4 and H3.
 *
 * WHY IT LIVES IN src/lib/auth AND NOT IN route.ts. A Next.js route file may
 * only export the HTTP verbs, so a helper exported from route.ts would fail
 * the build's route-type check and could not be unit-tested at all. It sits
 * beside the other pure auth predicates this directory already collects —
 * resolveAuthOutcome, routeAccess, onboardingGate — all of which are tested
 * with plain arguments and no Supabase client to mock.
 */
// Relative, with the .ts extension, so `node --test` can load this file
// directly — the `@/` alias is a tsconfig path Node does not resolve. Same
// spelling as the other tested modules in this directory.
import {
  AUTH_UNAVAILABLE_AR,
  type AuthOutcome,
} from "./resolveAuthOutcome.ts";

/** What the handshake answers with: an HTTP status and a JSON body. */
export interface SessionDecision {
  status: number;
  body: Record<string, unknown>;
}

/** The `profiles` row this route reads, or null when the row is absent. */
export interface SessionProfileRow {
  user_type?: string | null;
}

/**
 * The whole contract of GET /api/v1/auth/session.
 *
 *   ok          → 200 { userId, userType }   userType is null when the profile
 *                 row is missing or has no type — never guessed as "individual",
 *                 which is the demotion WP-2 item 6 removes from useUser.
 *   anonymous   → 401 { error }   the server did NOT accept the cookies.
 *   unavailable → 503 { error: AUTH_UNAVAILABLE_AR }   ask again; this is not
 *                 a statement that the caller is signed out.
 *
 * @param outcome  from resolveAuthOutcome(user, error)
 * @param userId   the signed-in user's id; required for `ok`
 * @param profile  the `profiles` row read with the caller's own RLS client
 */
export function sessionResponseFor(
  outcome: AuthOutcome,
  userId: string | null,
  profile: SessionProfileRow | null,
): SessionDecision {
  if (outcome === "unavailable") {
    return { status: 503, body: { error: AUTH_UNAVAILABLE_AR } };
  }

  if (outcome === "anonymous" || !userId) {
    return {
      status: 401,
      body: { error: "غير مصرح — يرجى تسجيل الدخول" },
    };
  }

  const rawType = profile?.user_type;
  const userType = typeof rawType === "string" && rawType.length > 0 ? rawType : null;

  return { status: 200, body: { userId, userType } };
}
