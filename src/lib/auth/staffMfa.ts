/**
 * staffMfa.ts — the pure rule behind mandatory two-step sign-in (TOTP) for
 * every admin/staff account (owner item 18, batch l7).
 *
 * WHO IS STAFF: profiles.user_type = 'admin'. Every platform_staff role
 * (super_admin / operations / auditor, 20261019_30) sits on top of that
 * column, so one test covers them all.
 *
 * THE RULE (one place, read by src/proxy.ts, requireAdmin/requireStaff and
 * assertRole in the server, and mirrored in SQL by public.is_admin(),
 * 20261127_50):
 *   1. A staff account WITH a verified TOTP factor must hold an aal2 session
 *      (password + code). Always on: anyone enrolled can pass a challenge, so
 *      this cannot lock anybody out.
 *   2. A staff account WITHOUT a verified factor:
 *        ADMIN_MFA_ENFORCE unset / anything else → admitted (rollout period),
 *                                                  and asked to enrol;
 *        ADMIN_MFA_ENFORCE=required              → nothing but the
 *                                                  enrolment page.
 *      Default OFF on purpose: if the self-hosted GoTrue has TOTP enrolment
 *      switched off, a default-ON switch would shut the only admin out of the
 *      console. The user turns it on after enrolling himself.
 *
 * Pure, no imports: the edge proxy and `node --test` both load it. Nothing
 * here verifies a token's signature — callers decode the aal claim only from
 * a token GoTrue has just accepted (getUser() succeeded on it).
 */

/** The env switch that forces enrolment for unenrolled staff. */
export const ADMIN_MFA_ENFORCE_ENV = "ADMIN_MFA_ENFORCE";

export type AdminMfaMode = "rollout" | "required";

/** The page that enrols, challenges and recovers. Not PROTECTED and not
 *  under /dashboard/admin, so the gates never block the page that clears them. */
export const STAFF_MFA_PATH = "/auth/mfa";

/** The API subtree the MFA page calls (outside /api/v1/admin on purpose). */
export const STAFF_MFA_API_PREFIX = "/api/v1/auth/mfa/";

/** True for the admin API subtree (/api/v1/admin and everything under it). */
export function isAdminApiPath(pathname: string): boolean {
  return pathname === "/api/v1/admin" || pathname.startsWith("/api/v1/admin/");
}

export const MFA_REQUIRED_CODE = "mfa_required";
export const MFA_ENROLLMENT_REQUIRED_CODE = "mfa_enrollment_required";

export const MFA_REQUIRED_AR =
  "لوحة الإدارة تتطلب التحقق بخطوتين: أدخل رمز تطبيق المصادقة لإكمال الدخول.";
export const MFA_ENROLLMENT_REQUIRED_AR =
  "لوحة الإدارة تتطلب تفعيل التحقق بخطوتين أولاً: فعّله من صفحة التحقق بخطوتين ثم أعد المحاولة.";

export function adminMfaMode(env: Record<string, string | undefined>): AdminMfaMode {
  const raw = (env[ADMIN_MFA_ENFORCE_ENV] ?? "").trim().toLowerCase();
  return raw === "required" || raw === "on" ? "required" : "rollout";
}

export type Aal = "aal1" | "aal2" | null;

function base64UrlDecode(segment: string): string | null {
  try {
    let s = segment.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4 !== 0) s += "=";
    const binary = atob(s);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** The JWT payload of an access token, or null when it is not one. No signature check. */
export function accessTokenClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const json = base64UrlDecode(parts[1]);
  if (json === null) return null;
  try {
    const payload = JSON.parse(json) as unknown;
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The `aal` claim of an access token GoTrue has already accepted. */
export function aalFromAccessToken(token: string | null | undefined): Aal {
  const aal = accessTokenClaims(token)?.aal;
  return aal === "aal1" || aal === "aal2" ? aal : null;
}

/** The `session_id` claim (one per sign-in), or null. */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  const sid = accessTokenClaims(token)?.session_id;
  return typeof sid === "string" && /^[0-9a-f-]{36}$/i.test(sid) ? sid.toLowerCase() : null;
}

/** True when the user GoTrue returned has at least one VERIFIED TOTP factor. */
export function hasVerifiedTotp(user: { factors?: unknown } | null | undefined): boolean {
  const factors = user?.factors;
  if (!Array.isArray(factors)) return false;
  return factors.some(
    (f) =>
      typeof f === "object" &&
      f !== null &&
      (f as { status?: unknown }).status === "verified" &&
      (f as { factor_type?: unknown }).factor_type === "totp",
  );
}

/** True when the user has ANY verified factor (what GoTrue's aal2 needs). */
export function hasVerifiedFactor(user: { factors?: unknown } | null | undefined): boolean {
  const factors = user?.factors;
  if (!Array.isArray(factors)) return false;
  return factors.some(
    (f) => typeof f === "object" && f !== null && (f as { status?: unknown }).status === "verified",
  );
}

export type StaffMfaDecision =
  | { ok: true; suggestEnroll: boolean }
  | { ok: false; need: "challenge" | "enroll"; code: string; error: string };

/**
 * The decision for a STAFF account. A non-staff account is never asked here
 * (callers check user_type first; the /api/v1/admin prefix check passes
 * isStaff=true because every non-admin is refused there anyway).
 */
export function staffMfaDecision(input: {
  hasVerifiedFactor: boolean;
  aal: Aal;
  mode: AdminMfaMode;
}): StaffMfaDecision {
  if (input.hasVerifiedFactor) {
    if (input.aal === "aal2") return { ok: true, suggestEnroll: false };
    return { ok: false, need: "challenge", code: MFA_REQUIRED_CODE, error: MFA_REQUIRED_AR };
  }
  if (input.mode === "required") {
    return { ok: false, need: "enroll", code: MFA_ENROLLMENT_REQUIRED_CODE, error: MFA_ENROLLMENT_REQUIRED_AR };
  }
  return { ok: true, suggestEnroll: true };
}

/** `/auth/mfa?next=<path>` — `next` only when it is a local path. */
export function staffMfaUrlFor(nextPath: string | null | undefined): string {
  if (typeof nextPath === "string" && nextPath.startsWith("/") && !nextPath.startsWith("//") && !nextPath.startsWith("/\\")) {
    return `${STAFF_MFA_PATH}?next=${encodeURIComponent(nextPath)}`;
  }
  return STAFF_MFA_PATH;
}

/**
 * A rough device label for the new-login e-mail («Chrome على Windows»). Never
 * the whole user-agent string: it is long and says more than the reader needs.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").slice(0, 512);
  if (ua.trim() === "") return "جهاز غير معروف";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /CriOS\/|Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && os) return `${browser} على ${os}`;
  return browser ?? os ?? "جهاز غير معروف";
}
