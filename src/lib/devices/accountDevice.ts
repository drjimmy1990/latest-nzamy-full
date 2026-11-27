/**
 * accountDevice.ts — the pure half of owner answer ٢٣٣ (LIVE-17, 27 Nov 2026):
 * the device limit covers the WHOLE account, one mobile + one computer,
 * registered silently; an extra device is refused («تواصل مع الإدارة»), the
 * old device is never signed out; admins and staff are exempt.
 *
 * The decision is in Postgres (public.account_device_gate,
 * supabase/migrations/20261209_40_l19_account_device_limit.sql); the I/O is
 * accountDeviceGate.ts (the proxy's page hook and the library routes).
 *
 * NO node: IMPORTS — the proxy bundle loads this file (WebCrypto only), and so
 * may a client component (the refusal text).
 *
 * WHAT A DEVICE IS. The same httpOnly cookie the library limit already set
 * (`nz_lib_device`, 32 random bytes in base64url, 400 days); only its SHA-256
 * hex is stored. Keeping the name keeps every browser the library already
 * registered. A random 256-bit value whose hash is all the server keeps cannot
 * be guessed or forged, so it needs no signature. Its class (mobile / desktop)
 * is read once, when it registers, and stored: the stored class wins later.
 */

export const ACCOUNT_DEVICE_COOKIE = "nz_lib_device";

/** 400 days — the longest a browser keeps a cookie (Chrome's cap). */
export const ACCOUNT_DEVICE_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

export function accountDeviceCookieOptions(isProduction: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: ACCOUNT_DEVICE_COOKIE_MAX_AGE_S };
}

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{43}$/;

/** True for a cookie value this code minted (32 bytes in base64url, 43 characters). */
export function isAccountDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_RE.test(value);
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 32 random bytes → 43 base64url characters, no padding (same as Buffer's "base64url"). */
export function accountDeviceIdFrom(random: Uint8Array): string {
  if (random.length !== 32) throw new Error("accountDeviceIdFrom: 32 random bytes expected");
  let out = "";
  let i = 0;
  for (; i + 3 <= random.length; i += 3) {
    const n = (random[i] << 16) | (random[i + 1] << 8) | random[i + 2];
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63];
  }
  // 32 = 30 + 2: two bytes left → three characters.
  const n = (random[i] << 16) | (random[i + 1] << 8);
  out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63];
  return out;
}

/** A new device id from the platform's CSPRNG. */
export function newAccountDeviceId(): string {
  return accountDeviceIdFrom(crypto.getRandomValues(new Uint8Array(32)));
}

