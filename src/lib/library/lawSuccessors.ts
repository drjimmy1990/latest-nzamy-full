/**
 * The law that replaced a repealed one, for the /laws catalogue card (owner
 * package 2026-11-02 §2.4-1: a successor link next to «ملغى»).
 *
 * The link lives on the NEWER law: library.laws.supersedes_law_slug names the
 * slug it replaced (migration 20260911, a free field with no foreign key; on
 * the anon allow-list of 20261004_01). /api/library/laws/[slug] already reads
 * it the same way for the reader sidebar (`replacedBy`) — the first newer law
 * by slug, never the law itself — and so does this module.
 *
 * Pure, no imports: `node --test src/lib/library/lawSuccessors.test.ts`.
 */

export interface LawSuccessor {
  slug: string;
  title: string;
}

/**
 * Runaway guard for /api/library/init's one read of the laws that name a
 * predecessor (`supersedes_law_slug is not null`). The column is mostly
 * empty; the whole table is about 5.9k laws.
 */
export const SUCCESSOR_READ_MAX_ROWS = 10_000;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * replaced slug → its successor, from rows of {slug, title,
 * supersedes_law_slug}. A row naming itself, or with no slug, is skipped;
 * two newer laws naming the same old one resolve to the smaller slug (the
 * law page's `.order('slug').limit(1)`).
 */
export function successorsBySupersededSlug(rows: readonly unknown[] | null | undefined): Map<string, LawSuccessor> {
  const out = new Map<string, LawSuccessor>();
  for (const raw of rows ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const slug = str(row.slug);
    const replaced = str(row.supersedes_law_slug);
    if (!slug || !replaced || slug === replaced) continue;
    const prev = out.get(replaced);
    if (prev && prev.slug <= slug) continue;
    out.set(replaced, { slug, title: str(row.title) });
  }
  return out;
}

/**
 * The successor rows in one request when they fit: `first` is the query with
 * { count: "exact" } and .range(0, 999), and it is enough once the count is
 * covered by the rows it returned. selectAllPages stops on an EMPTY window on
 * purpose, so without this the few rows always cost two requests. A larger or
 * unknown count falls back to `rest`, the full walk. An error from `first` is
 * returned as it is.
 */
export async function readSuccessorRows<T>(
  first: () => PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>,
  rest: () => PromiseLike<{ data: T[]; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const { data, error, count } = await first();
  if (error) return { data: [], error };
  const rows = data ?? [];
  if (count !== null && count <= rows.length) return { data: rows, error: null };
  return rest();
}
