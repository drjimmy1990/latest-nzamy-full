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

/** A `.in()` filter carries this many slugs at most (the URL stays short). */
export const SUCCESSOR_LOOKUP_CHUNK = 20;

/** `items` in runs of `size` (the last one shorter). */
export function chunked<T>(items: readonly T[], size: number = SUCCESSOR_LOOKUP_CHUNK): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

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
