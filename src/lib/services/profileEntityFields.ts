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
 *
 * `./saudiMobile.ts` IS imported directly (relative, with the extension, the
 * same way src/lib/auth/serviceRequestEntityScope.ts imports
 * `./routeAccess.ts`) because it is a sibling with no framework imports of
 * its own, so `node --test` resolves it without the bundler.
 */

import { normalizeSaudiMobile, saudiMobileMessage } from "./saudiMobile.ts";

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
 * The shape an e-mail must have to be stored in the bag. Deliberately the
 * same three-part expression the registration forms use — one `@`, a dot in
 * the domain, no whitespace — and deliberately NOT an RFC-5322 attempt: the
 * point is to refuse the free text that used to get through, not to be the
 * arbiter of address validity.
 */
export const ENTITY_SETTINGS_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an `entitySettings` PATCH body: every key must match
 * ENTITY_SETTINGS_KEY_RE, and every value must be a string (≤ 500 chars), a
 * finite number, or null. An empty object validates to an empty patch — the
 * route decides whether an empty patch is worth a DB round trip.
 *
 * Two keys carry a FORMAT on top of that, for every entity type (WP-6 B-1;
 * until now the bag accepted any string for both, which is how an e-mail
 * address could be stored as a firm's phone number):
 *   • `phone` — a Saudi mobile, normalised to E.164 (`+9665XXXXXXXX`) by
 *     `normalizeSaudiMobile`, so the value the bag holds matches what
 *     `profiles.phone` holds after 20260921_04. `null` still clears it; an
 *     all-whitespace string is treated as a clear rather than as a rejection,
 *     because the tab sends a trimmed "" only when the user emptied the field
 *     — and that arrives here as `null` already.
 *   • `email` — ENTITY_SETTINGS_EMAIL_RE.
 * The refusal message for `phone` is `saudiMobileMessage`'s, so the user is
 * told WHICH of the four things is wrong rather than «غير صحيح».
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
      if (key === "phone") {
        if (v.trim() === "") {
          patch[key] = null;
        } else {
          const mobile = normalizeSaudiMobile(v);
          if (!mobile.ok) return { ok: false, error: saudiMobileMessage(mobile) };
          patch[key] = mobile.e164;
        }
      } else if (key === "email") {
        const trimmed = v.trim();
        if (trimmed === "") {
          patch[key] = null;
        } else if (!ENTITY_SETTINGS_EMAIL_RE.test(trimmed)) {
          return { ok: false, error: "البريد الإلكتروني غير صالح." };
        } else {
          patch[key] = trimmed;
        }
      } else {
        patch[key] = v;
      }
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
  service_model?: string;
  has_legal_dept?: boolean;
}

/**
 * `business_profiles.service_model` CHECK values
 * (20260603_phase1_002_entities.sql:231-232). Duplicated here as a runtime
 * array for the same reason `firm/members/route.ts` keeps `FIRM_ROLE_VALUES`:
 * a validator that guards a DB CHECK needs the values at runtime, not only at
 * compile time.
 */
export const SERVICE_MODEL_VALUES: readonly string[] = ["internal", "external", "hybrid"];

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
 * exists), so — unlike the nullable ones — an empty string here is refused
 * rather than silently clearing the column; the route omits the key entirely
 * when the caller's input trims to empty.
 *
 * `service_model` and `has_legal_dept` (WP-6 B-4) are also NOT NULL, both
 * with a default, so NEITHER accepts null: clearing them is not a thing the
 * column allows. `service_model` is CHECK-constrained, which is why an
 * unrecognised value is a 400 here rather than a 23514 from Postgres — the
 * user gets Arabic, not a constraint name.
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

  if ("service_model" in value) {
    const raw = value.service_model;
    if (typeof raw !== "string" || !SERVICE_MODEL_VALUES.includes(raw)) {
      return { ok: false, error: "نموذج العمل القانوني غير صالح." };
    }
    patch.service_model = raw;
  }

  if ("has_legal_dept" in value) {
    const raw = value.has_legal_dept;
    if (typeof raw !== "boolean") {
      return { ok: false, error: "قيمة «لدى الشركة إدارة قانونية داخلية» يجب أن تكون صح أو خطأ." };
    }
    patch.has_legal_dept = raw;
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
