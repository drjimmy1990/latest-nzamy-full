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
import { createHash, createHmac } from "node:crypto";

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

// Batch l19 (owner ٢٣٣): moved to src/lib/devices/accountDevice.ts (no node:
// imports, so the proxy can name a device too); re-exported here unchanged.
export { deviceLabelFromUserAgent } from "../devices/accountDevice.ts";

// ── the database's answer ───────────────────────────────────────────────────

/**
 * Owner ٤٠ (18 Nov 2026, 20261127_60) adds two answers of library_device_gate:
 *   needs_code — a never-verified device with room left: an e-mail code first;
 *   suspend    — a never-verified device while the verified ones fill the
 *                limit (the third device).
 * Owner ٦٣ (18 Nov evening, batch l8): NO suspension. The database still
 * answers "suspend" there (the SQL has no side effect on it), and this file
 * reads it as the plain list refusal (device_limit): remove an old device,
 * then this one asks for its e-mail code.
 */
export type DeviceStatus = "disabled" | "exempt" | "ok" | "registered" | "refused" | "needs_code" | "suspend";

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
  /**
   * library_device_gate only: the other sessions of the account it ended
   * (owner ٤٠). Always 0 since 20261129_40: the device rule is the library's
   * only (register 14 item 9) and never signs the account out elsewhere.
   */
  sessionsEnded?: number;
}

const STATUSES: ReadonlySet<string> = new Set(["disabled", "exempt", "ok", "registered", "refused", "needs_code", "suspend"]);

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
  const out: DeviceCheckRow = {
    status: r.status as DeviceStatus,
    limit,
    deviceId: str(r.device_id),
    devices: parseDevices(r.devices),
  };
  if (typeof r.sessions_ended === "number" && Number.isFinite(r.sessions_ended)) out.sessionsEnded = r.sessions_ended;
  return out;
}

/** «جهاز واحد», «جهازين», «3 أجهزة», «11 جهازاً». */
export function devicesCountAr(n: number): string {
  if (n === 1) return "جهاز واحد";
  if (n === 2) return "جهازين";
  if (n >= 3 && n <= 10) return `${n} أجهزة`;
  return `${n} جهازاً`;
}

/**
 * The owner's refusal, with the account's real number of devices. Owner ٦٣:
 * never a suspension — remove an old device (on the refusal card's list, or
 * at «مكتبتي», /laws/my). The text names only «مكتبتي»: the scoped search and
 * the AI source preview show this string without the list. This device then
 * registers on its next read (with the e-mail code when the
 * server sends codes — the code card says so itself).
 */
export function deviceLimitMessageAr(limit: number): string {
  return (
    `هذا الحساب مفعّل على ${devicesCountAr(limit)} بالفعل. ` +
    "سجّل الخروج من أحد أجهزتك المصرّحة لتفتح المكتبة من هذا الجهاز؛ " +
    "تجد أجهزتك في صفحة «مكتبتي»."
  );
}

export const DEVICE_LIMIT_CODE = "device_limit";

/**
 * Controller ruling 2026-11-08 on question E: while the limit is ON, an
 * entitled full-text read that cannot carry a device id (a Bearer caller with
 * no `nz_lib_device` cookie — no cookie jar to mint one into) is refused with
 * this code. THE RULE A FUTURE PHONE APP MUST HANDLE: it sends its own device
 * id — 43 base64url characters from 32 random bytes, generated once and kept
 * in the app — as the cookie `nz_lib_device` (a `Cookie:` header) on every
 * library read; the server then counts it as one device like a browser.
 */
export const DEVICE_COOKIE_REQUIRED_CODE = "device_cookie_required";

export const DEVICE_COOKIE_REQUIRED_AR =
  "لا يمكن فتح نص المكتبة الكامل من هذا الاتصال لأنه لا يحمل معرّف الجهاز. " +
  "افتح المكتبة من المتصفح، أو حدّث التطبيق إلى إصدار يرسل معرّف الجهاز.";

// ── owner ٤٠ / ٦٣ (18 Nov 2026): e-mail code per new device, no suspension ──

