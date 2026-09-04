/**
 * profileEntityFields.ts — pure validation for the Phase 6 (task S1)
 * extension of PATCH /api/v1/profile: `profiles.nationality`,
 * `lawyer_profiles.license_issued_on` / `office_address`, the
 * `entitySettings` block that shallow-merges into
 * `<entityProfileTableFor(userType)>.metadata.settings`, and the
 * `businessProfile` block (corporate accounts only) that writes the four
 * real `business_profiles` columns added by
 * 20260826_corporate_identity_persisted.sql.
 * ─────────────────────────────────────────────────────────
 * Kept free of Next.js/Supabase imports so `node --test` can run it
 * directly — same reason preferencesMerge.ts (the PATCH
 * /api/v1/settings/preferences equivalent) stays framework-free. The route
 * (src/app/api/v1/profile/route.ts) does the auth, the DB read/update and
 * decides which validator applies to which account type; everything here is
 * arithmetic on plain values.
 *
 * `validateBusinessProfilePatch` takes `normalizeCr`/`isCapacity` as
 * parameters rather than importing them from
 * src/app/register/client/components/_corporateIdentity.ts directly: that
 * file is reachable through the "@/" alias, which `node --test` cannot
 * resolve outside the Next.js bundler (the same reason preferencesMerge.ts
 * keeps its own copy of preferencesService.ts's shapes instead of importing
 * it). The route wires the real functions in; this module only needs their
 * signatures.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── profiles.nationality / lawyer_profiles.office_address ──────────────────

const MAX_NATIONALITY_LENGTH = 60;
const MAX_OFFICE_ADDRESS_LENGTH = 200;

/** Arabic reason `profiles.nationality` is refused, or null (null itself is valid — it clears the column). */
export function nationalityIssue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return "الجنسية يجب أن تكون نصاً أو فارغة.";
  if (value.length > MAX_NATIONALITY_LENGTH) return `الجنسية يجب ألا تتجاوز ${MAX_NATIONALITY_LENGTH} حرفاً.`;
  return null;
}

/** Arabic reason `lawyer_profiles.office_address` is refused, or null. */
export function officeAddressIssue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return "عنوان المكتب يجب أن يكون نصاً أو فارغاً.";
  if (value.length > MAX_OFFICE_ADDRESS_LENGTH) return `عنوان المكتب يجب ألا يتجاوز ${MAX_OFFICE_ADDRESS_LENGTH} حرفاً.`;
  return null;
}

// ── lawyer_profiles.license_issued_on ───────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD — rejects e.g. "2026-02-30". */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Arabic reason `lawyer_profiles.license_issued_on` is refused, or null. */
export function licenseIssuedOnIssue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !isValidIsoDate(value)) {
    return "تاريخ إصدار الترخيص غير صالح — استخدم الصيغة YYYY-MM-DD.";
  }
  return null;
}

// ── entitySettings (<entity table>.metadata.settings) ──────────────────────

/** A key of `metadata.settings` — starts with a letter, ≤ 41 characters, ASCII word characters only. */
export const ENTITY_SETTINGS_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
const MAX_ENTITY_SETTINGS_VALUE_LENGTH = 500;

export type EntitySettingsValue = string | number | null;

export type EntitySettingsPatchValidation =
  | { ok: true; patch: Record<string, EntitySettingsValue> }
  | { ok: false; error: string };

/**
 * Validates an `entitySettings` PATCH body: every key must match
 * ENTITY_SETTINGS_KEY_RE, and every value must be a string (≤ 500 chars), a
 * finite number, or null. An empty object validates to an empty patch — the
 * route decides whether an empty patch is worth a DB round trip.
 */
export function validateEntitySettingsPatch(value: unknown): EntitySettingsPatchValidation {
  if (!isPlainObject(value)) return { ok: false, error: "بيانات إعدادات الكيان يجب أن تكون كائناً." };

  const patch: Record<string, EntitySettingsValue> = {};
  for (const key of Object.keys(value)) {
    if (!ENTITY_SETTINGS_KEY_RE.test(key)) {
      return { ok: false, error: `اسم حقل غير صالح في إعدادات الكيان: ${key}` };
    }
    const v = value[key];
    if (v === null) {
      patch[key] = null;
    } else if (typeof v === "number") {
      if (!Number.isFinite(v)) return { ok: false, error: `قيمة غير صالحة لحقل «${key}».` };
      patch[key] = v;
    } else if (typeof v === "string") {
      if (v.length > MAX_ENTITY_SETTINGS_VALUE_LENGTH) {
        return { ok: false, error: `قيمة حقل «${key}» تتجاوز الحد المسموح (${MAX_ENTITY_SETTINGS_VALUE_LENGTH} حرفاً).` };
      }
      patch[key] = v;
    } else {
      return { ok: false, error: `قيمة حقل «${key}» يجب أن تكون نصاً أو رقماً أو فارغة.` };
    }
  }
  return { ok: true, patch };
}

