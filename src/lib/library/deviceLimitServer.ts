/**
 * deviceLimitServer.ts — the library's side of the device limit.
 *
 * BATCH l19 (owner ٢٣٣ / LIVE-17, 27 Nov 2026): the limit is now the WHOLE
 * account's — one mobile + one computer, registered silently, an extra device
 * refused («تواصل مع الإدارة»), admins and staff exempt. The decision is
 * public.account_device_gate (20261209_40) through
 * src/lib/devices/accountDeviceGate.ts, the same code the proxy's page hook
 * runs. The library-only gate of owner ٤٢٧ / ٤٠ / ٦٣ (library_device_gate,
 * the e-mail code of a new device, the old switch device_limit_enabled) is
 * retired: no code here calls it any more, so the old switch has no effect.
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
 * FAILS OPEN, ALWAYS (accountDeviceGate.ts raises the admin alert).
 *
 * A REQUEST WITH NO DEVICE COOKIE gets one minted and asked about at once: a
 * candidate while its class is free (it takes the slot only if it comes back
 * after 2 minutes, so a reader's parallel first reads never lock the first
 * device out), refused when the class is taken. A Bearer caller with no
 * cookie (the extension, the Word add-in, MCP — question ٢٠٧ still open) has
 * no cookie jar: it is never checked and never handed an id.
 */
import "server-only";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email/sendEmail";
import {
  LIBRARY_DEVICE_COOKIE,
  deviceCodePepper,
  hashDeviceId,
  isBearerWithoutDeviceCookie,
  isMissingDeviceSchema,
  isValidDeviceId,
  libraryDeviceCookieOptions,
} from "./deviceLimit";
import { accountDeviceRefusalBody } from "@/lib/devices/accountDevice";
import {
  accountDeviceOutcome,
  forgetAccountDevices,
  forgetAccountDeviceSwitch,
  loadAccountDeviceSwitch,
} from "@/lib/devices/accountDeviceGate";

/** True when this server can issue the e-mail code of a new device (owner ٤٠; retired by ٢٣٣, kept for the old routes). */
export function deviceCodesAvailable(): boolean {
  return emailConfigured() && deviceCodePepper(process.env) !== null;
}

/**
 * The auth session id of this request (the JWT's session_id claim), or null.
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

/** Drops this process's memo of this user (after a revoke or an admin reset). */
export function forgetLibraryDevices(userId: string): void {
  forgetAccountDevices(userId);
}

/** The admin changed the setting: forget this process's copy so it applies at once here. */
export function forgetLibraryDeviceSetting(): void {
  forgetAccountDeviceSwitch();
}

/**
 * Owner ٢٣٣: is the account device limit on? (30 s per process; unknown =
 * off.) While it is on, signing out and removing a device free no place —
 * switching devices goes through the administration.
 */
export async function accountDeviceLimitOn(): Promise<boolean> {
  try {
    return await loadAccountDeviceSwitch();
  } catch {
    return false;
  }
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
 * Call it once the route knows the viewer is entitled to the full text,
 * before any text is built. null = go on; a NextResponse = the 403 refusal
 * (`account_device_limit`) to return as it is.
 */
export async function enforceLibraryDevice(userId: string | null, entitled: boolean): Promise<NextResponse | null> {
  if (!userId || !entitled) return null;
  try {
    const jar = await cookies();
    const hdrs = await headers();
    const raw = jar.get(LIBRARY_DEVICE_COOKIE)?.value ?? null;
    const bearerOnly = isBearerWithoutDeviceCookie(hdrs.get("authorization"), raw);
    // No cookie jar: a minted id would be lost and every read a new device.
    if (bearerOnly) return null;
    const outcome = await accountDeviceOutcome({
      userId,
      deviceId: isValidDeviceId(raw) ? raw : null,
      userAgent: hdrs.get("user-agent"),
      chUaMobile: hdrs.get("sec-ch-ua-mobile"),
    });
    if (outcome.kind === "pass") {
      if (outcome.setDeviceId) {
        jar.set(LIBRARY_DEVICE_COOKIE, outcome.setDeviceId, libraryDeviceCookieOptions(process.env.NODE_ENV === "production"));
      }
      return null;
    }
    return NextResponse.json(accountDeviceRefusalBody(), {
      status: 403,
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
      // "*": verified_at exists only after 20261127_60; a pending (never
      // verified) device is not one of the account's devices yet (owner ٤٠).
      service
        .from("user_devices")
        .select("*")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("last_seen", { ascending: false })
        .limit(50),
      // "*": account_device_limit_enabled exists only after 20261209_40.
      service.from("library_monitor_settings").select("*").eq("id", true).maybeSingle(),
    ]);
    const err = rowsRes.error ?? settingsRes.error;
    if (err) {
      const missing = isMissingDeviceSchema(err.code);
      if (!missing) console.error("[library-device] read failed:", err.code ?? "no-code");
      return { ok: false, missing };
    }
    // Owner ٢٣٣ (20261209_40): `enabled` is the ACCOUNT switch now (one
    // mobile + one computer, limit 2); the old library switch is retired.
    const s = (settingsRes.data ?? {}) as { account_device_limit_enabled?: unknown };
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
          kind: r.kind === "mobile" || r.kind === "desktop" ? r.kind : null,
        })),
      settings: { enabled: s.account_device_limit_enabled === true, limit: 2 },
    };
  } catch (err) {
    console.error("[library-device] read threw:", err instanceof Error ? err.name : "error");
    return { ok: false, missing: false };
  }
}