/** A new device waits for the e-mail code before it reads the library's full text. */
export const DEVICE_CODE_REQUIRED_CODE = "device_code_required";
export const DEVICE_CODE_REQUIRED_AR =
  "هذا جهاز جديد على حسابك. أرسلنا — أو نرسل عند طلبك — رمز تحقق إلى بريدك الإلكتروني المسجّل؛ أدخله لتفتح المكتبة من هذا الجهاز. " +
  "حد الأجهزة خاص بالمكتبة وحدها، ولا يُسجَّل خروجك من أي جهاز آخر.";

/**
 * l19 review B3: the e-mail code of a new device is retired (owner ٢٣٣ — one
 * mobile and one computer, registered silently). /api/v1/library/devices/code
 * and /verify answer 410 with this line and call nothing.
 */
export const RETIRED_DEVICE_CODE = "device_code_retired";
export const RETIRED_DEVICE_CODE_AR =
  "لم يعد تأكيد الجهاز برمز البريد مستخدمًا. يُسجَّل جوالك وحاسوبك تلقائيًا عند أول استعمال، وإن ظهر لك أن هذا الجهاز غير مسجّل لحسابك فتواصل مع الإدارة.";

export interface DeviceLimitRefusalBody {
  error: string;
  code:
    | typeof DEVICE_LIMIT_CODE
    | typeof DEVICE_COOKIE_REQUIRED_CODE
    | typeof DEVICE_CODE_REQUIRED_CODE;
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
    // Owner ٦٣: the third never-verified device ("suspend" from 20261127_60)
    // is refused like a full list — never a suspension.
    case "suspend":
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
    case "needs_code":
      return {
        action: "refuse",
        status: 403,
        body: { error: DEVICE_CODE_REQUIRED_AR, code: DEVICE_CODE_REQUIRED_CODE, limit: row.limit, devices: [] },
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
 * no valid device cookie: it has no cookie jar, so a minted id would be lost
 * and every request would be a new device. Such a read goes through
 * cookielessGateDecision (refused while the limit is on), never through the
 * minting path.
 */
export function isBearerWithoutDeviceCookie(authorization: string | null | undefined, deviceCookie: string | null | undefined): boolean {
  const bearer = typeof authorization === "string" && /^\s*bearer\s+\S/i.test(authorization);
  return bearer && !isValidDeviceId(deviceCookie);
}

/**
 * What the server read for a caller without a device id: the switch
 * (null = unknown: the migration is missing or the read failed). There is no
 * staff flag any more: since l11 (O2, 20261201_10) an admin is counted like
 * everyone (file 19 «بلا أي bypass»).
 */
export interface CookielessState {
  enabled: boolean | null;
  limit: number;
}

/**
 * The decision for an entitled read with no device id (ruling on question E):
 *   switch unknown (missing migration, failed read) → allow (fail open);
 *   switch off → allow, nothing changes;
 *   otherwise → 403 device_cookie_required, an admin included (O2: no staff
 *   exemption since 20261201_10).
 */
export function cookielessGateDecision(state: CookielessState): DeviceGateDecision {
  if (state.enabled === null) return { action: "allow", remember: null };
  if (state.enabled === false) return { action: "allow", remember: "global" };
  return {
    action: "refuse",
    status: 403,
    body: { error: DEVICE_COOKIE_REQUIRED_AR, code: DEVICE_COOKIE_REQUIRED_CODE, limit: state.limit, devices: [] },
  };
}

/** A device row as the settings page and the admin page show it (never the hash). */
export interface DeviceListItem {
  id: string;
  label: string;
  firstSeen: string | null;
  lastSeen: string | null;
  current: boolean;
  /** Owner ٢٣٣ (20261209_40): the slot the device holds; null before it is classified. */
  kind: "mobile" | "desktop" | null;
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
      kind: r.kind === "mobile" || r.kind === "desktop" ? r.kind : null,
    });
  }
  return out.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * The allowed numbers of devices (batch l14, owner package of 23 Nov, ٢٠٧ /
 * 00 §٢-٣: «جهاز واحد أو جهازان»; the database's
 * library_monitor_settings_device_limit_check says the same since 20261204_60).
 */
