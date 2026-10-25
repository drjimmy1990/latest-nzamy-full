import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  resolveAuthOutcome,
  AUTH_UNAVAILABLE_AR,
  type AuthErrorLike,
} from "@/lib/auth/resolveAuthOutcome";
import { freezeStateFromUser, ACCOUNT_FROZEN_AR } from "@/lib/auth/accountFreeze";

/**
 * The API half of resolveAuthOutcome: one place that decides what an HTTP
 * handler returns when `supabase.auth.getUser()` could not be answered.
 *
 * Every `/api` gate in this app is the same three lines — `getUser()`, then
 * `if (authError || !user) → 401`. That second line cannot tell "no session"
 * from "no answer", so a TLS or egress failure came back to the browser as
 * `Unauthorized` (UAT-LIVE-SESSION-001) and every client treated it as a
 * sign-out. The sweep that introduced this file inserts `isAuthUnavailable`
 * ahead of each of those gates and narrows the gate itself to `!user`, so:
 *
 *   unavailable → 503 { error: AUTH_UNAVAILABLE_AR }   (never 401)
 *   anonymous   → the route's own existing 401, unchanged
 *   ok          → continue
 *
 * Deliberately NOT collapsing the 401 bodies: routes answer with either
 * "Unauthorized" or «غير مصرح — يرجى تسجيل الدخول» today and clients read those
 * strings. This file changes what happens on `unavailable` and nothing else.
 */

/** The single 503 every transport failure returns, body and status in one place. */
export function authUnavailableResponse(): NextResponse {
  return NextResponse.json({ error: AUTH_UNAVAILABLE_AR }, { status: 503 });
}

/**
 * True when the session check could not be performed at all — the caller must
 * return `authUnavailableResponse()` and must NOT return 401.
 */
export function isAuthUnavailable(
  user: unknown,
  error?: AuthErrorLike | null,
): boolean {
  return resolveAuthOutcome(user, error) === "unavailable";
}

/**
 * The whole gate for new routes: `getUser()` + both failure answers.
 *
 * Returns the user, or the `NextResponse` the handler should return as-is:
 *
 *   const auth = await requireApiUser(supabase);
 *   if (auth instanceof NextResponse) return auth;
 *   const { user } = auth;
 *
 * `unauthorizedBody` exists so a route keeps its own Arabic 401 copy; the
 * default matches the majority spelling in src/app/api.
 */
export async function requireApiUser(
  supabase: SupabaseClient,
  unauthorizedBody: Record<string, unknown> = { error: "Unauthorized" },
  options: { allowFrozen?: boolean } = {},
): Promise<{ user: User } | NextResponse> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const outcome = resolveAuthOutcome(user, authError);
  if (outcome === "unavailable") return authUnavailableResponse();
  if (!user) return NextResponse.json(unauthorizedBody, { status: 401 });

  // D6: a frozen account is refused unless the route is one of the few it
  // must still reach (its own deletion status and «استعادة الحساب»).
  if (!options.allowFrozen) {
    const frozen = frozenAccountResponse(user);
    if (frozen) return frozen;
  }

  return { user };
}

/**
 * D6 (owner ٢٩٨): the 403 a frozen account (a pending deletion) gets from a
 * route that writes, or null to go on. For the routes that do their own
 * `getUser()` instead of assertRole (which refuses a frozen account itself):
 *
 *   if (!user) return …401…;
 *   const frozen = frozenAccountResponse(user);
 *   if (frozen) return frozen;
 *
 * Reads only `app_metadata.account_deletion` of the user getUser() returned
 * (no query). Anything but status "frozen" — no claim, a malformed one — is
 * NOT frozen, so no ordinary account is ever locked out by it.
 */
export function frozenAccountResponse(user: unknown): NextResponse | null {
  if (!freezeStateFromUser(user).frozen) return null;
  return NextResponse.json(
    { error: ACCOUNT_FROZEN_AR, code: "account_frozen" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
