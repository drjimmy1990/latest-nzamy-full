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

/**
 * Resolve the canonical reader route for a saved folder item.
 * Judicial collections saved from `/precedents/[slug]` store `type: "precedent"`
 * and must open `/precedents/<slug>` (not `/precedents/judgment/<slug>`).
 */
export function resolveSavedItemHref(item: { slug: string; type?: string | null }): string {
  const raw = String(item.slug ?? "");
  const safe = /%[0-9A-Fa-f]{2}/.test(raw) ? raw : encodeURIComponent(raw);
  const t = item.type || "law";
  if (t === "book") return `/book/${safe}`;
  if (t === "order") return `/laws/orders/${safe}`;
  if (t === "precedent") return `/precedents/${safe}`;
  return `/laws/${safe}`;
}
