/**
 * /laws search counts — the display half of the SEARCH COUNTS CONTRACT.
 *
 * POST /api/library/search and GET /api/library/autocomplete return
 * `counts` per section. Above 1,000 matches those are PostgREST planner
 * estimates, which can sit far above OR below the truth (measured: «نظام
 * العمل» 1,109 shown vs 2,172 real; التحكيم 1,001 vs 1,041). The API marks
 * each section with `countsExact[k]`; a section listed in `degraded` failed
 * to search at all. This module turns that into what the page may show:
 *
 *   exact     → the number
 *   inexact   → «أكثر من ١٬٠٠٠» — never the raw estimate
 *   degraded  → an Arabic notice, never «0 نتيجة»
 *
 * Missing `countsExact` (an API older than the contract) is treated as exact,
 * except that an API which already says `countsEstimated` + `countsExactUpTo`
 * (round-1 shape) proves nothing above that ceiling.
 *
 * No `@/` imports: node:test cannot resolve the alias.
 */

export const SEARCH_SECTIONS = ["laws", "precedents", "orders", "feqh"] as const;
export type SearchSection = (typeof SEARCH_SECTIONS)[number];

/** Above this a count is not proven exact (PostgREST max-rows). */
export const EXACT_COUNT_CEILING = 1000;

export const SECTION_DEGRADED_NOTICE = "تعذّر البحث في هذا القسم مؤقتاً — أعد المحاولة";

export interface SearchCountsInfo {
  /** null = the section's count is unknown (failed). */
  counts: Record<SearchSection, number | null>;
  exact: Record<SearchSection, boolean>;
  degraded: SearchSection[];
}

export const EMPTY_SEARCH_COUNTS: SearchCountsInfo = Object.freeze({
  counts: { laws: 0, precedents: 0, orders: 0, feqh: 0 },
  exact: { laws: true, precedents: true, orders: true, feqh: true },
  degraded: [],
}) as SearchCountsInfo;

function isSection(value: unknown): value is SearchSection {
  return typeof value === "string" && (SEARCH_SECTIONS as readonly string[]).includes(value);
}

/**
 * Read the counts part of a search/autocomplete response body.
 * `requested` limits `degraded` to the sections the request asked for.
 */
export function readSearchCounts(body: unknown, requested: readonly SearchSection[] = SEARCH_SECTIONS): SearchCountsInfo {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawCounts = (b.counts && typeof b.counts === "object" ? b.counts : {}) as Record<string, unknown>;
  const rawExact = (b.countsExact && typeof b.countsExact === "object" ? b.countsExact : null) as Record<string, unknown> | null;
  const legacyCeiling = b.countsEstimated === true
    ? (typeof b.countsExactUpTo === "number" && Number.isFinite(b.countsExactUpTo) ? b.countsExactUpTo : EXACT_COUNT_CEILING)
    : null;
  const degradedSet = new Set<SearchSection>(
    Array.isArray(b.degraded) ? (b.degraded as unknown[]).filter(isSection) : [],
  );

  const counts = {} as Record<SearchSection, number | null>;
  const exact = {} as Record<SearchSection, boolean>;
  for (const k of SEARCH_SECTIONS) {
    // A section the request did not ask for was not searched: it is not part
    // of any total, whatever flags the body carries for it.
    if (!requested.includes(k)) { counts[k] = 0; exact[k] = true; continue; }
    const raw = rawCounts[k];
    const n = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
    // A null count is the autocomplete route's failure signal (LIB-10).
    if (n === null && raw === null) degradedSet.add(k);
    counts[k] = n ?? (raw === undefined ? 0 : null);
    if (rawExact && typeof rawExact[k] === "boolean") exact[k] = rawExact[k] as boolean;
    else if (legacyCeiling !== null) exact[k] = (n ?? 0) <= legacyCeiling;
    else exact[k] = true;
  }
  for (const k of degradedSet) if (requested.includes(k)) exact[k] = false;

  return {
    counts,
    exact,
    degraded: SEARCH_SECTIONS.filter((k) => degradedSet.has(k) && requested.includes(k)),
  };
}

export type SectionCountDisplay =
  | { kind: "exact"; value: number }
  | { kind: "atLeast"; value: number }
  | { kind: "degraded" };

export function sectionCountDisplay(info: SearchCountsInfo, k: SearchSection): SectionCountDisplay {
  if (info.degraded.includes(k)) return { kind: "degraded" };
  const n = info.counts[k];
  if (n === null) return { kind: "degraded" };
  if (info.exact[k]) return { kind: "exact", value: n };
  // Never the planner number: an inexact count is shown as a floor.
  return { kind: "atLeast", value: Math.min(n, EXACT_COUNT_CEILING) };
}

/**
 * The total over `sections`. Exact sections add their count; an inexact one
 * adds the 1,000 floor; a degraded one adds 0. Any inexact or degraded
 * section makes the total a floor («أكثر من …»).
 */
export function totalCountDisplay(info: SearchCountsInfo, sections: readonly SearchSection[] = SEARCH_SECTIONS): { value: number; atLeast: boolean } {
  let value = 0;
  let atLeast = false;
  for (const k of sections) {
    const d = sectionCountDisplay(info, k);
    if (d.kind === "degraded") { atLeast = true; continue; }
    value += d.value;
    if (d.kind === "atLeast") atLeast = true;
  }
  return { value, atLeast };
}

