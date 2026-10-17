/**
 * The post-sign-in destination across a Google sign-in (N5 follow-up).
 *
 * /login honours `?next=` / `?from=` for a password sign-in, but a Google
 * sign-in leaves the site and comes back through /auth/callback. The OAuth
 * `redirectTo` must stay a bare `/auth/callback` (the self-hosted GoTrue
 * redirect allow-list may refuse a query string, and Google sign-in would then
 * break silently), so /login stashes the destination in a short-lived
 * first-party cookie and /auth/callback reads it once and clears it.
 *
 * Both ends run the value through postLoginPath (same-origin only, never a
 * sign-in page). A missing, expired, foreign or malformed value means "no
 * stash": the callback lands on the dashboard exactly as before.
 *
 * Relative `.ts` import, no `@/`: `node --test` loads this file
 * (postLoginCookie.test.ts).
 */
import { postLoginPath } from "./postLoginPath.ts";

export const POST_LOGIN_COOKIE = "nz_post_login";
/** Ten minutes: long enough for the Google round trip, short enough to go stale. */
export const POST_LOGIN_COOKIE_MAX_AGE = 600;

/** The validated path to stash, or null when there is nothing safe to keep. */
export function stashablePostLoginPath(next: string | null | undefined): string | null {
  const path = postLoginPath(next, "");
  return path ? path : null;
}

/** `document.cookie` assignment for the stash (Secure on https). */
export function postLoginCookieAssignment(path: string, secure: boolean): string {
  return `${POST_LOGIN_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=${POST_LOGIN_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The stashed destination from the raw cookie value, validated again, or null. */
export function readPostLoginCookie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return stashablePostLoginPath(decoded);
}
