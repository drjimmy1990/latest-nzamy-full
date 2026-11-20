/**
 * licenceFormat.ts — R9a / Q496 (batch l11-sec; owner question ١١٠ still
 * open): a SOFT format check of an advocate's licence number.
 *
 * Where the shape comes from (no production query): the lawyers' registry
 * (20261122_40) keys every licence by public.lawyer_registry_norm_licence —
 * Arabic-Indic digits folded to 0-9, spaces dropped, - – — _ \ turned into /,
 * repeated / collapsed, / trimmed at both ends — and the registry import
 * (scripts/registry/registryCsv.mjs) and its tests only ever carry digits with
 * an optional slash («99001», «12/3456»). The signup lookup route already
 * accepts exactly «digits and those separators, at most 32 characters»
 * (src/lib/registry/lawyerRegistryLookup.ts). This file is that rule, once.
 *
 * Soft: it refuses only what is clearly not a licence number — letters, other
 * symbols, no digit at all, or an over-long value. An empty value is not this
 * file's business (the form asks for it; a profile may clear it). Advocates
 * only: a consultant's licence is not in this registry.
 *
 * Pure: `node --test` loads it.
 */

export const LICENCE_MAX_CHARS = 32;

export const LICENCE_FORMAT_ERROR_AR = "رقم الترخيص أرقام فقط، وقد يتضمّن الشرطة المائلة (/)";

const ALLOWED = /^[0-9٠-٩۰-۹\s/\\\-–—_]+$/;
const HAS_DIGIT = /[0-9٠-٩۰-۹]/;

/** lawyer_registry_norm_licence in TypeScript (the key the registry and R6 compare). */
export function normaliseLicence(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/\s+/g, "");
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.replace(/[-–—_\\]/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  return s === "" ? null : s;
}

/**
 * The Arabic refusal for a clearly malformed licence number, or null when it
 * is acceptable (or empty — whether it is required is decided elsewhere).
 */
export function licenceFormatIssue(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v === "") return null;
  if (v.length > LICENCE_MAX_CHARS || !ALLOWED.test(v) || !HAS_DIGIT.test(v)) return LICENCE_FORMAT_ERROR_AR;
  const key = normaliseLicence(v);
  return key !== null && /^\d+(\/\d+)*$/.test(key) ? null : LICENCE_FORMAT_ERROR_AR;
}
