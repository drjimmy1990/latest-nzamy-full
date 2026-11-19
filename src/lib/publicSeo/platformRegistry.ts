/**
 * platformRegistry.ts — the platform's licence and commercial registration as
 * ADMIN SETTINGS (owner file 20 row 4, file 15 rows 11 and 45; batch l9).
 *
 * The owner: «نظامي منصة مرخّصة» stays, and is published with the licence
 * number once he sends it. Two platform_settings rows hold it, edited on the
 * admin settings page and validated + audited by PATCH /api/v1/admin/settings:
 *   license_number   the licence number   (string; "" or no row = not given)
 *   license_issuer   the issuing body     (string; "" or no row = not given)
 * The commercial registration and the legal name are NOT a second copy: they
 * come from billing_company (cr_number, legal_name_ar), the receipt's issuer.
 *
 * While license_number is empty the licence line is hidden WHOLE — on /faq,
 * in the footer, in the Organization JSON-LD and in /llms.txt — and the raw
 * owner placeholder «[[…]]» can never reach a visitor (the validator refuses
 * it). The home badge says «منصة مرخّصة» and names an issuer only when one is
 * set (it used to say «مرخّص من وزارة العدل», an issuer the owner never gave).
 *
 * Pure: no imports, so `node --test` loads it and client code may import it.
 */

export const LICENSE_NUMBER_KEY = "license_number";
export const LICENSE_ISSUER_KEY = "license_issuer";
export const BILLING_COMPANY_KEY = "billing_company";

/** The keys the server reader asks for, in one request. */
export const PLATFORM_REGISTRY_KEYS = [LICENSE_NUMBER_KEY, LICENSE_ISSUER_KEY, BILLING_COMPANY_KEY] as const;

/** Same shape as structuredData.ORGANIZATION_REGISTRY ("" = not given). */
export interface PlatformRegistry {
  legalName: string;
  commercialRegistration: string;
  licence: string;
  licenceIssuer: string;
}

export const EMPTY_REGISTRY: PlatformRegistry = Object.freeze({
  legalName: "",
  commercialRegistration: "",
  licence: "",
  licenceIssuer: "",
});

const MAX_LEN: Record<string, number> = { [LICENSE_NUMBER_KEY]: 60, [LICENSE_ISSUER_KEY]: 120 };

// A placeholder, markup or a control character must never be published.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /\[\[|\]\]|[<>{}]|[\u0000-\u001f\u007f]/;

/** One line of plain text, or "" for anything that is not a usable string. */
function clean(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  const v = value.replace(/\s+/g, " ").trim();
  if (!v || v.length > max || FORBIDDEN.test(v)) return "";
  return v;
}

/**
 * The admin PATCH validator for license_number / license_issuer: a string
 * (empty = hide the line; never null — platform_settings.value is NOT NULL);
 * at most 60 / 120 characters, one line, no «[[…]]» placeholder and no
 * markup. Returns an Arabic error or null.
 */
export function licenceSettingIssue(key: string, value: unknown): string | null {
  if (typeof value !== "string") return `قيمة ${key} يجب أن تكون نصاً (اتركه فارغاً لإخفاء سطر الترخيص)`;
  const max = MAX_LEN[key] ?? 120;
  const v = value.trim();
  if (v.length > max) return `قيمة ${key} أطول من ${max} حرفاً`;
  if (/[\r\n]/.test(value)) return `قيمة ${key} يجب أن تكون سطراً واحداً`;
  if (FORBIDDEN.test(v)) return `قيمة ${key} لا تقبل «[[» أو «]]» أو الرموز < > { } — اكتب الرقم أو اسم الجهة كما يُنشر`;
  return null;
}

/** platform_settings rows ({key, value}[]) → the registry; anything malformed reads as "". */
export function registryFromRows(rows: unknown): PlatformRegistry {
  if (!Array.isArray(rows)) return EMPTY_REGISTRY;
  const byKey = new Map<string, unknown>();
  for (const r of rows) {
    if (r && typeof r === "object" && typeof (r as { key?: unknown }).key === "string") {
      byKey.set((r as { key: string }).key, (r as { value?: unknown }).value);
    }
  }
  const billing = byKey.get(BILLING_COMPANY_KEY);
  const b = billing && typeof billing === "object" && !Array.isArray(billing) ? (billing as Record<string, unknown>) : {};
  return {
    legalName: clean(b.legal_name_ar),
    commercialRegistration: clean(b.cr_number, 30),
    licence: clean(byKey.get(LICENSE_NUMBER_KEY), MAX_LEN[LICENSE_NUMBER_KEY]),
    licenceIssuer: clean(byKey.get(LICENSE_ISSUER_KEY), MAX_LEN[LICENSE_ISSUER_KEY]),
  };
}

/**
 * The licence line, owner's wording (file 20 row 4) without its first clause,
 * which the surrounding text already says: «رقم الترخيص: …، الجهة المانحة: ….»
 * null while the number is empty — the WHOLE line is hidden.
 */
export function licenceLineAr(reg: PlatformRegistry): string | null {
  const number = clean(reg.licence, MAX_LEN[LICENSE_NUMBER_KEY]);
  if (!number) return null;
  const issuer = clean(reg.licenceIssuer, MAX_LEN[LICENSE_ISSUER_KEY]);
  return issuer ? `رقم الترخيص: ${number}، الجهة المانحة: ${issuer}.` : `رقم الترخيص: ${number}.`;
}

export function licenceLineEn(reg: PlatformRegistry): string | null {
  const number = clean(reg.licence, MAX_LEN[LICENSE_NUMBER_KEY]);
  if (!number) return null;
  const issuer = clean(reg.licenceIssuer, MAX_LEN[LICENSE_ISSUER_KEY]);
  return issuer ? `Licence number: ${number}, issued by: ${issuer}.` : `Licence number: ${number}.`;
}

/** The home page's trust badge: «منصة مرخّصة», naming the issuer only once it is set. */
export function licenceBadge(reg: PlatformRegistry, isAr: boolean): string {
  const issuer = clean(reg.licenceIssuer, MAX_LEN[LICENSE_ISSUER_KEY]);
  if (isAr) return issuer ? `مرخّص من ${issuer}` : "منصة مرخّصة";
  return "Licensed platform";
}
