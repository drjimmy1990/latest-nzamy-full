/**
 * trackingUnlockCookie.ts — SERVER ONLY (node:crypto). The proof that the
 * client entered the right four digits for one tracking link (D2, owner
 * ٢٧٦), kept so he is not asked again on every reload.
 *
 *   value   "<expiry ms>.<hmac-sha256 hex>" of "track-unlock|v1|<token_hash>|<expiry>"
 *   cookie  nz_track_unlock — httpOnly, Secure, SameSite=Strict,
 *           Path=/track/<token> (one cookie per link), 12 hours.
 *
 * The key: there is no signing secret in this app's environment, and the
 * owner's rule is not to add one we can avoid. SUPABASE_SERVICE_ROLE_KEY is
 * already server-only and already required by this exact path (the page's
 * reads are service-role), so the key is DERIVED from it with a purpose label
 * — HMAC(service key, "nzamy/track-unlock-cookie/v1") — never the raw key.
 * Rotating the service key ends every unlock; clients just type the digits
 * again. No secret → no key → nobody is ever unlocked (fail closed).
 *
 * The cookie says only "the digits were right"; the page still asks the
 * database for the link's state on every view, so pausing or revoking a link
 * hides the case at once, cookie or not.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const UNLOCK_COOKIE_NAME = "nz_track_unlock";
export const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;
const PURPOSE = "nzamy/track-unlock-cookie/v1";

export function unlockCookieKey(serverSecret: string | undefined): Buffer | null {
  if (typeof serverSecret !== "string" || !serverSecret.trim()) return null;
  return createHmac("sha256", serverSecret).update(PURPOSE, "utf8").digest();
}

export function unlockCookiePath(token: string): string {
  return `/track/${token}`;
}

function mac(tokenHash: string, expMs: number, key: Buffer): string {
  return createHmac("sha256", key).update(`track-unlock|v1|${tokenHash}|${expMs}`, "utf8").digest("hex");
}

export function signUnlock(tokenHash: string, expMs: number, key: Buffer): string {
  return `${expMs}.${mac(tokenHash, expMs, key)}`;
}

export function verifyUnlock(value: string | undefined, tokenHash: string, nowMs: number, key: Buffer | null): boolean {
  if (!key || typeof value !== "string") return false;
  const m = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isSafeInteger(exp) || exp <= nowMs || exp > nowMs + UNLOCK_TTL_MS) return false;
  const want = Buffer.from(mac(tokenHash, exp, key), "hex");
  const got = Buffer.from(m[2], "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
