/**
 * deviceLimit.ts — the pure half of owner answer ٤٢٧ (2026-11-03 package,
 * «المكتبة القانونية والأجهزة»): «يُرفض الجهاز الثالث الجديد فوراً ويُقفل،
 * ويُطلب من المستخدم تسجيل الخروج من أحد أجهزته المصرحة.»
 *
 * The decision itself is in Postgres (public.library_device_check,
 * supabase/migrations/20261108_20_library_device_limit.sql) and is called from
 * the library routes that send a subscriber the full text, through
 * deviceLimitServer.ts. This file does no I/O beyond node:crypto, so
 * `node --test` loads it directly.
 *
 * WHAT A DEVICE IS. A random id (32 bytes, base64url) in an httpOnly cookie,
 * set by the server on the first entitled read. Only its SHA-256 is stored.
 * Clearing the browser's cookies makes the browser a new device — the honest
 * limit of a cookie, said in the report.
 */
import { createHash } from "node:crypto";

export const LIBRARY_DEVICE_COOKIE = "nz_lib_device";

/** 400 days — the longest a browser keeps a cookie (Chrome's cap). */
export const LIBRARY_DEVICE_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

/** The cookie's options. `secure` off only outside production (a phone on the LAN over http). */
export function libraryDeviceCookieOptions(isProduction: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: LIBRARY_DEVICE_COOKIE_MAX_AGE_S,
  };
}

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{43}$/;

/** True for a cookie value this code minted (32 bytes in base64url, 43 characters). */
export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_RE.test(value);
}

/** A new device id from 32 random bytes. */
export function newDeviceId(random: Uint8Array): string {
  if (random.length !== 32) throw new Error("newDeviceId: 32 random bytes expected");
  return Buffer.from(random).toString("base64url");
}

/** What is stored: the hex SHA-256 of the cookie value. */
export function hashDeviceId(id: string): string {
  return createHash("sha256").update(id, "utf8").digest("hex");
}

// ── the label ───────────────────────────────────────────────────────────────

/**
 * «كمبيوتر — Chrome / Windows», «جوال — Safari / iPhone»: what the user sees in
 * the list of his devices. Rough on purpose — it names the device for a
 * person, it identifies nothing.
 */