/** The stored form: hex SHA-256 of the cookie value (WebCrypto; equals node's createHash). */
export async function accountDeviceHash(id: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── the class of a device ───────────────────────────────────────────────────

export type DeviceKind = "mobile" | "desktop";

const MOBILE_UA = /iPhone|iPod|iPad|Android|Mobi|Tablet|Kindle|Silk\/|Opera Mini|IEMobile|BlackBerry/i;

/**
 * mobile: `Sec-CH-UA-Mobile: ?1` (Chromium sends it by default), or a
 * user-agent naming a phone or tablet (a tablet is the owner's handheld
 * class). desktop: everything else. Two honest edges: iPadOS Safari sends a
 * Mac user-agent (→ desktop), and a phone set to «desktop site» before it
 * first registers registers as a computer.
 */
export function deviceKindFrom(userAgent: string | null | undefined, chUaMobile: string | null | undefined): DeviceKind {
  if (typeof chUaMobile === "string" && chUaMobile.trim() === "?1") return "mobile";
  const ua = typeof userAgent === "string" ? userAgent.slice(0, 512) : "";
  return MOBILE_UA.test(ua) ? "mobile" : "desktop";
}

/**
 * «كمبيوتر — Chrome / Windows», «جوال — Safari / iPhone»: what the admin and
 * the user see in the list of devices. Rough on purpose — it names the device
 * for a person, it identifies nothing. (Moved here from deviceLimit.ts so the
 * proxy can use it; deviceLimit.ts re-exports it.)
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

/**
 * The label with the class the server decided. A Chromium phone that sent
 * `?1` with a desktop-looking user-agent is still named «جوال».
 */
export function accountDeviceLabel(userAgent: string | null | undefined, kind: DeviceKind): string {
  const label = deviceLabelFromUserAgent(userAgent);
  if (kind === "mobile" && label.startsWith("كمبيوتر")) return label.replace(/^كمبيوتر/, "جوال");
  return label;
}

// ── the refusal ─────────────────────────────────────────────────────────────

export const ACCOUNT_DEVICE_LIMIT_CODE = "account_device_limit";

/** Owner ٢٣٣, his exact sentence. */
export const ACCOUNT_DEVICE_LIMIT_AR =
  "تم الوصول إلى الحد الأقصى للأجهزة المسموحة لهذا الحساب (جوال واحد وحاسوب واحد). " +
  "لفتح جهاز جديد أو تبديله يُرجى التواصل مع الدعم / إدارة نظامي";

/** The answer to «remove a device» while the account limit is on (owner ٢٣٣: switching goes through the administration). */
export const ACCOUNT_DEVICE_SWITCH_AR =
  "تبديل الأجهزة أو إزالتها يتم عن طريق إدارة نظامي. تواصل معنا وسنعيد ضبط أجهزتك.";

/** The public page a refused device is sent to (not PROTECTED in src/proxy.ts: no loop). */
export const ACCOUNT_DEVICE_LIMIT_PATH = "/device-limit";

export function accountDeviceRefusalBody(): { error: string; code: typeof ACCOUNT_DEVICE_LIMIT_CODE } {
  return { error: ACCOUNT_DEVICE_LIMIT_AR, code: ACCOUNT_DEVICE_LIMIT_CODE };
}

// ── the database's answer ───────────────────────────────────────────────────

export type AccountGateStatus = "disabled" | "exempt" | "ok" | "pending" | "registered" | "refused";

const STATUSES: ReadonlySet<string> = new Set(["disabled", "exempt", "ok", "pending", "registered", "refused"]);

export interface AccountGateRow {
  status: AccountGateStatus;
  deviceId: string | null;
  kind: DeviceKind | null;
}

/** PostgREST's answer (an array of one row, or the row) → the row, or null when it is not one this code understands. */
export function parseAccountGateRow(json: unknown): AccountGateRow | null {
  const row = Array.isArray(json) ? json[0] : json;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.status !== "string" || !STATUSES.has(r.status)) return null;
  return {
    status: r.status as AccountGateStatus,
    deviceId: typeof r.device_id === "string" && r.device_id !== "" ? r.device_id : null,
    kind: r.device_kind === "mobile" || r.device_kind === "desktop" ? r.device_kind : null,
  };
}

export type AccountGateDecision =
  | { action: "allow"; remember: "switch_off" | "user" | "device" | null }
  | { action: "refuse" };

/**
 * ONLY an explicit `refused` refuses. No row (a timeout, a missing function,
 * an unparsable answer) allows — the caller raises the admin alert. `remember`
 * says what may be memoised; a refusal never is (an admin reset applies on the
 * next request).
 */
export function accountGateDecision(row: AccountGateRow | null): AccountGateDecision {
  if (!row) return { action: "allow", remember: null };
  switch (row.status) {
    case "refused":
      return { action: "refuse" };
    case "disabled":
      return { action: "allow", remember: "switch_off" };
    case "exempt":
      return { action: "allow", remember: "user" };
    default:
      return { action: "allow", remember: "device" };
  }
}

/** library_monitor_settings row → the account switch (null = unknown). */
export function accountSwitchFrom(json: unknown): boolean | null {
  const row = Array.isArray(json) ? json[0] : json;
  if (!row || typeof row !== "object") return null;
  const v = (row as Record<string, unknown>).account_device_limit_enabled;
  return typeof v === "boolean" ? v : null;
}

/** PostgREST / Postgres codes for "20261209_40 is not applied yet". */
const MISSING_CODES: ReadonlySet<string> = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export function isMissingAccountDeviceSchema(code: unknown): boolean {
  return typeof code === "string" && MISSING_CODES.has(code);
}

/** The admin's patch of the account switch: { enabled: boolean } only (the limit is fixed at 1 + 1). */
export function parseAccountSwitchPatch(body: unknown): { ok: true; enabled: boolean } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "بيانات غير صالحة" };
  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== "boolean") return { ok: false, error: "قيمة التفعيل غير صالحة" };
  return { ok: true, enabled: b.enabled };
}
