/**
 * deviceLimitServer.ts — the I/O half of owner answer ٤٢٧ (the library device
 * limit). One call to public.library_device_check (20261108_20) as the
 * service role, with a small in-process memo in front of it.
 *
 * Callers of enforceLibraryDevice — every route that sends a subscriber the
 * library's full text, right after it knows the viewer is entitled (a guest or
 * a non-entitled viewer gets previews only and is never device-checked):
 *   GET  /api/library/laws/[slug]        (isSubscriber)
 *   GET  /api/library/decrees/[id]       (isSubscriber)
 *   GET  /api/library/precedents/[slug]  (hasFullAccess — the principles)
 *   GET  /api/library/books/[slug]       (full access, not a free book)
 *   POST /api/library/scoped-search      (hasFullAccess — article text)
 * src/app/api/library/device-limit.routes.test.ts holds them to it.
 *
 * FAILS OPEN, ALWAYS. A missing function or table (the migration not applied),
 * a missing service key, a timeout (1.5 s) or any other error lets the read go
 * on exactly as before this file existed. A Bearer caller without the device
 * cookie (the native-app path, no cookie jar) is not checked either.
 *
 * MEMO. (user, device) allowed is remembered 60 s, so a precedents collection
 * read in 24 windows costs one database call. A revoke made on another server
 * process reaches an already-open reader within that minute; one made in this
 * process clears the user's entries at once (forgetLibraryDevices).
 */
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import {
  LIBRARY_DEVICE_COOKIE,
  deviceGateDecision,
  deviceLabelFromUserAgent,
  hashDeviceId,
  isBearerWithoutDeviceCookie,
  isMissingDeviceSchema,
  isValidDeviceId,
  libraryDeviceCookieOptions,
  newDeviceId,
  parseDeviceCheckRow,
  type DeviceCheckRow,
} from "./deviceLimit";

const RPC_TIMEOUT_MS = 1_500;
const MISSING_RETRY_MS = 10 * 60 * 1000;
const ALLOWED_TTL_MS = 60 * 1000;
const EXEMPT_TTL_MS = 5 * 60 * 1000;
const MEMO_MAX = 20_000;

let schemaMissingUntil = 0;
let missingLogged = false;
const memo = new Map<string, number>();

function memoGet(key: string): boolean {
  const until = memo.get(key);
  if (until === undefined) return false;
  if (until <= Date.now()) {
    memo.delete(key);
    return false;
  }
  return true;
}

