/**
 * pageLocator — the one rule for "this unit is a PAGE, not an article".
 *
 * The library numbers some documents by page: their ARTICLE_START anchors carry
 * number_text «الصفحة 3», «صفحة ٤», «ص. 12» — or, in English sources,
 * «Page 3» (owner package 2026-11-06 item 11: 9,116 English anchors that the
 * Arabic-only rule missed, so a citation called them articles). The anchors
 * themselves stay exactly as the owner wrote them (stripping or rewriting them
 * is forbidden); only the reading of number_text changes.
 *
 * Shared by the law reader's citation (src/app/laws/[slug]/_citation.ts) and
 * anything that must know whether a document is page-numbered (item 13: the
 * reader shows «عدد الصفحات» instead of «عدد المواد» when every unit is a page).
 *
 * Pure, no imports: `node --test src/lib/library/pageLocator.test.ts`.
 */

/**
 * A locator that names a page: Arabic «الصفحة / صفحة / ص.» or English «Page»
 * (any case), then a digit (Latin, Arabic-Indic or Persian).
 *
 * NOTE for the reader: the owner's measuring tool (measure_all_defects.py, ع-1)
 * reads the literal `PAGE_LOCATOR_RE = /…/flags;` assignment out of
 * _citation.ts. Keep that file's constant a literal copy of this one (same
 * source, same `i` flag) — an import there would make his probe fall back to
 * the raw count.
 */
export const PAGE_LOCATOR_RE = /^\s*(?:الصفحة|صفحة|ص\.?|page)\s*[\d٠-٩۰-۹]/i;

/** True when the locator names a page rather than an article. */
export function isPageLocator(value: string | null | undefined): boolean {
  return PAGE_LOCATOR_RE.test(String(value ?? ""));
}

/**
 * True when a document is numbered by page: it has at least one unit and
 * EVERY unit's number_text is a page locator (owner item 13 / decision ١٠٢).
 * A document mixing pages and articles is not page-numbered — its articles
 * are real articles.
 */
export function isPageNumberedDocument(numberTexts: Iterable<string | null | undefined>): boolean {
  let any = false;
  for (const value of numberTexts) {
    if (!isPageLocator(value)) return false;
    any = true;
  }
  return any;
}
