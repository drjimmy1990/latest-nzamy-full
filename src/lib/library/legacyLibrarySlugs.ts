/**
 * q390 (S1 Task 4): the English slugs of the 33 bundled principle collections
 * and the bundled book «مصادر الحق». The bundles are gone; every catalogue
 * link that still points at one of these slugs lands on its database record
 * (`dbId`, a redirect) or on «قريباً» (`dbId` null).
 *
 * Catalogue entries only: a title and an id, never text. `dbId` comes ONLY
 * from the production precheck
 * (SQL_batch_2026-11-03_owner_free/S1_precheck_principles_and_book.READ_ONLY.sql):
 * a row with ok = true gets its id; a title match on one of the three
 * «مبادئ قضائية» rows only when confirmed by eye. Every other row stays null.
 *
 * Pure (readQuota.ts imports nothing server-only), so the client readers and
 * node:test can both load it.
 */
import { normalizeDocSegment } from "./readQuota.ts";

export interface LegacyLibraryTarget {
  /** The catalogue title (from the old bundle's own title). */
  titleAr: string;
  /** The library id to redirect to; null = not loaded yet (or not confirmed). */
  dbId: string | null;
}

const entry = (titleAr: string, dbId: string | null = null): LegacyLibraryTarget => Object.freeze({ titleAr, dbId });

const INSURANCE = entry("مدونة المبادئ القضائية التأمينية", "LAW-08-0661");

export const LEGACY_COLLECTION_SLUGS: Readonly<Record<string, LegacyLibraryTarget>> = Object.freeze({
  "admin-supreme-1439-1440-1441-part1": entry("مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الأول", "idari-olya-mabadi-1439-1441-j1"),
  "admin-supreme-1439-1440-1441-part2": entry("مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الثاني", "idari-olya-mabadi-1439-1441-j2"),
  "admin-supreme-1442-part1": entry("مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الأول", "idari-olya-mabadi-1442-j1"),
  "admin-supreme-1442-part2": entry("مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثاني", "idari-olya-mabadi-1442-j2"),
  "admin-supreme-1442-part3": entry("مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثالث", "idari-olya-mabadi-1442-j3"),
  "admin-supreme-1443-part1": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الأول", "idari-olya-mabadi-1443-j1"),
  "admin-supreme-1443-part2": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثاني", "idari-olya-mabadi-1443-j2"),
  "admin-supreme-1443-part3": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثالث", "idari-olya-mabadi-1443-j3"),
  "admin-supreme-1443-part4": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الرابع", "idari-olya-mabadi-1443-j4"),
  "admin-supreme-1443-part5": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الخامس", "idari-olya-mabadi-1443-j5"),
  "admin-supreme-1444-part1": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الأول", "idari-olya-mabadi-1444-j1"),
  "admin-supreme-1444-part2": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثاني", "idari-olya-mabadi-1444-j2"),
  "admin-supreme-1444-part3": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثالث", "LAW-98-1258"),
  "admin-supreme-1444-part4": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الرابع", "LAW-98-1259"),
  "admin-supreme-1444-part5": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الخامس", "LAW-98-1260"),
  // The bundle titled these three «مبادئ قضائية» alike.
  "banking-1408-1427": entry("مبادئ قضائية", "LAW-98-1263"),
  "banking-1443": entry("مبادئ قضائية", "LAW-98-1262"),
  "commercial-papers": entry("مبادئ قضائية", "LAW-98-1264"),
  "customs-2015-2023": entry("مجموعة المبادئ الاستئنافية الجمركية ٢٠١٥-٢٠٢٣م", "LAW-98-1268"),
  "customs-2024": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الجمركية لعام ٢٠٢٤م", "LAW-98-1269"),
  "insurance-principles": INSURANCE,
  "insurance-1438": INSURANCE,
  "labor-principles-1431-vol1": entry("مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الأول", "LAW-98-1254"),
  "labor-principles-1431-vol2": entry("مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الثاني", "LAW-98-1256"),
  "labor-principles-1432": entry("مدونة المبادئ العمالية لعام 1432هـ", "LAW-98-1253"),
  "price-adjustment": entry("مبادئ لجنة النظر في التظلمات وطلبات تعديل الأسعار", "LAW-97-1308"),
  "supreme-judicial-council": entry("المبادئ والقرارات القانونية", "LAW-98-1252"),
  "tamyeez": entry("تقريرات محكمة التمييز", "LAW-98-1250"),
  "tax-2024": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الضريبية لعام ٢٠٢٤م", "LAW-98-1276"),
  "zakat-2024": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية لعام ٢٠٢٤م", "LAW-98-1271"),
  "zakat-tax-2020-2021-j1": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الأول", "LAW-98-1272"),
  "zakat-tax-2020-2021-j2": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الثاني", "LAW-98-1273"),
  "zakat-tax-2022-j3": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٢م - المجلد الثالث", "LAW-98-1274"),
  "zakat-tax-2023-j4": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٣م - المجلد الرابع", "LAW-98-1275"),
});

export const LEGACY_BOOK_SLUGS: Readonly<Record<string, LegacyLibraryTarget>> = Object.freeze({
  "sources-of-right-1": entry("مصادر الحق في الفقه الإسلامي", "مصادر الحق في الفقه الإسلامي - الجزء الأول"),
});

/**
 * The legacy entry for a collection or book slug, or null. The slug is
 * normalised like a quota key first (percent-decoded, NFC, trimmed); only own
 * keys match, so `constructor` or `__proto__` never resolve.
 */
export function legacyTarget(kind: "collection" | "book", slug: string): LegacyLibraryTarget | null {
  const key = normalizeDocSegment(slug);
  if (key === null) return null;
  const table = kind === "collection" ? LEGACY_COLLECTION_SLUGS : LEGACY_BOOK_SLUGS;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}
