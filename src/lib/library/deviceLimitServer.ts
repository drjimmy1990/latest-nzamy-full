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
 * on exactly as before this file existed.
 *
 * NO DEVICE ID (controller ruling on question E, 2026-11-08). A Bearer caller
 * without the `nz_lib_device` cookie cannot keep a minted id, so while the
 * limit is ON its entitled read is refused (403 device_cookie_required);
 * while it is off, or for staff, nothing changes. A future phone app sends its
 * own device id as that cookie (deviceLimit.ts DEVICE_COOKIE_REQUIRED_CODE).
 *
 * OWNER ٤٠ (18 Nov 2026, 20261127_60) — still only while the admin's switch
 * device_limit_enabled is on. The check is public.library_device_gate:
 *   - a never-verified device needs the e-mail code first (403
 *     device_code_required; the code is sent and checked by
 *     /api/v1/library/devices/code and /verify);
 *   - a verified device opening with a session it did not open with before
 *     only records it: since 20261129_40 (register 14 item 9, gap #20.3) the
 *     rule is the LIBRARY's — it never ends another session of the account
 *     (20261127_60 did, which signed the user out of the whole platform);
 *   - a never-verified device while the verified ones fill the limit (the
 *     third device) is REFUSED with the list of devices (403 device_limit) —
 *     owner ٦٣ (18 Nov evening, batch l8) removed batch 7's suspension: the
 *     user removes an old device (on the refusal or at /laws/my), and this
 *     device then asks for its e-mail code. 20261127_60 answered "suspend"
 *     there (20261129_40 answers "refused"); deviceGateDecision reads both as
 *     the refusal.
 *   When this server cannot send a code (no e-mail provider or no pepper) a
 *   new device with room is registered at once, as before — never a lock-out.
 *   Before 20261127_60 runs, the old library_device_check answers instead.
 *
 * MEMO. (user, device, session) allowed is remembered 60 s, so a precedents
 * collection read in 24 windows costs one database call. A revoke made on another server
 * process reaches an already-open reader within that minute; one made in this
 * process clears the user's entries at once (forgetLibraryDevices).
 */
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email/sendEmail";
import {
  LIBRARY_DEVICE_COOKIE,
  deviceCodePepper,
  cookielessGateDecision,
  deviceGateDecision,
  deviceLabelFromUserAgent,
  hashDeviceId,
  isBearerWithoutDeviceCookie,
  isMissingDeviceSchema,
  isValidDeviceId,
  libraryDeviceCookieOptions,
  newDeviceId,
  parseDeviceCheckRow,
  type CookielessState,
  type DeviceCheckRow,
  type DeviceGateDecision,
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
const deviceKey = (userId: string, hash: string, session: string | null = null) =>
  `${userId}\u0000${hash}\u0000${session ?? ""}`;

/** The gate function of 20261127_60 is missing: use library_device_check (20261108_20) until it runs. */
let gateMissingUntil = 0;
const isMissingFunction = (code: unknown) => code === "PGRST202" || code === "42883";

/** True when this server can issue the e-mail code of a new device (owner ٤٠). */
export function deviceCodesAvailable(): boolean {
  return emailConfigured() && deviceCodePepper(process.env) !== null;
}

/**
 * The auth session id of this request (the JWT's session_id claim), or null.
 * null = the gate never ends another session for this read (it cannot tell
 * which one is this device's).
 */
export async function currentSessionId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const sid = (data?.claims as { session_id?: unknown } | undefined)?.session_id;
    return typeof sid === "string" && /^[0-9a-f-]{36}$/i.test(sid) ? sid : null;
  } catch {
    return null;
  }
}

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
    // Ruling on question E: a Bearer caller has no cookie jar to mint into, so
    // while the limit is on it is refused unless it sends its own device id.
    if (isBearerWithoutDeviceCookie(hdrs.get("authorization"), id)) {
      return finish(userId, null, cookielessGateDecision(await readCookielessState()));
    }
    if (!isValidDeviceId(id)) {
      id = newDeviceId(crypto.getRandomValues(new Uint8Array(32)));
      jar.set(LIBRARY_DEVICE_COOKIE, id, libraryDeviceCookieOptions(process.env.NODE_ENV === "production"));
    }
    const hash = hashDeviceId(id);
    const session = await currentSessionId();
    if (memoGet(deviceKey(userId, hash, session))) return null;

    const service = await createServiceClient();
    const label = deviceLabelFromUserAgent(hdrs.get("user-agent"));
    let data: unknown = null;
    let error: { code?: string } | null = null;
    // Owner ٤٠: library_device_gate (20261127_60); the old check until it runs.
    if (Date.now() >= gateMissingUntil) {
      ({ data, error } = await service
        .rpc("library_device_gate", {
          p_user: userId,
          p_device_hash: hash,
          p_label: label,
          p_session: session,
          p_code_required: deviceCodesAvailable(),
        })
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS)));
      if (error && isMissingFunction(error.code)) {
        gateMissingUntil = Date.now() + MISSING_RETRY_MS;
        error = null;
        data = undefined;
      }
    }
    if (data === undefined || Date.now() < gateMissingUntil) {
      ({ data, error } = await service
        .rpc("library_device_check", { p_user: userId, p_device_hash: hash, p_label: label })
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS)));
    }
    if (error) {
      if (!noteMissing(error.code)) console.error("[library-device] check failed:", error.code ?? "no-code");
      return null;
    }
    const row: DeviceCheckRow | null = parseDeviceCheckRow(data);
    return finish(userId, hash, deviceGateDecision(row), session);
  } catch (err) {
    console.error("[library-device] check threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}

/** Memoise an allow as the decision says; a refusal becomes the 403, never remembered. */
function finish(
  userId: string,
  hash: string | null,
  decision: DeviceGateDecision,
  session: string | null = null,
): NextResponse | null {
  if (decision.action === "allow") {
    if (decision.remember === "global") memoSet(GLOBAL_DISABLED_KEY, ALLOWED_TTL_MS);
    else if (decision.remember === "user") memoSet(userKey(userId), EXEMPT_TTL_MS);
    else if (decision.remember === "device" && hash) memoSet(deviceKey(userId, hash, session), ALLOWED_TTL_MS);
    return null;
  }
  return NextResponse.json(decision.body, {
    status: decision.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * The switch for a caller with no device id (no RPC: there is no device to
 * register). Never throws; unknown = null, which fails open.
 */
async function readCookielessState(): Promise<CookielessState> {
  const unknown: CookielessState = { enabled: null, limit: 2 };
  try {
    const service = await createServiceClient();
    const settings = await service
      .from("library_monitor_settings")
      .select("device_limit_enabled, device_limit")
      .eq("id", true)
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
      .maybeSingle();
    if (settings.error) {
      if (!noteMissing(settings.error.code)) console.error("[library-device] settings read failed:", settings.error.code ?? "no-code");
      return unknown;
    }
    const s = (settings.data ?? null) as { device_limit_enabled?: unknown; device_limit?: unknown } | null;
    if (!s) return unknown;
    const limit = typeof s.device_limit === "number" ? s.device_limit : 2;
    // O2 (20261201_10): no staff exemption, so the profile is not read.
    return { enabled: s.device_limit_enabled === true, limit };
  } catch (err) {
    console.error("[library-device] cookieless read threw:", err instanceof Error ? err.name : "error");
    return unknown;
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
      // "*": verified_at exists only after 20261127_60; a pending (never
      // verified) device is not one of the account's devices yet (owner ٤٠).
      service
        .from("user_devices")
        .select("*")
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
      rows: ((rowsRes.data ?? []) as Record<string, unknown>[])
        .filter((r) => !("verified_at" in r) || r.verified_at !== null)
        .map((r) => ({
          id: r.id,
          label: r.label,
          first_seen: r.first_seen,
          last_seen: r.last_seen,
          device_hash: r.device_hash,
        })),
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
