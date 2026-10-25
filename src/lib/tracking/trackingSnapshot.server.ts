/**
 * trackingSnapshot.server.ts — SERVER ONLY (service role, node:crypto).
 *
 * Every database read behind /track/[token] (N3.6, and D2 / owner ٢٧٦):
 *
 *   readTrackingGate   the link's state only — public.case_tracking_gate
 *                      (20261026_62): none | unavailable | paused | expired |
 *                      active, with the link's unlock epoch when active. No
 *                      case data, no view stamp. A database without
 *                      20261026_62 (the function is missing) or any failure
 *                      FAILS CLOSED: "unavailable" / "error", never the
 *                      snapshot without the digits.
 *   isTrackingUnlocked the httpOnly cookie that proves the client typed the
 *                      right 4 digits for THIS link under its CURRENT epoch
 *                      (trackingUnlockCookie.ts) — a pause, a re-activation
 *                      or a new phone number ends it.
 *   unlockTracking     public.case_tracking_unlock — the compare, the
 *                      counters, the 15-minute lock and the pause after 20
 *                      wrong tries happen in one locked row in SQL; the phone
 *                      (or its digits) never leaves the database, so it can
 *                      never reach the browser. "ok" carries the epoch the
 *                      cookie is signed with.
 *   readTrackingView   the snapshot. The token's shape is checked before
 *                      anything touches the database; only its sha256 is
 *                      sent; the answer passes the whitelist serializer.
 *                      Unknown, revoked, paused and malformed tokens are all
 *                      "none"; a database failure is "error", so a live link
 *                      is never told it was revoked.
 */

import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/services/shareSecrets";
import { isTrackingToken, toTrackingView, type TrackingView } from "@/lib/tracking/trackingView";
import { isMissingRpcError } from "@/lib/tracking/trackingLinkState";
import {
  UNLOCK_COOKIE_NAME,
  UNLOCK_TTL_MS,
  isUnlockEpoch,
  parseTrackingGate,
  parseTrackingUnlock,
  signUnlock,
  type TrackingGate,
  type TrackingUnlock,
  unlockCookieKey,
  unlockCookiePath,
  verifyUnlock,
} from "@/lib/tracking/trackingUnlockCookie";

export type TrackingRead = { state: "ok"; view: TrackingView } | { state: "none" } | { state: "error" };
export type { TrackingGate, TrackingGateState, TrackingUnlock } from "@/lib/tracking/trackingUnlockCookie";

export async function readTrackingGate(token: string): Promise<TrackingGate> {
  if (!isTrackingToken(token)) return { state: "none", epoch: null };
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("case_tracking_gate", { p_token_hash: sha256Hex(token) });
    if (error) {
      if (isMissingRpcError(error, "case_tracking_gate")) {
        // 20261026_62 has not run: never fall back to the snapshot without the digits.
        console.error("[track] case_tracking_gate is missing — run 62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql; every link shows «unavailable» until then");
        return { state: "unavailable", epoch: null };
      }
      console.error("[track] gate failed:", error.message, error.code);
      return { state: "error", epoch: null };
    }
    return parseTrackingGate(data);
  } catch (err) {
    console.error("[track] gate threw:", err instanceof Error ? err.message : err);
    return { state: "error", epoch: null };
  }
}

function cookieKey() {
  return unlockCookieKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** A signing key can be derived (else nobody is ever unlocked — fail closed). */
export function hasUnlockKey(): boolean {
  return cookieKey() !== null;
}

/** `epoch` is the gate's for THIS view; a cookie from an older epoch does not count. */
export async function isTrackingUnlocked(token: string, epoch: number | null): Promise<boolean> {
  if (!isTrackingToken(token) || !isUnlockEpoch(epoch)) return false;
  const jar = await cookies();
  return verifyUnlock(jar.get(UNLOCK_COOKIE_NAME)?.value, sha256Hex(token), epoch, Date.now(), cookieKey());
}

/** The Set-Cookie for a successful unlock at `epoch`, or null when no key can be derived (fail closed). */
export function unlockCookieFor(token: string, epoch: number, nowMs: number) {
  const key = cookieKey();
  if (!key || !isTrackingToken(token) || !isUnlockEpoch(epoch)) return null;
  return {
    name: UNLOCK_COOKIE_NAME,
    value: signUnlock(sha256Hex(token), epoch, nowMs + UNLOCK_TTL_MS, key),
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: unlockCookiePath(token),
      maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
    },
  };
}

/** `digits` must already be normalizeUnlockDigits' four ASCII digits. */
export async function unlockTracking(token: string, digits: string): Promise<TrackingUnlock> {
  if (!isTrackingToken(token)) return { result: "denied" };
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("case_tracking_unlock", { p_token_hash: sha256Hex(token), p_digits: digits });
    if (error) {
      if (isMissingRpcError(error, "case_tracking_unlock")) {
        console.error("[track] case_tracking_unlock is missing — run 62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql");
      } else {
        console.error("[track] unlock failed:", error.message, error.code);
      }
      return { result: "error" };
    }
    return parseTrackingUnlock(data);
  } catch (err) {
    console.error("[track] unlock threw:", err instanceof Error ? err.message : err);
    return { result: "error" };
  }
}

export async function readTrackingView(token: string): Promise<TrackingRead> {
  if (!isTrackingToken(token)) return { state: "none" };
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("case_tracking_snapshot", { p_token_hash: sha256Hex(token) });
    if (error) {
      console.error("[track] snapshot failed:", error.message, error.code);
      return { state: "error" };
    }
    const view = toTrackingView(data);
    return view ? { state: "ok", view } : { state: "none" };
  } catch (err) {
    console.error("[track] snapshot threw:", err instanceof Error ? err.message : err);
    return { state: "error" };
  }
}
