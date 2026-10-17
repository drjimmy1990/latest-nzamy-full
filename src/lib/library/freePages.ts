/**
 * The free preview of a fiqh book and of a decree or circular (owner answer
 * ١٨٣, 2026-10-16): «تقتصر المعاينة المجانية على الميتاداتا وأول صفحتين فقط».
 * Past the first two pages a guest or free reader gets each block's or page's
 * place (volume, page, topic) and no text — the routes read the text with the
 * service role (migration 20261018_02) and never send a locked one.
 *
 * A decree's pages are rows (decree_pages), so its first two pages are its
 * first two rows. A fiqh book's rows are blocks, and a printed page can hold
 * several (blocks 0–2 of a book can sit on pages 2, 3, 3), so the books route
 * reads the book's leading blocks and locks from the first one on a third
 * printed page; a block with no printed page counts as a page of its own.
 *
 * -1 (Pro+, or a whitelisted / free-marked item) stays unlimited, and an admin
 * per-item override still wins — counted in rows (blocks / pages), as before.
 *
 * Relative imports only: `node --test` loads this file (freePages.test.ts).
 */

export const FREE_PAGES = 2;

/** How many leading blocks the books route reads to find where the free pages end. */
export const FREE_PAGES_SCAN = 40;

export interface BlockPlace {
  order_index: number;
  page_number: number | null;
}

/**
 * The order_index from which a book's blocks are locked, given its leading
 * blocks in reading order (at most `scanned` of them). Infinity when those
 * blocks are the whole book and it never reaches a third page; when the scan
 * was full and still on the free pages, everything past the scan is locked.
 */
export function feqhLockFrom(rows: readonly BlockPlace[], scanned: number = FREE_PAGES_SCAN, pages: number = FREE_PAGES): number {
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const page = rows[i].page_number;
    const key = typeof page === "number" && Number.isFinite(page) ? `p${page}` : `b${i}`;
    if (seen.has(key)) continue;
    if (seen.size >= pages) return rows[i].order_index;
    seen.add(key);
  }
  if (rows.length < scanned) return Number.POSITIVE_INFINITY;
  return rows[rows.length - 1].order_index + 1;
}

/** How many of a decree's pages (in order) a reader gets in full; -1 = all. */
export function freeDecreePages(
  access: { freeLimit: number; freeLimitSource?: "override" | "default"; isWhitelisted?: boolean },
  total: number,
): number {
  if (access.freeLimit === -1 || access.isWhitelisted) return -1;
  if (access.freeLimitSource === "override") return Math.max(0, access.freeLimit);
  return Math.min(FREE_PAGES, Math.max(0, total));
}
