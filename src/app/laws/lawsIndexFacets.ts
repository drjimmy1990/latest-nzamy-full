/**
 * /laws index facets — the pure half of LIB-03 / LIB-09.
 *
 * WHY THIS EXISTS. The index was built for 386 laws that fit on one page, so
 * its section chips, their counts and the doc-type filter all ran in the
 * browser over whatever pages happened to be loaded. With 5,901 laws paged 50
 * at a time, page 1 held rows from 3 of 31 section codes: 28 chips read
 * «قريباً», and a section's laws were reachable only after up to 119 «تحميل
 * المزيد» clicks. Counts now come from GET /api/library/facets (one pass over
 * the whole table) and the list filters run in /api/library/init; this module
 * is the shared vocabulary both sides use, so the chip count and the list it
 * opens are computed by the same predicate and cannot drift apart.
 *
 * No `@/` imports: node:test cannot resolve the alias, and everything here is
 * plain data in, plain data out.
 */

/** The doc type whose filter also matches a law carrying a merged regulation. */
export const EXEC_REGULATION_TYPE = "لائحة تنفيذية";

/**
 * The stored section code ('00'..'30') for anything the UI or the DB might
 * carry: 'SA-06', '06', '6', ' 8 '. Returns null for anything that is not a
 * one- or two-digit code, so an unexpected value can never become a filter.
 */
export function toSectionCode(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const match = /^(?:SA-)?(\d{1,2})$/i.exec(String(raw).trim());
  return match ? match[1].padStart(2, "0") : null;
}

/**
 * The UI taxonomy id ('SA-NN') for a stored code. Decrees store codes both
 * padded ('02') and bare ('8'); comparing the raw value against 'SA-08' is
 * why a decree never matched its category (LIB-09).
 */
export function toTaxonomyId(raw: unknown): string | null {
  const code = toSectionCode(raw);
  return code ? `SA-${code}` : null;
}

/** One row of the facet source: a law, or a pre-grouped bucket with a count. */
export interface LawFacetRow {
  section_code: string | null;
  type: string | null;
  has_merged_regulation?: boolean | null;
  /** Rows this bucket stands for (a grouped RPC row); 1 when absent. */
  n?: number | null;
}

export interface SectionFacet {
  total: number;
  /** Laws per doc type ('' = no type recorded). */
  byType: Record<string, number>;
  /**
   * Laws with has_merged_regulation whose own type is NOT the executive
   * regulation. The «لائحة تنفيذية» filter matches them too, and counting them
   * separately keeps a law that is both from being counted twice.
   */
  mergedOther: number;
}

export interface LawFacets {
  total: number;
  /** Keyed by taxonomy id ('SA-06'); laws with no usable code sit under ''. */
  sections: Record<string, SectionFacet>;
  /** Laws per doc type across every section. */
  types: Record<string, number>;
  /** mergedOther across every section. */
  mergedOther: number;
}

function emptySection(): SectionFacet {
  return { total: 0, byType: {}, mergedOther: 0 };
}

export function buildLawFacets(rows: readonly LawFacetRow[]): LawFacets {
  const facets: LawFacets = { total: 0, sections: {}, types: {}, mergedOther: 0 };
  for (const row of rows) {
    const n = typeof row.n === "number" && Number.isFinite(row.n) ? row.n : 1;
    if (n <= 0) continue;
    const sectionId = toTaxonomyId(row.section_code) ?? "";
    const type = (row.type ?? "").trim();
    const section = (facets.sections[sectionId] ??= emptySection());
    section.total += n;
    section.byType[type] = (section.byType[type] ?? 0) + n;
    facets.types[type] = (facets.types[type] ?? 0) + n;
    facets.total += n;
    if (row.has_merged_regulation && type !== EXEC_REGULATION_TYPE) {
      section.mergedOther += n;
      facets.mergedOther += n;
    }
  }
  return facets;
}

/**
 * Laws the index would list for (section, doc type) — the same predicate
 * /api/library/init applies: `type = docType`, widened for «لائحة تنفيذية»
 * to laws that carry a merged regulation. 'all' means no filter.
 */
export function countLaws(facets: LawFacets, sectionId: string, docType: string): number {
  const pick = (byType: Record<string, number>, merged: number, total: number) => {
    if (docType === "all") return total;
    const own = byType[docType] ?? 0;
    return docType === EXEC_REGULATION_TYPE ? own + merged : own;
  };
  if (sectionId === "all") return pick(facets.types, facets.mergedOther, facets.total);
  const section = facets.sections[sectionId];
  if (!section) return 0;
  return pick(section.byType, section.mergedOther, section.total);
}

/**
 * The doc types present in (or under) a section, most frequent first, with the
 * count the list would show. Lets the type row offer the types the data
 * actually holds («قرار» 1,037, «اتفاقية دولية» 504 …) instead of a fixed list
 * where seven entries matched nothing.
 */
export function docTypesFor(facets: LawFacets, sectionId: string): { type: string; count: number }[] {
  const source = sectionId === "all" ? facets.types : facets.sections[sectionId]?.byType ?? {};
  const out = Object.keys(source)
    .filter((t) => t !== "")
    .map((type) => ({ type, count: countLaws(facets, sectionId, type) }));
  // A section can have merged regulations without any row typed «لائحة تنفيذية».
  if (!out.some((t) => t.type === EXEC_REGULATION_TYPE)) {
    const count = countLaws(facets, sectionId, EXEC_REGULATION_TYPE);
    if (count > 0) out.push({ type: EXEC_REGULATION_TYPE, count });
  }
  return out
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "ar"));
}

/**
 * Section 30 is not in LEGAL_TAXONOMY (src/constants/taxonomies.ts stops at
 * SA-29 + SA-99), so its 103 laws were reachable only under «الكل». They are
 * rows of library.laws (types تعميم / أمر ملكي / مرسوم ملكي …) served by
 * /laws/[slug]; the «أوامر وتعاميم» tab reads a different table
 * (decrees_circulars) and links to /laws/orders/{id}, where a laws slug would
 * 404. So the index gets its own chip, labelled with the DB's section_name.
 * It is added here rather than to LEGAL_TAXONOMY because the consultation and
 * community pickers consume that list too.
 */
export const SECTION_30 = {
  id: "SA-30",
  label: "الأوامر والتعاميم والمراسيم",
  labelEn: "Orders, Circulars & Decrees",
} as const;

/** Keys for the laws list the page currently holds, so a stale response is dropped. */
export function lawsFilterKey(sectionId: string, docType: string): string {
  return `${sectionId}|${docType}`;
}

/** Query-string params for /api/library/init?section=laws under a filter. */
export function lawsFilterParams(sectionId: string, docType: string): Record<string, string> {
  const params: Record<string, string> = {};
  const code = sectionId === "all" ? null : toSectionCode(sectionId);
  if (code) params.section_code = code;
  if (docType && docType !== "all") params.type = docType;
  return params;
}
