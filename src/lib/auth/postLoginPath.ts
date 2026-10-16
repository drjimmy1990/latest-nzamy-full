/**
 * Where /login sends someone after a successful sign-in when the URL carries
 * `?next=` (e.g. /laws/subscribe sends a guest to
 * `/login?next=/laws/subscribe?plan=lib-q1`).
 *
 * The value goes through safeLocalPath (same-origin only, no control
 * characters or backslashes). Pages of the sign-in flow itself are refused:
 * /login would loop through the page's own "already signed in" redirect, and
 * /register, /auth and /onboarding are not places to land after signing in
 * (the proxy sends an unfinished account to /onboarding on its own).
 *
 * Relative `.ts` import, no `@/`: `node --test` loads this file
 * (postLoginPath.test.ts).
 */
import { safeLocalPath } from "./safeLocalPath.ts";

const SIGN_IN_FLOW = ["/login", "/register", "/auth", "/onboarding"];

export function postLoginPath(next: string | null | undefined, fallback: string): string {
  const path = safeLocalPath(next, "");
  if (!path) return fallback;
  const pathname = path.split(/[?#]/)[0].toLowerCase();
  if (SIGN_IN_FLOW.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return fallback;
  return path;
}