function memoSet(key: string, ttlMs: number): void {
  memo.delete(key);
  memo.set(key, Date.now() + ttlMs);
  while (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

const GLOBAL_DISABLED_KEY = "!disabled";
const userKey = (userId: string) => `${userId}\u0000!exempt`;
const deviceKey = (userId: string, hash: string) => `${userId}\u0000${hash}`;

/** Drops every memo entry of this user (after a revoke or an admin reset). */
export function forgetLibraryDevices(userId: string): void {
  const prefix = `${userId}\u0000`;
  for (const key of memo.keys()) if (key.startsWith(prefix)) memo.delete(key);
}

/** The admin changed the setting: forget "disabled" so it applies within this process at once. */
export function forgetLibraryDeviceSetting(): void {
  memo.delete(GLOBAL_DISABLED_KEY);
}

function noteMissing(code: unknown): boolean {
  if (!isMissingDeviceSchema(code)) return false;
  schemaMissingUntil = Date.now() + MISSING_RETRY_MS;
  if (!missingLogged) {
    missingLogged = true;
    console.warn("[library-device] public.library_device_check is missing (20261108_20 not applied); devices are not checked");
  }
  return true;
}

/** The device cookie's hash for this request, or null when it carries none. */
export async function currentDeviceHash(): Promise<string | null> {
  try {
    const value = (await cookies()).get(LIBRARY_DEVICE_COOKIE)?.value;
    return isValidDeviceId(value) ? hashDeviceId(value) : null;
  } catch {
    return null;
  }
}

/**
 * Owner ٤٢٧. Call it once the route knows the viewer is entitled to the full
 * text, before any text is built. null = go on; a NextResponse = the 403
 * refusal to return as it is.
 */
export async function enforceLibraryDevice(userId: string | null, entitled: boolean): Promise<NextResponse | null> {
  if (!userId || !entitled) return null;
  try {
    if (memoGet(GLOBAL_DISABLED_KEY) || memoGet(userKey(userId))) return null;
    if (Date.now() < schemaMissingUntil) return null;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

    const jar = await cookies();
    const hdrs = await headers();
    let id = jar.get(LIBRARY_DEVICE_COOKIE)?.value ?? null;
    if (isBearerWithoutDeviceCookie(hdrs.get("authorization"), id)) return null;
    if (!isValidDeviceId(id)) {
      id = newDeviceId(crypto.getRandomValues(new Uint8Array(32)));
      jar.set(LIBRARY_DEVICE_COOKIE, id, libraryDeviceCookieOptions(process.env.NODE_ENV === "production"));
    }
    const hash = hashDeviceId(id);
    if (memoGet(deviceKey(userId, hash))) return null;

    const service = await createServiceClient();
    const { data, error } = await service
      .rpc("library_device_check", {
        p_user: userId,
        p_device_hash: hash,
        p_label: deviceLabelFromUserAgent(hdrs.get("user-agent")),
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (error) {
      if (!noteMissing(error.code)) console.error("[library-device] check failed:", error.code ?? "no-code");
      return null;
    }
    const row: DeviceCheckRow | null = parseDeviceCheckRow(data);
    const decision = deviceGateDecision(row);
    if (decision.action === "allow") {
      if (decision.remember === "global") memoSet(GLOBAL_DISABLED_KEY, ALLOWED_TTL_MS);
      else if (decision.remember === "user") memoSet(userKey(userId), EXEMPT_TTL_MS);
      else if (decision.remember === "device") memoSet(deviceKey(userId, hash), ALLOWED_TTL_MS);
      return null;
    }
    return NextResponse.json(decision.body, {
      status: decision.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[library-device] check threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}

export type RevokeReason = "self" | "other_device" | "sign_out" | "admin_reset";

export type RevokeResult = { ok: true; count: number } | { ok: false; missing: boolean };

/**
 * library_device_revoke as the service role: one device of `userId` by its row
 * id or its hash, or (admin_reset, both null) all of them. Never throws.
 */
export async function revokeLibraryDevice(
  userId: string,
  target: { deviceId?: string | null; deviceHash?: string | null },
  reason: RevokeReason,
  actorId: string | null,
): Promise<RevokeResult> {
  try {
    const service = await createServiceClient();
    const { data, error } = await service.rpc("library_device_revoke", {
      p_user: userId,
      p_device_id: target.deviceId ?? null,
      p_device_hash: target.deviceHash ?? null,
      p_reason: reason,
      p_actor: actorId,
    });
    if (error) {
      const missing = isMissingDeviceSchema(error.code);
      if (!missing) console.error("[library-device] revoke failed:", error.code ?? "no-code");
      return { ok: false, missing };
    }
    forgetLibraryDevices(userId);
    return { ok: true, count: typeof data === "number" ? data : 0 };
  } catch (err) {
    console.error("[library-device] revoke threw:", err instanceof Error ? err.name : "error");
    return { ok: false, missing: false };
  }
}

export interface DeviceSettings {
  enabled: boolean;
  limit: number;
}

export type DeviceRowsRead =
  | { ok: true; rows: Record<string, unknown>[]; settings: DeviceSettings }
  | { ok: false; missing: boolean };

/** The user's ACTIVE devices (hash included — the caller drops it) and the setting. Never throws. */
export async function readLibraryDevices(userId: string): Promise<DeviceRowsRead> {
  try {
    const service = await createServiceClient();
    const [rowsRes, settingsRes] = await Promise.all([
      service
        .from("user_devices")
        .select("id, label, first_seen, last_seen, device_hash")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("last_seen", { ascending: false })
        .limit(50),
      service.from("library_monitor_settings").select("device_limit_enabled, device_limit").eq("id", true).maybeSingle(),
    ]);
    const err = rowsRes.error ?? settingsRes.error;
    if (err) {
      const missing = isMissingDeviceSchema(err.code);
      if (!missing) console.error("[library-device] read failed:", err.code ?? "no-code");
      return { ok: false, missing };
    }
    const s = (settingsRes.data ?? {}) as { device_limit_enabled?: unknown; device_limit?: unknown };
    return {
      ok: true,
      rows: (rowsRes.data ?? []) as Record<string, unknown>[],
      settings: {
        enabled: s.device_limit_enabled === true,
        limit: typeof s.device_limit === "number" ? s.device_limit : 2,
      },
    };
  } catch (err) {
    console.error("[library-device] read threw:", err instanceof Error ? err.name : "error");
    return { ok: false, missing: false };
  }
}
