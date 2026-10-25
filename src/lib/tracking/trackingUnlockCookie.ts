/**
 * trackingUnlockCookie.ts — SERVER ONLY (node:crypto). The proof that the
 * client entered the right four digits for one tracking link (D2, owner
 * ٢٧٦), kept so he is not asked again on every reload.
 *
 *   value   "<expiry ms>.<hmac-sha256 hex>" of
 *           "track-unlock|v2|<token_hash>|<unlock epoch>|<expiry>"
 *   cookie  nz_track_unlock — httpOnly, Secure, SameSite=Lax,
 *           Path=/track/<token> (one cookie per link), 12 hours.
 *
 * The epoch is the link's unlock_epoch (20261026_62): the database moves it
 * on every pause, every re-activation and every change of the phone behind
 * the link, and the page reads it from case_tracking_gate on every view. A
 * cookie signed under an older epoch no longer verifies, so pausing and
 * resuming a link — or correcting the client's number — asks for the digits
 * again.
 *
 * SameSite=Lax, not Strict: the client opens the link from WhatsApp / SMS /
 * e-mail, a cross-site top-level navigation, and Strict would drop the cookie
 * there and ask for the digits on every tap. The cookie only unlocks a
 * read-only GET page; no state-changing endpoint reads it.
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
const MAX_EPOCH = 2_147_483_647; // the column is a Postgres int

export function unlockCookieKey(serverSecret: string | undefined): Buffer | null {
  if (typeof serverSecret !== "string" || !serverSecret.trim()) return null;
  return createHmac("sha256", serverSecret).update(PURPOSE, "utf8").digest();
}

export function unlockCookiePath(token: string): string {
  return `/track/${token}`;
}

/** A link's unlock epoch as the database sends it: an int ≥ 0, else not one. */
export function isUnlockEpoch(epoch: unknown): epoch is number {
  return typeof epoch === "number" && Number.isSafeInteger(epoch) && epoch >= 0 && epoch <= MAX_EPOCH;
}

function mac(tokenHash: string, epoch: number, expMs: number, key: Buffer): string {
  return createHmac("sha256", key).update(`track-unlock|v2|${tokenHash}|${epoch}|${expMs}`, "utf8").digest("hex");
}

export function signUnlock(tokenHash: string, epoch: number, expMs: number, key: Buffer): string {
  if (!isUnlockEpoch(epoch)) throw new Error("signUnlock: not an unlock epoch");
  return `${expMs}.${mac(tokenHash, epoch, expMs, key)}`;
}

/** No epoch (or a malformed one) → never unlocked. */
export function verifyUnlock(value: string | undefined, tokenHash: string, epoch: unknown, nowMs: number, key: Buffer | null): boolean {
  if (!key || typeof value !== "string" || !isUnlockEpoch(epoch)) return false;
  const m = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isSafeInteger(exp) || exp <= nowMs || exp > nowMs + UNLOCK_TTL_MS) return false;
  const want = Buffer.from(mac(tokenHash, epoch, exp, key), "hex");
  const got = Buffer.from(m[2], "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

// ─── The database's answers (case_tracking_gate / case_tracking_unlock, jsonb) ──
// Pure, so node --test loads them; trackingSnapshot.server.ts calls them.

export type TrackingGateState = "none" | "unavailable" | "paused" | "expired" | "active" | "error";
/** `epoch` is set exactly when the state is "active". */
export type TrackingGate = { state: TrackingGateState; epoch: number | null };
export type TrackingUnlock = { result: "ok"; epoch: number } | { result: "denied" | "locked" | "error" };

const GATES = new Set(["none", "unavailable", "paused", "expired", "active"]);

/** The gate's jsonb answer → a gate; anything unexpected is "error" (fail closed). */
export function parseTrackingGate(data: unknown): TrackingGate {
  const o = data && typeof data === "object" ? (data as { state?: unknown; epoch?: unknown }) : null;
  const state = typeof o?.state === "string" && GATES.has(o.state) ? (o.state as TrackingGateState) : "error";
  if (state !== "active") return { state, epoch: null };
  return isUnlockEpoch(o?.epoch) ? { state, epoch: o.epoch } : { state: "error", epoch: null };
}

/** The unlock's jsonb answer → a result; "ok" without a valid epoch is "error". */
export function parseTrackingUnlock(data: unknown): TrackingUnlock {
  const o = data && typeof data === "object" ? (data as { result?: unknown; epoch?: unknown }) : null;
  if (o?.result === "ok") return isUnlockEpoch(o.epoch) ? { result: "ok", epoch: o.epoch } : { result: "error" };
  if (o?.result === "locked") return { result: "locked" };
  if (o?.result === "denied") return { result: "denied" };
  return { result: "error" };
}
