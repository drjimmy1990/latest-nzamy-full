/**
 * saudiCities.ts — the one city pick list for a client's request (owner
 * decisions ١٠ + ١٩, 17 Nov 2026): the lawyer browsing open requests sees the
 * case type, the CITY and one summary line, never the client's name.
 *
 * The value stored in `service_requests.city` is the slug, never the Arabic
 * label and never free text: the column's CHECK (20261124_30) accepts
 * `^[a-z_]{2,40}$` only, so nothing a client types can reach a lawyer through
 * this field. The slugs of the ten entries ServiceRequestWizardData.REGIONS
 * already used are kept as they were (riyadh, jeddah, … other), so that
 * wizard's `region` maps straight onto this list.
 *
 * Pure, no imports: the API route and `node --test` load it directly.
 */

export interface SaudiCity {
  value: string;
  label: string;
  labelEn: string;
}

export const SAUDI_CITIES: readonly SaudiCity[] = [
  { value: "riyadh", label: "الرياض", labelEn: "Riyadh" },
  { value: "jeddah", label: "جدة", labelEn: "Jeddah" },
  { value: "mecca", label: "مكة المكرمة", labelEn: "Mecca" },
  { value: "medina", label: "المدينة المنورة", labelEn: "Medina" },
  { value: "dammam", label: "الدمام", labelEn: "Dammam" },
  { value: "khobar", label: "الخبر", labelEn: "Al Khobar" },
  { value: "dhahran", label: "الظهران", labelEn: "Dhahran" },
  { value: "ahsa", label: "الأحساء", labelEn: "Al Ahsa" },
  { value: "jubail", label: "الجبيل", labelEn: "Jubail" },
  { value: "qatif", label: "القطيف", labelEn: "Qatif" },
  { value: "hafr_albatin", label: "حفر الباطن", labelEn: "Hafr Al Batin" },
  { value: "kharj", label: "الخرج", labelEn: "Al Kharj" },
  { value: "taif", label: "الطائف", labelEn: "Taif" },
  { value: "yanbu", label: "ينبع", labelEn: "Yanbu" },
  { value: "buraidah", label: "بريدة", labelEn: "Buraidah" },
  { value: "unaizah", label: "عنيزة", labelEn: "Unaizah" },
  { value: "hail", label: "حائل", labelEn: "Hail" },
  { value: "tabuk", label: "تبوك", labelEn: "Tabuk" },
  { value: "abha", label: "أبها", labelEn: "Abha" },
  { value: "khamis_mushait", label: "خميس مشيط", labelEn: "Khamis Mushait" },
  { value: "jazan", label: "جازان", labelEn: "Jazan" },
  { value: "najran", label: "نجران", labelEn: "Najran" },
  { value: "baha", label: "الباحة", labelEn: "Al Baha" },
  { value: "sakaka", label: "سكاكا", labelEn: "Sakaka" },
  { value: "arar", label: "عرعر", labelEn: "Arar" },
  { value: "qurayyat", label: "القريات", labelEn: "Al Qurayyat" },
  { value: "other", label: "مدينة أخرى", labelEn: "Other city" },
];

const BY_VALUE: ReadonlyMap<string, SaudiCity> = new Map(SAUDI_CITIES.map((c) => [c.value, c]));

/** True when `value` is one of the slugs above. */
export function isSaudiCityValue(value: unknown): value is string {
  return typeof value === "string" && BY_VALUE.has(value);
}

/**
 * The Arabic label of a stored slug, or null (no city, or a slug this build
 * does not know). Null rather than the raw slug: the screen shows nothing.
 */
export function saudiCityLabelAr(value: string | null | undefined): string | null {
  if (!value) return null;
  return BY_VALUE.get(value)?.label ?? null;
}
