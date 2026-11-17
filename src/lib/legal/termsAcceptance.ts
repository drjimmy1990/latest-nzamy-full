/**
 * Pure rules behind POST/GET /api/v1/legal/terms-acceptance and the re-ask
 * modal (R7). No framework imports — `node --test` loads it directly.
 */
import { createHmac } from "node:crypto";
import { CURRENT_TERMS_VERSION } from "./termsVersion.ts";

export type TermsAcceptanceContext = "signup" | "relogin";

/** The column's own limit (CHECK char_length(user_agent) <= 256). */
export const USER_AGENT_MAX = 256;

/**
 * A non-reversible fingerprint of the client address: HMAC-SHA256 keyed with
 * the server salt (TERMS_IP_HASH_SALT). Never returns the address itself.
 * null when the address is unknown — a hash of "unknown" would make every
 * header-less request look like one machine.
 */
export function hashClientIp(ip: string | null | undefined, salt: string): string | null {
  const value = (ip ?? "").trim();
  if (value === "" || value === "unknown") return null;
  return createHmac("sha256", salt).update(value).digest("hex");
}

/** The User-Agent header, cut to what the column holds; null when absent. */
export function truncateUserAgent(ua: string | null | undefined): string | null {
  const value = (ua ?? "").trim();
  if (value === "") return null;
  return Array.from(value).slice(0, USER_AGENT_MAX).join("");
}

export type AcceptanceBodyResult =
  | { ok: true; context: TermsAcceptanceContext }
  | { ok: false; status: 400 | 409; error: string };

/**
 * The POST body: `{ version, context }`. A version other than the current one
 * is refused (409) — a tab left open across a terms change must not record
 * acceptance of a text the person never saw.
 */
export function parseAcceptanceBody(body: unknown): AcceptanceBodyResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "طلب غير صالح." };
  }
  const { version, context } = body as Record<string, unknown>;
  if (context !== "signup" && context !== "relogin") {
    return { ok: false, status: 400, error: "طلب غير صالح." };
  }
  if (version !== CURRENT_TERMS_VERSION) {
    return {
      ok: false,
      status: 409,
      error: "تغيّرت الشروط منذ فتح هذه الصفحة. حدّث الصفحة واقرأ النص الجديد ثم وافق عليه.",
    };
  }
  return { ok: true, context };
}

/**
 * An email signup with confirmation on has no session when the box is ticked,
 * so the form also writes `terms_version` into user_metadata. The server then
 * records that acceptance (context 'signup') on the first signed-in request.
 *
 * Honoured ONLY for an account with no acceptance row at all: user_metadata is
 * editable by its owner (supabase.auth.updateUser), so trusting it for an
 * account that already has rows would let anyone skip a later re-ask.
 */
export function shouldRecordSignupFromMetadata(
  userMetadata: unknown,
  existingRowCount: number,
): boolean {
  if (existingRowCount !== 0) return false;
  if (!userMetadata || typeof userMetadata !== "object") return false;
  return (userMetadata as Record<string, unknown>).terms_version === CURRENT_TERMS_VERSION;
}

/**
 * PostgREST/Postgres codes that mean "the table is not there yet" — the
 * migration has not run. The route then fails open (no modal).
 */
export function isMissingTermsTable(code: string | null | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}