/** The `metadata.settings` object, or {} when absent or malformed. */
export function readEntitySettings(metadata: unknown): Record<string, unknown> {
  if (!isPlainObject(metadata)) return {};
  const settings = metadata.settings;
  return isPlainObject(settings) ? settings : {};
}

/**
 * Shallow-merges `patch` into `existingMetadata.settings`, leaving every
 * other `metadata` key — and every `settings` key not named in the patch —
 * untouched. Mirrors `mergePreferences` (preferencesMerge.ts).
 */
export function mergeEntitySettings(
  existingMetadata: unknown,
  patch: Record<string, EntitySettingsValue>,
): Record<string, unknown> {
  const meta = isPlainObject(existingMetadata) ? existingMetadata : {};
  const settings = readEntitySettings(meta);
  return { ...meta, settings: { ...settings, ...patch } };
}

// ── businessProfile (business_profiles, corporate accounts only) ───────────

const MAX_COMPANY_NAME_LENGTH = 200;
const MAX_LEGAL_REP_NAME_LENGTH = 200;

export interface BusinessProfilePatch {
  company_name_ar?: string;
  cr_number?: string | null;
  legal_rep_name?: string | null;
  legal_rep_capacity?: string | null;
}

export type BusinessProfileValidation =
  | { ok: true; patch: BusinessProfilePatch }
  | { ok: false; error: string };

/**
 * Validates a `businessProfile` PATCH body against the four real columns
 * `20260826_corporate_identity_persisted.sql` added. Any other key is
 * ignored — the same allowlist-by-omission convention `profileFields` /
 * `lawyerFields` already use in the route, rather than an error on an
 * unknown key.
 *
 * `company_name_ar` is NOT NULL in the database (no default once a row
 * exists), so — unlike the other three, which are nullable — an empty
 * string here is refused rather than silently clearing the column; the
 * route omits the key entirely when the caller's input trims to empty.
 */
export function validateBusinessProfilePatch(
  value: unknown,
  normalizeCr: (raw: string) => string,
  isCapacity: (v: unknown) => boolean,
): BusinessProfileValidation {
  if (!isPlainObject(value)) return { ok: false, error: "بيانات الشركة يجب أن تكون كائناً." };

  const patch: BusinessProfilePatch = {};

  if ("company_name_ar" in value) {
    const raw = value.company_name_ar;
    if (typeof raw !== "string") return { ok: false, error: "اسم الشركة مطلوب ولا يتجاوز 200 حرف." };
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_COMPANY_NAME_LENGTH) {
      return { ok: false, error: "اسم الشركة مطلوب ولا يتجاوز 200 حرف." };
    }
    patch.company_name_ar = trimmed;
  }

  if ("cr_number" in value) {
    const raw = value.cr_number;
    if (raw === null) {
      patch.cr_number = null;
    } else if (typeof raw !== "string") {
      return { ok: false, error: "رقم السجل التجاري غير صالح." };
    } else {
      const trimmed = raw.trim();
      if (!trimmed) {
        patch.cr_number = null;
      } else {
        const normalized = normalizeCr(trimmed);
        if (!normalized) return { ok: false, error: "رقم السجل التجاري غير صالح." };
        patch.cr_number = normalized;
      }
    }
  }

  if ("legal_rep_name" in value) {
    const raw = value.legal_rep_name;
    if (raw === null) {
      patch.legal_rep_name = null;
    } else if (typeof raw !== "string") {
      return { ok: false, error: "اسم الممثل النظامي غير صالح." };
    } else {
      const trimmed = raw.trim();
      if (trimmed.length > MAX_LEGAL_REP_NAME_LENGTH) {
        return { ok: false, error: `اسم الممثل النظامي يجب ألا يتجاوز ${MAX_LEGAL_REP_NAME_LENGTH} حرفاً.` };
      }
      patch.legal_rep_name = trimmed || null;
    }
  }

  if ("legal_rep_capacity" in value) {
    const raw = value.legal_rep_capacity;
    if (raw === null) {
      patch.legal_rep_capacity = null;
    } else if (!isCapacity(raw)) {
      return { ok: false, error: "صفة الممثل النظامي غير صالحة." };
    } else {
      patch.legal_rep_capacity = raw as string;
    }
  }

  return { ok: true, patch };
}