export function formatArabicNumber(n: number): string {
  return n.toLocaleString("ar-SA");
}

/** «١٬٤٠٧» or «أكثر من ١٬٠٠٠»; null for a degraded section. */
export function formatCountAr(d: SectionCountDisplay | { value: number; atLeast: boolean }): string | null {
  if ("kind" in d) {
    if (d.kind === "degraded") return null;
    return d.kind === "atLeast" ? `أكثر من ${formatArabicNumber(d.value)}` : formatArabicNumber(d.value);
  }
  return d.atLeast ? `أكثر من ${formatArabicNumber(d.value)}` : formatArabicNumber(d.value);
}

/** Search-result section → the /laws "all" view block it fills. */
export const SEARCH_SECTION_LABELS_AR: Record<SearchSection, string> = {
  laws: "الأنظمة واللوائح",
  precedents: "المبادئ القضائية",
  orders: "الأوامر والتعاميم",
  feqh: "الفقه والمراجع",
};

// ─── Search paging (single-section views) ────────────────────────────────────

/** Rows per /laws search request. */
export const SEARCH_PAGE_SIZE = 50;
/**
 * Mirrors SEARCH_MAX_DEPTH in src/app/api/library/search/filters.ts (the API
 * rejects a single-section page with offset + limit above it). A client
 * component cannot import that server module; searchCounts.test.ts asserts the
 * two stay equal.
 */
export const SEARCH_MAX_DEPTH = 1000;

export interface SearchPagingState {
  /** Another page can be requested and holds at least one unseen row. */
  hasMore: boolean;
  /** More matches exist, but they sit past SEARCH_MAX_DEPTH. */
  depthCapped: boolean;
}

/** A law-level title hit (`law:<slug>`, meta.kind 'law'): not part of counts.laws. */
function isLawTitleHit(row: unknown): boolean {
  const r = (row && typeof row === "object" ? row : {}) as { id?: unknown; meta?: { kind?: unknown } };
  return r.meta?.kind === "law" || String(r.id ?? "").startsWith("law:");
}

/**
 * Whether a single-section search can load page `page + 1`.
 *
 * Never asks for a page past an exact count (the current API answers one
 * with an empty page, an older one with a 503), and never treats a short page as the end:
 * orders de-duplicate after counting (28 counted → 27 rows) and page 1 of
 * section=laws reserves up to 3 title-hit slots (55 articles → 47 on page 1).
 * - inexact (a floor above 1,000): more exist until the depth cap;
 * - exact, laws: an API that returns `lawTitleHits` counts the title hits
 *   inside counts.laws (the rows the section lists), so compare every row
 *   loaded; an older API counted article matches only, so title hits are
 *   left out of the comparison;
 * - exact, other sections: compare the server window already read
 *   (page × limit), which de-duplication cannot shrink.
 */
export function searchPagingState(
  info: SearchCountsInfo,
  section: SearchSection,
  page: number,
  rows: readonly unknown[],
  opts: { limit?: number; maxDepth?: number; lawCountIncludesTitleHits?: boolean } = {},
): SearchPagingState {
  const limit = opts.limit ?? SEARCH_PAGE_SIZE;
  const maxDepth = opts.maxDepth ?? SEARCH_MAX_DEPTH;
  const d = sectionCountDisplay(info, section);
  if (d.kind === "degraded") return { hasMore: false, depthCapped: false };
  let moreExist: boolean;
  if (d.kind === "atLeast") {
    moreExist = true;
  } else if (section === "laws") {
    const counted = opts.lawCountIncludesTitleHits ? rows.length : rows.filter((r) => !isLawTitleHit(r)).length;
    moreExist = counted < d.value;
  } else {
    moreExist = page * limit < d.value;
  }
  const maxPage = Math.floor(maxDepth / limit);
  return {
    hasMore: moreExist && page < maxPage,
    depthCapped: moreExist && page >= maxPage,
  };
}

/** Rows a new page adds, minus any id already shown (keys must stay unique). */
export function appendSearchRows<T>(prev: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(prev.map((r) => String((r as { id?: unknown })?.id)));
  const out = [...prev];
  for (const r of next) {
    const id = String((r as { id?: unknown })?.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

/**
 * The "all" view's view-all link. «كل» only when every counted row is
 * reachable: an exact count within the depth cap. An inexact count is a floor
 * above 1,000; paging stops at the API depth (up to 1,000 rows, fewer after
 * de-duplication), so the copy says «حتى».
 */
export function viewAllLabel(info: SearchCountsInfo, section: SearchSection, maxDepth: number = SEARCH_MAX_DEPTH): string | null {
  const d = sectionCountDisplay(info, section);
  if (d.kind === "degraded") return null;
  if (d.kind === "exact" && d.value <= maxDepth) return `عرض كل النتائج (${formatArabicNumber(d.value)})`;
  return `تصفّح حتى ${formatArabicNumber(maxDepth)} نتيجة (الإجمالي ${formatCountAr(d)})`;
}

export const SEARCH_DEPTH_CAP_NOTICE =
  `هذا أقصى ما يمكن تصفّحه من نتائج هذا البحث (حتى ${formatArabicNumber(SEARCH_MAX_DEPTH)} نتيجة). أضف كلمات أدق أو استخدم المرشحات لتضييق البحث.`;
