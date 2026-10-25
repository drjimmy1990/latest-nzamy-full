/**
 * trackingSnapshot.server.ts — SERVER ONLY (service role, node:crypto).
 *
 * Every database read behind /track/[token] (N3.6, and D2 / owner ٢٧٦):
 *
 *   readTrackingGate   the link's state only — public.case_tracking_gate
 *                      (20261026_62): none | unavailable | paused | expired |
 *                      active. No case data, no view stamp. "v1" when the
 *                      database predates 20261026_62 (the page then runs as
 *                      v1: no digits asked, nothing to pause).
 *   isTrackingUnlocked the httpOnly cookie that proves the client typed the
 *                      right 4 digits for THIS link (trackingUnlockCookie.ts).
 *   unlockTracking     public.case_tracking_unlock — the compare, the counter
 *                      and the 15-minute lock happen in one locked row in
 *                      SQL; the phone (or its digits) never leaves the
 *                      database, so it can never reach the browser.
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
  signUnlock,
  unlockCookieKey,
  unlockCookiePath,
  verifyUnlock,
} from "@/lib/tracking/trackingUnlockCookie";

export type TrackingRead = { state: "ok"; view: TrackingView } | { state: "none" } | { state: "error" };
export type TrackingGate = "none" | "unavailable" | "paused" | "expired" | "active" | "v1" | "error";
export type TrackingUnlock = "ok" | "denied" | "locked" | "v1" | "error";

const GATES = new Set(["none", "unavailable", "paused", "expired", "active"]);

export async function readTrackingGate(token: string): Promise<TrackingGate> {
  if (!isTrackingToken(token)) return "none";
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("case_tracking_gate", { p_token_hash: sha256Hex(token) });
    if (error) {
      if (isMissingRpcError(error, "case_tracking_gate")) return "v1";
      console.error("[track] gate failed:", error.message, error.code);
      return "error";
    }
    return typeof data === "string" && GATES.has(data) ? (data as TrackingGate) : "error";
  } catch (err) {
    console.error("[track] gate threw:", err instanceof Error ? err.message : err);
    return "error";
  }
}

function cookieKey() {
  return unlockCookieKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function isTrackingUnlocked(token: string): Promise<boolean> {
  if (!isTrackingToken(token)) return false;
  const jar = await cookies();
  return verifyUnlock(jar.get(UNLOCK_COOKIE_NAME)?.value, sha256Hex(token), Date.now(), cookieKey());
}

/** The Set-Cookie for a successful unlock, or null when no key can be derived (fail closed). */
export function unlockCookieFor(token: string, nowMs: number) {
  const key = cookieKey();
  if (!key || !isTrackingToken(token)) return null;
  return {
    name: UNLOCK_COOKIE_NAME,
    value: signUnlock(sha256Hex(token), nowMs + UNLOCK_TTL_MS, key),
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "strict" as const,
      path: unlockCookiePath(token),
      maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
    },
  };
}

/** `digits` must already be normalizeUnlockDigits' four ASCII digits. */
export async function unlockTracking(token: string, digits: string): Promise<TrackingUnlock> {
  if (!isTrackingToken(token)) return "denied";
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("case_tracking_unlock", { p_token_hash: sha256Hex(token), p_digits: digits });
    if (error) {
      if (isMissingRpcError(error, "case_tracking_unlock")) return "v1";
      console.error("[track] unlock failed:", error.message, error.code);
      return "error";
    }
    return data === "ok" || data === "locked" ? data : "denied";
  } catch (err) {
    console.error("[track] unlock threw:", err instanceof Error ? err.message : err);
    return "error";
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
