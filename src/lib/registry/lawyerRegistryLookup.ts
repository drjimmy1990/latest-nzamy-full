/**
 * Lawyer registry lookup at signup (launch batch R2/R3/R5) — the pure half of
 * POST /api/v1/auth/lawyer-registry-lookup. No I/O, no process.env, relative
 * imports only, so `node --test` loads it as it is.
 *
 * The database does the matching (public.lawyer_registry_lookup, migration
 * 20261122_40) and already returns no personal data for anything but a valid
 * licence. This module is the second fence: it validates what a guest sends
 * and passes on ONLY the whitelisted fields of a well-formed answer.
 *
 * A registry hit is a hint, never a verification: there is no OTP yet (R4),
 * so anyone could type someone else's licence. The account stays
 * verification_status = 'pending' until an admin approves it.
 */

export const LICENCE_MAX = 32;
export const NAME_MAX = 120;
export const TOKEN_MAX = 4096;

export type LookupInput = {
  licenseNumber: string | null;
  fullName: string | null;
  turnstileToken: string | null;
};

export type ParseResult = { ok: true; input: LookupInput } | { ok: false; error: string };

const ARABIC_LETTERS = /[ء-ي]/g;

/** Validates the JSON body. Licence wins when both are given (as in SQL). */
export function parseLookupBody(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "بيانات غير صالحة" };
  }
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : null);

  const licence = str(b.licenseNumber);
  const name = str(b.fullName);
  const token = str(b.turnstileToken);
  if (licence === null || name === null || token === null) {
    return { ok: false, error: "بيانات غير صالحة" };
  }
  if (licence.length > LICENCE_MAX || name.length > NAME_MAX || token.length > TOKEN_MAX) {
    return { ok: false, error: "بيانات غير صالحة" };
  }
  if (licence) {
    // Western or Arabic-Indic digits, and the separators the registry uses.
    if (!/^[0-9٠-٩۰-۹\s/\\\-–—_]+$/.test(licence) || !/[0-9٠-٩۰-۹]/.test(licence)) {
      return { ok: false, error: "رقم الترخيص أرقام فقط، وقد يتضمّن الشرطة المائلة (/)" };
    }
    return { ok: true, input: { licenseNumber: licence, fullName: null, turnstileToken: token || null } };
  }
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = name.match(ARABIC_LETTERS)?.length ?? 0;
    if (words.length < 3 || letters < 6) {
      return { ok: false, error: "اكتب اسمك الكامل كما في الترخيص (ثلاثة أسماء على الأقل)، أو رقم الترخيص" };
    }
    return { ok: true, input: { licenseNumber: null, fullName: name, turnstileToken: token || null } };
  }
  return { ok: false, error: "اكتب اسمك الكامل أو رقم ترخيصك" };
}

export type LookupResponse =
  | {
      status: "valid";
      name: string;
      licence: string;
      expiry: string;
      mobileHint: string | null;
      city: string | null;
    }
  | { status: "expired" | "unverifiable" | "not_found" | "ambiguous" };

const NO_DATA_STATUSES = new Set(["expired", "unverifiable", "not_found", "ambiguous"]);

/**
 * The database answer → what the guest receives. Anything malformed becomes
 * not_found (never a crash, never an unexpected field).
 */
export function shapeLookupResult(raw: unknown): LookupResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { status: "not_found" };
  const r = raw as Record<string, unknown>;
  if (typeof r.status === "string" && NO_DATA_STATUSES.has(r.status)) {
    return { status: r.status as "expired" | "unverifiable" | "not_found" | "ambiguous" };
  }
  if (
    r.status === "valid" &&
    typeof r.name === "string" && r.name.trim() &&
    typeof r.licence === "string" && r.licence.trim() &&
    typeof r.expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.expiry)
  ) {
    const hint = typeof r.mobile_hint === "string" && /^\d{2}$/.test(r.mobile_hint) ? r.mobile_hint : null;
    const city = typeof r.city === "string" && r.city.trim() ? r.city.trim() : null;
    return { status: "valid", name: r.name.trim(), licence: r.licence.trim(), expiry: r.expiry, mobileHint: hint, city };
  }
  return { status: "not_found" };
}

/** Splits a registry name for the signup form's first / last name fields. */
export function splitRegistryName(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: words[0] ?? "", lastName: words.slice(1).join(" ") };
}

/** "2030-01-15" → "15/01/2030" (shown as written, no time zone shift). */
export function formatExpiry(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
