/**
 * researchSessionRow.ts — a `public.research_sessions` row as the collector's
 * `CollectorSession`.
 *
 * LIVE-F18 (owner live test 2026-10-30, AI13): a session created as
 * «TEST-CODEX-P2» and then renamed showed «بلا اسم» after saving, on reload
 * and from another tab. The server saved the name — POST and PATCH both write
 * it to the `title` column — but GET /api/v1/research/sessions returns the raw
 * row (`title`, `created_at`, `status`), and the screen reads `name`,
 * `createdAt`, `isArchived`. Nothing mapped one to the other, so every server
 * session rendered nameless. This is that mapping, in one place.
 *
 * Pure — `node --test` loads it.
 */

export interface CollectorSessionDto {
  id: string;
  name: string;
  createdAt: string;
  isArchived: boolean;
  archivedAt?: string;
  /** Items in the session, when the read embedded `research_items(count)`. */
  itemCount?: number;
}

/** The POST route's placeholder for "no name given" — shown as no name. */
const PLACEHOLDER_TITLES = new Set(["Untitled Session"]);

export function toCollectorSession(row: Record<string, unknown>): CollectorSessionDto {
  const rawName =
    typeof row.name === "string" ? row.name
    : typeof row.title === "string" ? row.title
    : "";
  const name = PLACEHOLDER_TITLES.has(rawName.trim()) ? "" : rawName;
  const createdAt =
    typeof row.createdAt === "string" ? row.createdAt
    : typeof row.created_at === "string" ? row.created_at
    : "";
  const isArchived =
    typeof row.isArchived === "boolean" ? row.isArchived
    : row.status === "archived";
  const archivedAt =
    typeof row.archivedAt === "string" ? row.archivedAt
    : isArchived && typeof row.updated_at === "string" ? row.updated_at
    : undefined;
  const embedded = Array.isArray(row.research_items) ? (row.research_items[0] as { count?: unknown } | undefined) : undefined;
  const itemCount = typeof embedded?.count === "number" ? embedded.count : undefined;
  return {
    id: String(row.id ?? ""),
    name,
    createdAt,
    isArchived,
    ...(archivedAt ? { archivedAt } : {}),
    ...(itemCount !== undefined ? { itemCount } : {}),
  };
}
