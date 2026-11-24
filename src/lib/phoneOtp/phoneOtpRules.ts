/**
 * The WhatsApp sign-up code (batch l15, user decisions 2026-11-24): the pure
 * rules shared by the proxy, the routes, the verify page and the admin card.
 * No imports, no I/O — the proxy bundle, the browser and `node --test` all
 * load it.
 *
 * Who is held: an account created at/after the moment the admin turned the
 * switch on (platform_settings signup_phone_otp.enabled_at), not staff, not a
 * test account, whose mobile is not confirmed (profiles.phone_verified_at).
 * The database decides that (public.phone_otp_gate, 20261205_10); this file
 * holds the setting's shape, the cheap pre-check on the account's creation
 * time, and which paths stay open to a held account.
 */

export const SIGNUP_PHONE_OTP_KEY = "signup_phone_otp";
export const VERIFY_PHONE_PATH = "/verify-phone";
export const PHONE_UNVERIFIED_CODE = "phone_unverified";
export const PHONE_UNVERIFIED_AR = "أكّد رقم جوالك أولًا برمز التحقق المرسل عبر واتساب.";
export const PHONE_SEND_FAILED_AR = "تعذّر إرسال الرمز الآن، حاول بعد قليل.";

export type SignupPhoneOtpSetting = { enabled: boolean; enabledAt: string | null };

/** The stored value, read defensively: anything malformed is "off". */
export function signupPhoneOtpFrom(value: unknown): SignupPhoneOtpSetting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, enabledAt: null };
  const v = value as { enabled?: unknown; enabled_at?: unknown };
  const enabledAt = typeof v.enabled_at === "string" && Number.isFinite(Date.parse(v.enabled_at)) ? v.enabled_at : null;
  return { enabled: v.enabled === true, enabledAt };
}

/** The admin route accepts {"enabled": boolean} only; enabled_at is the database's. */
export function signupPhoneOtpIssue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 'قيمة signup_phone_otp يجب أن تكون كائناً بالشكل {"enabled": true|false}';
  }
  const keys = Object.keys(value as object);
  if (typeof (value as { enabled?: unknown }).enabled !== "boolean") return "قيمة enabled يجب أن تكون true أو false";
  if (keys.some((k) => k !== "enabled" && k !== "enabled_at")) return "مفتاح غير معروف في signup_phone_otp";
  return null;
}

/**
 * The cheap first question, answered from the setting and the account's
 * creation time alone (no query): could this account be held at all?
 * false → never held (switch off, no cutoff, or an account older than the
 * cutoff). true → ask the database (staff, test account, confirmed?).
 */
export function mayBeHeld(setting: SignupPhoneOtpSetting, userCreatedAt: string | null | undefined): boolean {
  if (!setting.enabled || !setting.enabledAt) return false;
  const since = Date.parse(setting.enabledAt);
  const created = Date.parse(userCreatedAt ?? "");
  if (!Number.isFinite(since)) return false;
  // An account whose creation time cannot be read is treated as new: the
  // database answer decides, and the exempt lists live there.
  if (!Number.isFinite(created)) return true;
  return created >= since;
}

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

/**
 * /api/v1 paths a held account may still call: its own code routes and status,
 * every sign-in / session / two-step route, the terms acceptance written right
 * after sign-up, and the server-to-server endpoints (they never carry a user
 * session; listed so a stray cookie cannot hold them).
 */
const OPEN_API_PREFIXES = [
  "/api/v1/auth",
  "/api/v1/legal/terms-acceptance",
  "/api/v1/cron",
  "/api/v1/n8n",
  "/api/v1/payments/webhook",
] as const;

export function isPhoneGateOpenApiPath(pathname: string): boolean {
  return OPEN_API_PREFIXES.some((p) => under(pathname, p));
}

/**
 * The proxy holds /api/v1/* (minus the open list) and the PROTECTED pages.
 * Pages outside PROTECTED (the home page, the library, the legal pages, the
 * verify page itself, sign-in) are never held — they are open to a guest too.
 */
export function isPhoneGatedApiPath(pathname: string): boolean {
  return under(pathname, "/api/v1") && !isPhoneGateOpenApiPath(pathname);
}

/**
 * Where /verify-phone may send the user after success: any path of THIS site
 * (path + query, no fragment) — the page the proxy held, a login `?from=`, an
 * invitation link. Never another origin: a leading `//`, a backslash, a scheme,
 * whitespace or a control character is refused, and so is the verify page itself.
 */
export function safePhoneNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\s\u0000-\u001f\u007f]/.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s, "https://same-origin.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://same-origin.invalid") return null;
  if (under(url.pathname, VERIFY_PHONE_PATH)) return null;
  return `${url.pathname}${url.search}`;
}

/** «…٤٥٦٧» style hint for the screen: the last four digits only. */
export function maskSaudiMobile(e164: string | null | undefined): string | null {
  const digits = (e164 ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `•••• ${digits.slice(-4)}`;
}