export function deviceLabelFromUserAgent(ua: string | null | undefined): string {
  const s = typeof ua === "string" ? ua.slice(0, 512) : "";
  if (!s.trim()) return "جهاز غير معروف";

  let os = "";
  let kind: "phone" | "tablet" | "computer" = "computer";
  if (/iPhone|iPod/.test(s)) { os = "iPhone"; kind = "phone"; }
  else if (/iPad/.test(s)) { os = "iPad"; kind = "tablet"; }
  else if (/Android/.test(s)) { os = "Android"; kind = /Mobile/.test(s) ? "phone" : "tablet"; }
  else if (/Windows/.test(s)) os = "Windows";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";
  else if (/Mobi/.test(s)) kind = "phone";

  let browser = "";
  if (/Edg(e|A|iOS)?\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser\//.test(s)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS\//.test(s)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";

  const kindAr = kind === "phone" ? "جوال" : kind === "tablet" ? "جهاز لوحي" : "كمبيوتر";
  const detail = [browser, os].filter(Boolean).join(" / ");
  return detail ? `${kindAr} — ${detail}` : kindAr;
}

// ── the database's answer ───────────────────────────────────────────────────

export type DeviceStatus = "disabled" | "exempt" | "ok" | "registered" | "refused";

export interface AuthorisedDevice {
  id: string;
  label: string;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface DeviceCheckRow {
  status: DeviceStatus;
  limit: number;
  deviceId: string | null;
  devices: AuthorisedDevice[];
}

const STATUSES: ReadonlySet<string> = new Set(["disabled", "exempt", "ok", "registered", "refused"]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function parseDevices(value: unknown): AuthorisedDevice[] {
  if (!Array.isArray(value)) return [];
  const out: AuthorisedDevice[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = str(r.id);
    if (!id) continue;
    out.push({
      id,
      label: str(r.label) ?? "جهاز",
      firstSeen: str(r.first_seen) ?? str(r.firstSeen),
      lastSeen: str(r.last_seen) ?? str(r.lastSeen),
    });
  }
  return out;
}

/**
 * PostgREST's answer (an array of one row, or the row) → DeviceCheckRow, or
 * null when it is not a row this code understands. null = no decision: the
 * caller lets the request through (fail open).
 */
export function parseDeviceCheckRow(json: unknown): DeviceCheckRow | null {
  const row = Array.isArray(json) ? json[0] : json;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.status !== "string" || !STATUSES.has(r.status)) return null;
  const limit = typeof r.device_limit === "number" && Number.isFinite(r.device_limit) ? Math.trunc(r.device_limit) : 2;
  return {
    status: r.status as DeviceStatus,
    limit,
    deviceId: str(r.device_id),
    devices: parseDevices(r.devices),
  };
}

/** «جهاز واحد», «جهازين», «3 أجهزة», «11 جهازاً». */
export function devicesCountAr(n: number): string {
  if (n === 1) return "جهاز واحد";
  if (n === 2) return "جهازين";
  if (n >= 3 && n <= 10) return `${n} أجهزة`;
  return `${n} جهازاً`;
}

/** The owner's refusal, with the account's real number of devices. */
export function deviceLimitMessageAr(limit: number): string {
  return (
    `هذا الحساب مفعّل على ${devicesCountAr(limit)} بالفعل. ` +
    "سجّل الخروج من أحد أجهزتك المصرّحة لتفتح المكتبة من هذا الجهاز."
  );
}

export const DEVICE_LIMIT_CODE = "device_limit";

export interface DeviceLimitRefusalBody {
  error: string;
  code: typeof DEVICE_LIMIT_CODE;
  limit: number;
  devices: AuthorisedDevice[];
}

export type DeviceGateDecision =
  | { action: "allow"; remember: "device" | "user" | "global" | null }
  | { action: "refuse"; status: 403; body: DeviceLimitRefusalBody };

/**
 * The route's decision. No row (missing function, timeout, any error) → allow:
 * a missing table never locks anyone out. `remember` says what the caller may
 * memoise: this device for this user ('ok' / 'registered'), the user
 * ('exempt'), everyone ('disabled'). A refusal is never remembered.
 */
export function deviceGateDecision(row: DeviceCheckRow | null): DeviceGateDecision {
  if (!row) return { action: "allow", remember: null };
  switch (row.status) {
    case "refused":
      return {
        action: "refuse",
        status: 403,
        body: {
          error: deviceLimitMessageAr(row.limit),
          code: DEVICE_LIMIT_CODE,
          limit: row.limit,
          devices: row.devices,
        },
      };
    case "disabled":
      return { action: "allow", remember: "global" };
    case "exempt":
      return { action: "allow", remember: "user" };
    default:
      return { action: "allow", remember: "device" };
  }
}

/** PostgREST / Postgres codes for "the migration is not applied yet". */
const MISSING_CODES: ReadonlySet<string> = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export function isMissingDeviceSchema(code: unknown): boolean {
  return typeof code === "string" && MISSING_CODES.has(code);
}

/**
 * True when the caller authenticates with `Authorization: Bearer` and carries
 * no device cookie: the native-app path, which has no cookie jar, so every
 * request would mint a new device. Such a caller is not device-checked
 * (fail open) — an owner question.
 */
export function isBearerWithoutDeviceCookie(authorization: string | null | undefined, deviceCookie: string | null | undefined): boolean {
  const bearer = typeof authorization === "string" && /^\s*bearer\s+\S/i.test(authorization);
  return bearer && !isValidDeviceId(deviceCookie);
}

/** A device row as the settings page and the admin page show it (never the hash). */
export interface DeviceListItem {
  id: string;
  label: string;
  firstSeen: string | null;
  lastSeen: string | null;
  current: boolean;
}

/** user_devices rows (service read, hash included) → the list, the hash dropped. Newest first. */
export function toDeviceList(rows: unknown, currentHash: string | null): DeviceListItem[] {
  if (!Array.isArray(rows)) return [];
  const out: DeviceListItem[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = str(r.id);
    if (!id) continue;
    out.push({
      id,
      label: str(r.label) ?? "جهاز",
      firstSeen: str(r.first_seen),
      lastSeen: str(r.last_seen),
      current: currentHash !== null && r.device_hash === currentHash,
    });
  }
  return out.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** The admin's device-limit settings patch: { enabled?, limit? }. */
export function parseDeviceSettingsPatch(
  body: unknown,
): { ok: true; columns: { device_limit_enabled?: boolean; device_limit?: number } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "بيانات غير صالحة" };
  const b = body as Record<string, unknown>;
  const columns: { device_limit_enabled?: boolean; device_limit?: number } = {};
  if ("enabled" in b) {
    if (typeof b.enabled !== "boolean") return { ok: false, error: "قيمة التفعيل غير صالحة" };
    columns.device_limit_enabled = b.enabled;
  }
  if ("limit" in b) {
    if (typeof b.limit !== "number" || !Number.isInteger(b.limit) || b.limit < 1 || b.limit > 10) {
      return { ok: false, error: "عدد الأجهزة يجب أن يكون بين 1 و 10" };
    }
    columns.device_limit = b.limit;
  }
  if (Object.keys(columns).length === 0) return { ok: false, error: "لا يوجد ما يُحفظ" };
  return { ok: true, columns };
}
