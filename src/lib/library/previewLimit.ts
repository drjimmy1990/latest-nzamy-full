/**
 * The free preview of a library document (owner answer ١٨٤, 2026-10-16):
 * «ما يمثل ٥٪ من إجمالي أي مستند أو ٥ مواد أيهما أقل، وفي جميع الأحوال يلزم
 * وجود ٣ مواد على الأقل» —
 *   Math.min(total, Math.max(3, Math.min(5, Math.floor(0.05 * total))))
 * A large law shows 5 articles, a middling or small one 3, and a document with
 * fewer than 3 shows what it has.
 *
 * `cap` is the platform's free-article limit (platform_settings
 * library_free_article_limit, 5 by default), so the admin setting stays the
 * upper bound. A per-document admin override wins over the formula, and -1
 * (Pro+, or a whitelisted document) stays unlimited.
 *
 * Relative imports only: `node --test` loads this file (previewLimit.test.ts).
 */

export const PREVIEW_FLOOR = 3;
export const PREVIEW_DEFAULT_CAP = 5;

export function previewLimit(total: number, cap: number = PREVIEW_DEFAULT_CAP): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeCap = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : PREVIEW_DEFAULT_CAP;
  return Math.min(total, Math.max(PREVIEW_FLOOR, Math.min(safeCap, Math.floor(0.05 * total))));
}

/** The limit a route applies, given checkLibraryAccess()'s answer and the document's size. */
export function effectiveFreeLimit(
  access: { freeLimit: number; freeLimitSource?: "override" | "default" },
  total: number,
): number {
  if (access.freeLimit === -1) return -1;
  if (access.freeLimitSource === "override") return access.freeLimit;
  return previewLimit(total, access.freeLimit);
}
