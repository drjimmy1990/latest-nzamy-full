/**
 * lawyerProfileFields.ts — the vocabulary and rules of the professional
 * profile (Phase 7, items 128 · 130 · 133). Pure — no I/O.
 * ─────────────────────────────────────────────────────────
 * Mirrors 20260907_phase7_profile_services_reviews.sql: the slug format and
 * reserved words are the CHECK constraints; education is a JSON array of
 * {degree, institution, year}; courts and languages are text arrays whose
 * values come from the lists below so a screen never prints a raw code.
 */

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_SLUGS = ["browse", "new", "me", "admin", "api", "search", "directory"] as const;

/** Arabic reason a slug is refused, or null. */
export function slugIssue(slug: string): string | null {
  const s = slug.trim();
  if (!s) return null; // empty = no slug, allowed
  if (s !== s.toLowerCase()) return "الرابط بأحرف صغيرة فقط";
  if (!SLUG_RE.test(s)) return "الرابط: ٣–٤٠ حرفاً لاتينياً أو رقماً أو شرطة، لا يبدأ ولا ينتهي بشرطة";
  if ((RESERVED_SLUGS as readonly string[]).includes(s)) return "هذا الرابط محجوز";
  return null;
}

/** «Ahmad Al-Ghamdi» → «ahmad-al-ghamdi»; Arabic names give "" (the lawyer types a Latin slug). */
export function suggestSlug(displayName: string): string {
  return displayName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export interface EducationEntry {
  degree: string;        // «بكالوريوس القانون»
  institution: string;   // «جامعة الملك سعود»
  year: number | null;   // Gregorian year, or null
}

export function educationIssue(entries: EducationEntry[]): string | null {
  if (!Array.isArray(entries)) return "المؤهلات يجب أن تكون قائمة";
  if (entries.length > 10) return "حتى ١٠ مؤهلات";
  for (const e of entries) {
    if (!e || typeof e.degree !== "string" || !e.degree.trim()) return "كل مؤهل يحتاج اسم الدرجة";
    if (typeof e.institution !== "string" || !e.institution.trim()) return "كل مؤهل يحتاج اسم الجهة";
    if (e.year !== null && (!Number.isInteger(e.year) || e.year < 1950 || e.year > 2100)) return "سنة التخرّج غير صالحة";
  }
  return null;
}

/** Courts a Saudi lawyer appears before — codes are stored, labels rendered. */
export const COURTS = [
  { code: "general",        ar: "المحاكم العامة" },
  { code: "criminal",       ar: "المحاكم الجزائية" },
  { code: "family",         ar: "محاكم الأحوال الشخصية" },
  { code: "commercial",     ar: "المحاكم التجارية" },
  { code: "labor",          ar: "المحاكم العمالية" },
  { code: "administrative", ar: "المحاكم الإدارية (ديوان المظالم)" },
  { code: "appeal",         ar: "محاكم الاستئناف" },
  { code: "supreme",        ar: "المحكمة العليا" },
  { code: "enforcement",    ar: "محاكم التنفيذ" },
  { code: "committees",     ar: "اللجان شبه القضائية" },
  { code: "arbitration",    ar: "هيئات التحكيم" },
] as const;
export type CourtCode = (typeof COURTS)[number]["code"];
export const COURT_AR: Record<string, string> = Object.fromEntries(COURTS.map((c) => [c.code, c.ar]));
export function isCourtCode(v: unknown): v is CourtCode {
  return typeof v === "string" && v in COURT_AR;
}

export const LANGUAGES = [
  { code: "ar", ar: "العربية" },
  { code: "en", ar: "الإنجليزية" },
  { code: "fr", ar: "الفرنسية" },
  { code: "ur", ar: "الأردية" },
  { code: "hi", ar: "الهندية" },
  { code: "tl", ar: "الفلبينية" },
  { code: "bn", ar: "البنغالية" },
  { code: "tr", ar: "التركية" },
  { code: "de", ar: "الألمانية" },
  { code: "es", ar: "الإسبانية" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const LANGUAGE_AR: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.ar]));
export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && v in LANGUAGE_AR;
}

/** Service pricing vocabulary (public.lawyer_services). */
export const PRICING_KINDS = ["fixed", "from", "hourly", "quote"] as const;
export type PricingKind = (typeof PRICING_KINDS)[number];
export const PRICING_KIND_AR: Record<PricingKind, string> = {
  fixed:  "سعر ثابت",
  from:   "يبدأ من",
  hourly: "بالساعة",
  quote:  "بحسب الحالة",
};
export const SERVICE_CATEGORIES = ["consultation", "drafting", "review", "litigation", "representation", "other"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export const SERVICE_CATEGORY_AR: Record<ServiceCategory, string> = {
  consultation:   "استشارة",
  drafting:       "صياغة",
  review:         "مراجعة",
  litigation:     "ترافع",
  representation: "تمثيل وتوكيل",
  other:          "أخرى",
};
export const isPricingKind = (v: unknown): v is PricingKind => typeof v === "string" && (PRICING_KINDS as readonly string[]).includes(v);
export const isServiceCategory = (v: unknown): v is ServiceCategory => typeof v === "string" && (SERVICE_CATEGORIES as readonly string[]).includes(v);

/** «٣٠٠ ر.س» / «يبدأ من ٣٠٠ ر.س» / «٥٠٠ ر.س / ساعة» / «بحسب الحالة» */
export function servicePriceLabelAr(kind: PricingKind, priceSar: number | null, toDigits: (n: number) => string = String): string {
  if (kind === "quote" || priceSar === null) return PRICING_KIND_AR.quote;
  const amount = `${toDigits(priceSar)} ر.س`;
  if (kind === "from") return `يبدأ من ${amount}`;
  if (kind === "hourly") return `${amount} / ساعة`;
  return amount;
}
