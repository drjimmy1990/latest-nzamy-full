/**
 * testAccountExclusion.ts — GA4 / Clarity never count a test account (owner
 * file 19 §1ج.2, batch l9-testinfra). Pure helpers, used by
 * src/components/analytics/useTestAccountGate.ts in the browser and by
 * GET /api/v1/analytics/eligibility on the server.
 *
 * How it works:
 *   1. A browser that ever signed in as a test account carries the
 *      first-party cookie TEST_DEVICE_COOKIE (set by the eligibility route,
 *      180 days). With it, the analytics scripts never load on that browser —
 *      signed in or not: it is a tester's device.
 *   2. A signed-in visitor (a Supabase auth cookie is present) on an
 *      analytics route is checked once per page load BEFORE any script is
 *      fetched. Until the answer arrives nothing loads; a failed check loads
 *      nothing either (fail-closed for signed-in visitors only).
 *   3. A signed-out visitor without the cookie is not asked (no request).
 * The server purchase event already needs a LIVE order, which a test account
 * cannot make (20261127_80); buildPurchasePayload refuses a test order too.
 *
 * Relative / type-only imports: `node --test` loads this file.
 */

export const TEST_DEVICE_COOKIE = "nz_test_device";
/** 180 days, like the consent cookie. */
export const TEST_DEVICE_MAX_AGE_S = 180 * 24 * 60 * 60;
export const ELIGIBILITY_PATH = "/api/v1/analytics/eligibility";

function cookieNames(cookieHeader: string | null | undefined): string[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((p) => p.split("=")[0]?.trim() ?? "")
    .filter(Boolean);
}

function cookieValueOf(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** True when this browser was marked as a test account's device. */
export function isTestDevice(cookieHeader: string | null | undefined): boolean {
  return cookieValueOf(cookieHeader, TEST_DEVICE_COOKIE) === "1";
}

/**
 * True when a Supabase session cookie is present (@supabase/ssr names it
 * «sb-<project-ref>-auth-token», split into «.0», «.1» … when long). Only the
 * presence is read — never the value.
 */
export function hasSupabaseSessionCookie(cookieHeader: string | null | undefined): boolean {
  return cookieNames(cookieHeader).some((n) => /^sb-[A-Za-z0-9_-]+-auth-token(\.\d+)?$/.test(n));
}

/** The Set-Cookie value that marks a tester's browser (first-party, Lax, whole site). */
export function testDeviceCookieString(secure: boolean): string {
  return `${TEST_DEVICE_COOKIE}=1; Max-Age=${TEST_DEVICE_MAX_AGE_S}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export type TestGateState = "pending" | "ok" | "excluded";

/** What the browser does before loading anything: decide now, or ask the server. */
export function gateFromCookies(cookieHeader: string | null | undefined): TestGateState | "ask" {
  if (isTestDevice(cookieHeader)) return "excluded";
  return hasSupabaseSessionCookie(cookieHeader) ? "ask" : "ok";
}

/** The eligibility answer → the gate. Anything but an explicit { exclude: false } excludes. */
export function gateFromAnswer(ok: boolean, body: unknown): TestGateState {
  if (!ok || !body || typeof body !== "object") return "excluded";
  return (body as { exclude?: unknown }).exclude === false ? "ok" : "excluded";
}