export const DEVICE_LIMIT_CHOICES: readonly number[] = Object.freeze([1, 2]);
export const DEVICE_LIMIT_CHOICE_AR = "عدد الأجهزة جهاز واحد أو جهازان";

/** The admin's device-limit settings patch: { enabled?, limit? } — limit 1 or 2 (l14). */
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
    if (typeof b.limit !== "number" || !DEVICE_LIMIT_CHOICES.includes(b.limit)) {
      return { ok: false, error: DEVICE_LIMIT_CHOICE_AR };
    }
    columns.device_limit = b.limit;
  }
  if (Object.keys(columns).length === 0) return { ok: false, error: "لا يوجد ما يُحفظ" };
  return { ok: true, columns };
}

// ── the e-mail code of a new device (owner ٤٠) ──────────────────────────────

export const DEVICE_CODE_TTL_MINUTES = 10;
export const DEVICE_CODE_PEPPER_MIN = 32;

/**
 * The key the code is hashed with: DEVICE_CODE_PEPPER, else the lawyer-signup
 * LAWYER_OTP_PEPPER (the hash input below is prefixed «device:v1», so a code
 * of one flow can never pass the other). null = no usable key: the server
 * cannot issue codes, and a new device registers as before (never a lock-out).
 */
export function deviceCodePepper(env: Record<string, string | undefined>): string | null {
  for (const raw of [env.DEVICE_CODE_PEPPER, env.LAWYER_OTP_PEPPER]) {
    const s = (raw ?? "").trim();
    if (s.length >= DEVICE_CODE_PEPPER_MIN) return s;
  }
  return null;
}

/** HMAC-SHA256 of the code, bound to the user and the device. Only this is stored. */
export function hashDeviceCode(pepper: string, userId: string, deviceHash: string, code: string): string {
  return createHmac("sha256", pepper).update(`device:v1:${userId}:${deviceHash}:${code}`).digest("hex");
}

export function deviceCodeEmail(code: string, label: string): { subject: string; heading: string; paragraphs: string[] } {
  return {
    subject: "رمز تفعيل جهاز جديد للمكتبة القانونية — نظامي",
    heading: "رمز تفعيل جهاز جديد",
    paragraphs: [
      `طُلب فتح المكتبة القانونية في حسابك من جهاز جديد (${label}).`,
      `رمز التحقق: ${code}`,
      `الرمز صالح ${DEVICE_CODE_TTL_MINUTES} دقائق. لا تشاركه مع أحد.`,
      "حد الأجهزة خاص بالمكتبة وحدها، ولا يُسجَّل خروجك من أي جهاز آخر.",
      "إن لم تكن أنت من طلبه فلا تُدخله، وغيّر كلمة المرور فوراً.",
    ],
  };
}

export type DeviceCodeVerifyState = "verified" | "wrong" | "expired" | "too_many" | "no_code" | "not_pending" | "full";

/** library_device_code_verify's state → the Arabic answer (null = success). */
export function deviceCodeVerifyMessageAr(state: DeviceCodeVerifyState, attemptsLeft: number | null): string | null {
  switch (state) {
    case "verified":
      return null;
    case "wrong":
      return attemptsLeft !== null && attemptsLeft > 0
        ? `الرمز غير صحيح. بقي لك ${attemptsLeft === 1 ? "محاولة واحدة" : attemptsLeft === 2 ? "محاولتان" : `${attemptsLeft} محاولات`}.`
        : "الرمز غير صحيح.";
    case "expired":
      return "انتهت صلاحية الرمز. اطلب رمزاً جديداً.";
    case "too_many":
      return "تجاوزت عدد المحاولات. اطلب رمزاً جديداً.";
    case "no_code":
      return "لم يُرسل رمز لهذا الجهاز بعد. اطلب الرمز أولاً.";
    case "full":
      return "اكتمل عدد الأجهزة المصرّحة لحسابك قبل تأكيد هذا الجهاز. سجّل الخروج من أحد أجهزتك ثم أعد المحاولة.";
    default:
      return "هذا الجهاز لا ينتظر رمز تحقق. أعد تحميل الصفحة.";
  }
}
