/**
 * #13 (owner package 6-Nov, ع-6): a document whose every "article" is a page
 * anchor («الصفحة 3» / «Page 3») is counted in pages, not articles — the
 * sidebar says «عدد الصفحات», never «عدد مواد النظام». The anchors stay (the
 * owner forbids removing them: 97.6% carry unique text).
 *
 * The reader can tell from what it already has: each article's `numberText`.
 * Annexes and standalone-regulation rows are left out of the test, like the
 * route's article tally (lawArticleCounts). Both spellings count: the 10-03
 * export has 285 documents with «الصفحة N» only, 90 with «Page N» only, 1 with
 * both (the «Page N» sieve itself is #11, parser side).
 *
 * Pure, no imports: `node --test` loads it (_page-count.test.ts).
 */

const PAGE_ANCHOR = /^\s*(?:الصفحة|صفحة|ص\.?|page)\s*[\d٠-٩۰-۹]/i;

export function isPageAnchor(numberText: string | null | undefined): boolean {
  return PAGE_ANCHOR.test(String(numberText ?? ""));
}

/** True when every base-document article (not ملحق / لائحة) is a page anchor. */
export function isPageNumberedDocument(
  articles: ReadonlyArray<{ numberText?: string | null; instrument?: string | null }>,
): boolean {
  const base = articles.filter((a) => {
    const instrument = (a.instrument ?? "").trim();
    return instrument !== "ملحق" && instrument !== "لائحة";
  });
  return base.length > 0 && base.every((a) => isPageAnchor(a.numberText));
}
