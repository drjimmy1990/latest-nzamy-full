/**
 * smartFolderApiMapper.ts — the one DB→frontend folder mapping.
 * ─────────────────────────────────────────────────────────
 * Shared by SmartFolders.tsx and FolderSelectionModal.tsx so the two never
 * carry two slightly different readings of the same
 * `GET /api/library/folders` row (Phase 6, step 3).
 *
 * Kept in its own plain `.ts` file rather than inlined in SmartFolders.tsx —
 * a pure mapper is a unit-testable helper, and SmartFolders.tsx is a
 * "use client" component file (JSX, framer-motion, phosphor-icons) that
 * `node --test` cannot load directly. See smartFolderApiMapper.test.ts.
 */

import type { SmartFolder, LawRef } from "./SmartFolderTypes";
import { apiSlug } from "../../../utils/apiSlug.ts";

export interface ApiSmartFolderItemRow {
  id: string;
  entity_type?: string | null;
  entity_id: string;
  title?: string | null;
  title_en?: string | null;
  cat_id?: string | null;
}

export interface ApiSmartFolderRow {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  is_pinned?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
  smart_folder_items?: ApiSmartFolderItemRow[] | null;
}

/**
 * A folder's `laws` entries carry the underlying `smart_folder_items.id` so a
 * later removal (`DELETE /api/library/folders?itemId=`) can target the exact
 * row — `LawRef` itself has no such column (it also describes purely-local
 * guest folders, which have no DB row at all), so it rides as an optional
 * extra field rather than widening the shared type.
 */
export type SmartFolderLawItem = LawRef & { _itemDbId?: string };

/** Convert a DB folder row (from GET /api/library/folders) to the frontend SmartFolder shape. */
export function mapApiFolderToSmartFolder(apiFolder: ApiSmartFolderRow): SmartFolder {
  return {
    id: apiFolder.id,
    name: apiFolder.name,
    nameEn: apiFolder.name, // DB only stores one name; use it for both
    color: apiFolder.color || "#C8A762",
    icon: apiFolder.icon === "📁" ? "default" : ((apiFolder.icon as SmartFolder["icon"]) || "default"),
    isDefault: false,
    isPinned: apiFolder.is_pinned ?? false,
    laws: (apiFolder.smart_folder_items || []).map((item): SmartFolderLawItem => ({
      slug: item.entity_id,
      title: item.title || item.entity_id,
      titleEn: item.title_en || item.entity_id,
      catId: item.cat_id || "",
      type: (item.entity_type || "law") as LawRef["type"],
      // Preserve the DB item id for deletion.
      _itemDbId: item.id,
    })),
    lastModified: apiFolder.updated_at
      ? new Date(apiFolder.updated_at).getTime()
      : apiFolder.created_at
        ? new Date(apiFolder.created_at).getTime()
        : Date.now(),
  };
}

/** smart_folder_items.entity_type → the POST /api/library/folders/titles key. */
const TITLE_KIND: Record<string, "laws" | "orders" | "precedents" | "books"> = {
  law: "laws",
  order: "orders",
  precedent: "precedents",
  book: "books",
};

/** A saved item with no real title: the mapper fell back to its id (an old row, or a page saved before its title loaded). */
export function itemLacksTitle(item: { slug: string; title?: string | null }): boolean {
  const t = (item.title ?? "").trim();
  return !t || t === item.slug;
}

/**
 * The ids of every titleless item, per library table, for ONE call to
 * POST /api/library/folders/titles (≤ 100 per table — far under the ~396-id
 * `.in()` ceiling). null when every item already has its title.
 */
export function titleLookupForFolders(folders: readonly SmartFolder[], maxPerKind = 100): Record<"laws" | "orders" | "precedents" | "books", string[]> | null {
  const sets = { laws: new Set<string>(), orders: new Set<string>(), precedents: new Set<string>(), books: new Set<string>() };
  for (const f of folders) {
    for (const item of f.laws) {
      if (!itemLacksTitle(item)) continue;
      const kind = TITLE_KIND[item.type || "law"];
      if (kind) sets[kind].add(item.slug);
    }
  }
  const out = {
    laws: Array.from(sets.laws).slice(0, maxPerKind),
    orders: Array.from(sets.orders).slice(0, maxPerKind),
    precedents: Array.from(sets.precedents).slice(0, maxPerKind),
    books: Array.from(sets.books).slice(0, maxPerKind),
  };
  return out.laws.length + out.orders.length + out.precedents.length + out.books.length > 0 ? out : null;
}

/** Folders with titleless items named from `titles` (display only; the rows are not rewritten). */
export function applyResolvedTitles(
  folders: SmartFolder[],
  titles: Partial<Record<"laws" | "orders" | "precedents" | "books", Record<string, string>>>,
): SmartFolder[] {
  return folders.map(f => {
    let changed = false;
    const laws = f.laws.map(item => {
      if (!itemLacksTitle(item)) return item;
      const found = titles[TITLE_KIND[item.type || "law"]]?.[item.slug];
      if (!found) return item;
      changed = true;
      return { ...item, title: found, titleEn: item.titleEn && item.titleEn !== item.slug ? item.titleEn : found };
    });
    return changed ? { ...f, laws } : f;
  });
}

/**
 * Resolve the canonical reader route for a saved folder item.
 * Judicial collections saved from `/precedents/[slug]` store `type: "precedent"`
 * and must open `/precedents/<slug>` (not `/precedents/judgment/<slug>`).
 */
export function resolveSavedItemHref(item: { slug: string; type?: string | null }): string {
  // apiSlug decodes once and encodes once, so a stored id that is already
  // percent-encoded (precedent and book pages save the raw useParams() value)
  // and a plain Arabic id give the same single-encoded segment; a malformed
  // «%» is encoded rather than trusted.
  const safe = apiSlug(String(item.slug ?? ""));
  const t = item.type || "law";
  if (t === "book") return `/book/${safe}`;
  if (t === "order") return `/laws/orders/${safe}`;
  if (t === "precedent") return `/precedents/${safe}`;
  return `/laws/${safe}`;
}
