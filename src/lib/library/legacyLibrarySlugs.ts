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

const INSURANCE = entry("مدونة المبادئ القضائية التأمينية");

export const LEGACY_COLLECTION_SLUGS: Readonly<Record<string, LegacyLibraryTarget>> = Object.freeze({
  "admin-supreme-1439-1440-1441-part1": entry("مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الأول"),
  "admin-supreme-1439-1440-1441-part2": entry("مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الثاني"),
  "admin-supreme-1442-part1": entry("مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الأول"),
  "admin-supreme-1442-part2": entry("مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثاني"),
  "admin-supreme-1442-part3": entry("مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثالث"),
  "admin-supreme-1443-part1": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الأول"),
  "admin-supreme-1443-part2": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثاني"),
  "admin-supreme-1443-part3": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثالث"),
  "admin-supreme-1443-part4": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الرابع"),
  "admin-supreme-1443-part5": entry("مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الخامس"),
  "admin-supreme-1444-part1": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الأول"),
  "admin-supreme-1444-part2": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثاني"),
  "admin-supreme-1444-part3": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثالث"),
  "admin-supreme-1444-part4": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الرابع"),
  "admin-supreme-1444-part5": entry("مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الخامس"),
  // The bundle titled these three «مبادئ قضائية» alike.
  "banking-1408-1427": entry("مبادئ قضائية"),
  "banking-1443": entry("مبادئ قضائية"),
  "commercial-papers": entry("مبادئ قضائية"),
  "customs-2015-2023": entry("مجموعة المبادئ الاستئنافية الجمركية ٢٠١٥-٢٠٢٣م"),
  "customs-2024": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الجمركية لعام ٢٠٢٤م"),
  "insurance-principles": INSURANCE,
  "insurance-1438": INSURANCE,
  "labor-principles-1431-vol1": entry("مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الأول"),
  "labor-principles-1431-vol2": entry("مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الثاني"),
  "labor-principles-1432": entry("مدونة المبادئ العمالية لعام 1432هـ"),
  "price-adjustment": entry("مبادئ لجنة النظر في التظلمات وطلبات تعديل الأسعار"),
  "supreme-judicial-council": entry("المبادئ والقرارات القانونية"),
  "tamyeez": entry("تقريرات محكمة التمييز"),
  "tax-2024": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الضريبية لعام ٢٠٢٤م"),
  "zakat-2024": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية لعام ٢٠٢٤م"),
  "zakat-tax-2020-2021-j1": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الأول"),
  "zakat-tax-2020-2021-j2": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الثاني"),
  "zakat-tax-2022-j3": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٢م - المجلد الثالث"),
  "zakat-tax-2023-j4": entry("مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٣م - المجلد الرابع"),
});

export const LEGACY_BOOK_SLUGS: Readonly<Record<string, LegacyLibraryTarget>> = Object.freeze({
  "sources-of-right-1": entry("مصادر الحق في الفقه الإسلامي"),
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
