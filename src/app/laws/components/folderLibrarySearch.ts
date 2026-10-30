/**
 * folderLibrarySearch.ts — the «إدارة المحتوى» picker reads the REAL library
 * (owner notes ٠٤ §٢ and ٠٥ §٢.٢).
 * ─────────────────────────────────────────────────────────
 * Until 2026-10-30 both «إدارة محتوى مجلد» screens (SmartFolders.tsx and
 * FolderSelectionModal.tsx) filtered a hand-written 14-row array,
 * ALL_LIBRARY_DOCS: 12 laws, 2 books, and nothing at all under «المبادئ
 * والأحكام» or «الأوامر والتعاميم». That array is gone. The picker now asks:
 *
 *   - no query  → GET  /api/library/init?section=<s>&limit=<n> per tab — the
 *                 laws in the catalogue's own order (owner ٣١٧: the latest
 *                 legislative event first), decrees, books, and the whole
 *                 collections list (init reads collections whole, LIB-08);
 *   - a query   → POST /api/library/search { query, section, limit } — the
 *                 same relevance search as /laws — and, for the precedents
 *                 tab, the collections list filtered by title as well.
 *
 * This file is the pure half (no fetch, no React): which endpoint each tab
 * calls, and how each answer becomes the folder's document shape. The fetch
 * half is useFolderLibrarySearch.ts. Tested in folderLibrarySearch.test.ts.
 *
 * A folder item is a DOCUMENT, not a hit: an article hit saves its law, a
 * principle hit its collection, a fiqh passage its book — the same ids the
 * four reader pages save (resolveSavedItemHref opens each).
 */

import type { LibraryDoc } from "./SmartFolderTypes";
import { normalizeSearch } from "../../../utils/normalizeArabic.ts";

export type FolderPickerTab = "all" | "law" | "precedent" | "order" | "book";
export type FolderDocType = LibraryDoc["type"];

/** The five tabs, in the order the owner named them (note ٠٤ §٢). */
export const FOLDER_PICKER_TABS: ReadonlyArray<{ id: FolderPickerTab; label: string; labelEn: string }> = [
  { id: "all", label: "الكل", labelEn: "All" },
  { id: "law", label: "الأنظمة", labelEn: "Laws" },
  { id: "precedent", label: "المبادئ والأحكام", labelEn: "Precedents" },
  { id: "order", label: "الأوامر والتعاميم", labelEn: "Orders & circulars" },
  { id: "book", label: "الكتب الفقهية", labelEn: "Fiqh books" },
];

/** /api/library/search's section name for a tab. */
export const SEARCH_SECTION_FOR_TAB: Record<FolderPickerTab, "all" | "laws" | "precedents" | "orders" | "feqh"> = {
  all: "all",
  law: "laws",
  precedent: "precedents",
  order: "orders",
  book: "feqh",
};

/** /api/library/init's section name for a document type. */
export const INIT_SECTION_FOR_TYPE: Record<FolderDocType, "laws" | "collections" | "decrees" | "books"> = {
  law: "laws",
  precedent: "collections",
  order: "decrees",
  book: "books",
};

/** The search answers nothing under two letters (query_too_short). */
export const MIN_QUERY_LENGTH = 2;
/** Rows per tab before typing; «الكل» shows this many of each type. */
export const DEFAULT_ROWS_PER_TAB = 20;
export const DEFAULT_ROWS_PER_TYPE_IN_ALL = 5;
/** A law's article hits collapse into the law, so ask for more rows than are shown. */
export const SEARCH_LIMIT_SINGLE_SECTION = 40;
export const DEBOUNCE_MS = 350;

/** The order «الكل» lists the four types in — the tab order. */
export const DOC_TYPE_ORDER: readonly FolderDocType[] = ["law", "precedent", "order", "book"];

const DEFAULT_CAT = "SA-00";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function doc(type: FolderDocType, slug: string, title: string, catId = DEFAULT_CAT): LibraryDoc {
  return { slug, title, titleEn: title, catId: catId.slice(0, 30) || DEFAULT_CAT, type };
}

/** One key per document — the same (type, slug) pair the folder items are unique on. */
export function docKey(d: { type?: string | null; slug: string }): string {
  return `${d.type || "law"}\u0000${d.slug}`;
}

