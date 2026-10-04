/**
 * sessionCookie.ts — "can this visitor be signed in at all?", answered from
 * the cookie string alone.
 *
 * A Supabase session lives in `sb-<ref>-auth-token` (or its chunks
 * `sb-<ref>-auth-token.0`, `.1`, …); the browser client reads it through
 * document.cookie, so it is never httpOnly. With none of those cookies there
 * is no session to resolve, and a /laws side panel can show its guest state
 * at once instead of waiting on useUser().loading (owner test 2026-10-01:
 * «ملاحظاتي وتحديداتي» spun for a signed-out visitor). A present cookie
 * proves nothing — it may be expired — so the panel still waits for useUser.
 *
 * Pure, no imports: `node --test src/app/laws/components/sessionCookie.test.ts`.
 */

const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=/;

export function hasSupabaseSessionCookie(cookieString: string | null | undefined): boolean {
  return typeof cookieString === "string" && SESSION_COOKIE.test(cookieString);
}
