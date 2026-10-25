/**
 * brandingVault.ts — the pure rules of the letterhead identity (D4, owner
 * decision ٢٥٦): what a vault holds, how a write is checked, which image
 * bytes are accepted as a logo, and where the logo lives in the private
 * `branding` bucket. Mirrors supabase/migrations/20261026_63_branding_vault.sql
 * (its CHECKs and its storage path shape); brandingVault.test.ts pins both.
 *
 * No React, no Supabase, no clock — `node --test` runs it directly.
 */

export type BrandingScope = "lawyer" | "firm";

export const BRANDING_BUCKET = "branding";
export const BRANDING_DEFAULT_ACCENT = "#C8A762";
/** 1 MB — the bucket's file_size_limit. */
export const BRANDING_LOGO_MAX_BYTES = 1024 * 1024;
/** The firm roles that manage the firm's vault, besides the owner (63's can_manage_branding_vault). */
export const FIRM_BRANDING_ROLES: ReadonlySet<string> = new Set(["managing_partner", "office_admin"]);

/** The fields a session writes (63's column grants), with their length caps. */
export const BRANDING_TEXT_FIELDS = {
  display_name_ar: 120,
  display_name_en: 120,
  address: 300,
  phone: 40,
  email: 160,
  website: 200,
} as const;
export type BrandingTextField = keyof typeof BRANDING_TEXT_FIELDS;

export interface BrandingFields {
  display_name_ar: string;
  display_name_en: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  accent_color: string;
}

export const EMPTY_BRANDING_FIELDS: BrandingFields = {
  display_name_ar: "",
  display_name_en: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  accent_color: BRANDING_DEFAULT_ACCENT,
};

export const BRANDING_FIELD_LABEL_AR: Record<keyof BrandingFields, string> = {
  display_name_ar: "الاسم بالعربية",
  display_name_en: "الاسم بالإنجليزية",
  address: "العنوان",
  phone: "الهاتف",
  email: "البريد الإلكتروني",
  website: "الموقع الإلكتروني",
  accent_color: "لون التمييز",
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
// Same shapes as the table's CHECKs (POSIX classes there, \s here).
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const WEBSITE = /^https?:\/\/[^\s<>"]+$/i;

export type BrandingValidation =
  | { ok: true; fields: BrandingFields }
  | { ok: false; field: keyof BrandingFields; error: string };

/**
 * Checks a write body. Unknown keys are ignored; a missing key becomes "" (the
 * accent its default). Text is trimmed and inner whitespace runs collapsed —
 * a letterhead line never needs a tab or a newline. A website typed without a
 * scheme gets `https://`.
 */
export function validateBrandingFields(body: unknown): BrandingValidation {
  const src = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: BrandingFields = { ...EMPTY_BRANDING_FIELDS };
  for (const [key, max] of Object.entries(BRANDING_TEXT_FIELDS) as [BrandingTextField, number][]) {
    const raw = src[key];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      return { ok: false, field: key, error: `${BRANDING_FIELD_LABEL_AR[key]}: قيمة غير صالحة` };
    }
    const value = (raw ?? "").replace(/\s+/g, " ").trim();
    if (value.length > max) {
      return { ok: false, field: key, error: `${BRANDING_FIELD_LABEL_AR[key]}: الحد الأقصى ${max} حرفاً` };
    }
    out[key] = value;
  }
  if (out.website && !/^[a-z][a-z0-9+.-]*:/i.test(out.website)) out.website = `https://${out.website}`;
  if (out.website && (!WEBSITE.test(out.website) || out.website.length > BRANDING_TEXT_FIELDS.website)) {
    return { ok: false, field: "website", error: "الموقع الإلكتروني: يجب أن يبدأ بـ https://" };
  }
  if (out.email && !EMAIL.test(out.email)) {
    return { ok: false, field: "email", error: "البريد الإلكتروني: صيغة غير صحيحة" };
  }
  const accent = src.accent_color;
  if (accent !== undefined && accent !== null && accent !== "") {
    if (typeof accent !== "string" || !HEX.test(accent.trim())) {
      return { ok: false, field: "accent_color", error: "لون التمييز: اختر لوناً بصيغة ‎#RRGGBB" };
    }
    out.accent_color = accent.trim().toUpperCase();
  }
  return { ok: true, fields: out };
}

export interface SniffedImage {
  mime: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
}

/**
 * The logo's type from its first bytes — never from its name or the
 * Content-Type the browser sends (the bucket's MIME list trusts that header,
 * so an SVG renamed to .png would pass it). Anything else, SVG included, is
 * refused.
 */
export function sniffLogoImage(bytes: Uint8Array): SniffedImage | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `u/<lawyer uid>/logo-<random>.<ext>` or `f/<firm id>/logo-<random>.<ext>` —
 * the only shape 63's CHECK and Storage policies accept. A fresh random name
 * per upload, so a printed page or a cached signed URL never shows a logo the
 * office has since replaced.
 */
export function brandingLogoPath(scope: BrandingScope, ownerId: string, random: string, ext: SniffedImage["ext"]): string {
  const id = ownerId.toLowerCase();
  if (!UUID.test(id)) throw new Error("brandingLogoPath: owner id is not a uuid");
  if (!/^[a-z0-9]{8,40}$/.test(random)) throw new Error("brandingLogoPath: random part must be 8–40 of [a-z0-9]");
  return `${scope === "lawyer" ? "u" : "f"}/${id}/logo-${random}.${ext}`;
}

/** True when `path` is a logo path of this very vault (what 63's CHECK enforces). */
export function isOwnLogoPath(path: string | null | undefined, scope: BrandingScope, ownerId: string): boolean {
  if (!path) return false;
  const m = /^([uf])\/([0-9a-f-]{36})\/logo-[a-z0-9]{8,40}\.(png|jpg|webp)$/.exec(path);
  return !!m && m[1] === (scope === "lawyer" ? "u" : "f") && m[2] === ownerId.toLowerCase();
}

/** PostgREST / Postgres codes for "branding_vaults is not there yet" (63 not run). */
export function isMissingBrandingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /branding_vaults/.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "");
}

/** «يتطلب تحديث قاعدة البيانات» — what every screen says while 63 has not run. */
export const BRANDING_NEEDS_MIGRATION_AR = "يتطلب تحديث قاعدة البيانات — خزنة الهوية غير مفعّلة بعد على هذا الخادم.";