/** Keeps the first row of each (type, slug). */
export function dedupeDocs(docs: readonly LibraryDoc[]): LibraryDoc[] {
  const seen = new Set<string>();
  const out: LibraryDoc[] = [];
  for (const d of docs) {
    if (!d.slug || !d.title) continue;
    const k = docKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

/** "07" / "SA-07" / 7 → "SA-07"; anything else → SA-00. */
export function catIdFromSectionCode(code: unknown): string {
  const raw = typeof code === "number" ? String(code) : str(code);
  if (!raw) return DEFAULT_CAT;
  if (/^SA-\d{1,3}$/.test(raw)) return raw;
  if (/^\d{1,3}$/.test(raw)) return `SA-${raw.padStart(2, "0")}`;
  return DEFAULT_CAT;
}

/**
 * One /api/library/init section's rows → documents. `section` is the init
 * section the rows came from. Collections are sorted newest Hijri year first
 * (init orders them by title); decrees by their `date`, newest first, within
 * the page init returned (init orders decrees by id).
 */
export function mapInitRowsToDocs(
  section: "laws" | "collections" | "decrees" | "books",
  rows: unknown,
): LibraryDoc[] {
  if (!Array.isArray(rows)) return [];
  const list = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  if (section === "laws") {
    return dedupeDocs(list.map(r => doc("law", str(r.slug), str(r.title), catIdFromSectionCode(r.section_code))));
  }
  if (section === "collections") {
    const sorted = [...list].sort((a, b) => yearOf(b.year_hijri) - yearOf(a.year_hijri));
    return dedupeDocs(sorted.map(r => doc("precedent", str(r.id), str(r.title))));
  }
  if (section === "decrees") {
    const sorted = [...list].sort((a, b) => str(b.date).localeCompare(str(a.date)));
    return dedupeDocs(sorted.map(r => doc("order", str(r.id), str(r.title))));
  }
  return dedupeDocs(list.map(r => doc("book", str(r.id), str(r.title))));
}

function yearOf(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(str(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * /api/library/search `results` → documents, in the order the search ranked
 * them. Hits that name no document are dropped:
 *   laws       — a law-title hit or an article hit → its law (meta.lawSlug);
 *   precedents — a collection-title hit → the collection; a principle hit →
 *                its collection, ONLY when `collectionTitles` names it (the
 *                hit's own title is «مبدأ رقم …», not the collection's);
 *   orders     — the decree itself (id is the decree's uuid);
 *   feqh       — a book-title hit or a passage → its book (meta.bookSlug).
 */
export function mapSearchResultsToDocs(
  results: unknown,
  collectionTitles: ReadonlyMap<string, string> = new Map(),
): LibraryDoc[] {
  if (!Array.isArray(results)) return [];
  const out: LibraryDoc[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
    const section = str(r.section);
    if (section === "laws") {
      const slug = str(meta.lawSlug);
      const title = str(meta.lawTitle) || (meta.kind === "law" ? str(r.title) : "");
      if (slug && title) out.push(doc("law", slug, title, catIdFromSectionCode(meta.sectionCode)));
    } else if (section === "precedents") {
      const slug = str(meta.collectionSlug);
      if (!slug) continue;
      const title = meta.kind === "collection" ? str(r.title) : (collectionTitles.get(slug) ?? "");
      if (title) out.push(doc("precedent", slug, title));
    } else if (section === "orders") {
      const id = str(r.id);
      const title = str(r.title);
      if (id && title) out.push(doc("order", id, title));
    } else if (section === "feqh") {
      const slug = str(meta.bookSlug);
      const title = str(meta.bookTitle) || (meta.kind === "book" ? str(r.title) : "");
      if (slug && title) out.push(doc("book", slug, title));
    }
  }
  return dedupeDocs(out);
}

/** Documents whose title carries every word of the query (Arabic-folded). */
export function filterDocsByTitle(docs: readonly LibraryDoc[], query: string): LibraryDoc[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...docs];
  return docs.filter(d => {
    const t = normalizeSearch(d.title);
    return words.every(w => t.includes(w));
  });
}

/**
 * «الكل» before typing: the first `perType` documents of each type, in the
 * tab order. Each list is already in its own "latest first" order.
 */
export function interleaveDefaults(
  byType: Partial<Record<FolderDocType, readonly LibraryDoc[]>>,
  perType = DEFAULT_ROWS_PER_TYPE_IN_ALL,
): LibraryDoc[] {
  const out: LibraryDoc[] = [];
  for (const t of DOC_TYPE_ORDER) out.push(...(byType[t] ?? []).slice(0, perType));
  return dedupeDocs(out);
}

/** Search hits first, then title matches the search did not return. */
export function mergeDocLists(...lists: ReadonlyArray<readonly LibraryDoc[]>): LibraryDoc[] {
  return dedupeDocs(lists.flat());
}

/** Whether a typed query is long enough to search (after trimming). */
export function isSearchableQuery(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}
