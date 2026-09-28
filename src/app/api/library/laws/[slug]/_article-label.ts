/**
 * The label shown for an article in the reader's contents list and card
 * header (`num` in the law-detail response).
 *
 * Owner test 2026-09-28 (T28-06 / T28-10). `library.articles.number_text`
 * holds, for part of the corpus:
 *   - markdown heading marks left by the extractor: «### المادة (1):»;
 *   - the NAME of the instrument instead of a number, e.g. every regulation
 *     row of labor-law-qadha reads «اللائحة التنفيذية لنظام العمل» or
 *     «لائحة عمال الخدمة المنزلية ومن في حكمهم:», so the contents list showed
 *     the same line thirty times.
 * The label keeps the source text when it is an article locator, strips the
 * heading marks and trailing colon, and falls back to «المادة N» when the
 * stored text is a title rather than a locator.
 *
 * Pure, no imports: `node --test` loads it (_article-label.test.ts).
 */

/** Words that mark a string as an article/item locator rather than a title. */
const LOCATOR = /(^|\s)(المادة|مادة|البند|بند|الفقرة|فقرة|أولاً|أولا|ثانياً|ثانيا|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)(\s|$|\(|:)|^[\s(]*[0-9٠-٩]+/;

/** Words that mark a string as the name of an instrument, not a locator. */
const INSTRUMENT_NAME = /^(اللائحة|لائحة|نظام|النظام|قواعد|القواعد|تنظيم|التنظيم|قرار|القرار|مرسوم|المرسوم)(\s|$)/;

export function cleanNumberText(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/^\s*#{1,6}\s*/, "")   // markdown heading marks
    .replace(/[\s:：]+$/, "")        // trailing colon / spaces
    .trim();
}

/** True when cleaned `number_text` is a title or a sentence rather than a locator. */
function isTitleNotLocator(cleaned: string): boolean {
  // The name of an instrument stored in place of the number.
  if (INSTRUMENT_NAME.test(cleaned) && !LOCATOR.test(cleaned)) return true;
  // Very long text is a heading or a sentence, not a locator.
  if (cleaned.length > 60 && !LOCATOR.test(cleaned.slice(0, 20))) return true;
  return false;
}

/**
 * The source's own locator for an article (`numberText` in the law-detail
 * response), or null when the stored text is not one: empty, the name of an
 * instrument, or a long heading. The client's citation builder prefers this
 * over the display label, so a title must never reach it as a locator
 * («المادة (اللائحة التنفيذية لنظام العمل)»); on null it falls back to `num`.
 *
 * `number` is accepted for call-site symmetry with articleDisplayLabel and is
 * deliberately unused: a locator is only ever taken from what the source
 * wrote, never synthesised from the number.
 */
export function articleLocatorText(
  numberText: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- see the doc comment
  _number?: number | string | null,
): string | null {
  const cleaned = cleanNumberText(numberText);
  if (!cleaned || isTitleNotLocator(cleaned)) return null;
  return cleaned;
}

export function articleDisplayLabel(
  numberText: string | null | undefined,
  number: number | string | null | undefined,
): string {
  const locator = articleLocatorText(numberText, number);
  if (locator !== null) return locator;
  // `articles.number` is 0 for many rows whose locator is spelled out
  // («المادة الأولى:» — measured 2026-09-28 on executive-regulations-health-
  // profession), so only a positive number is trusted for the fallback.
  const n = Number(number);
  const hasNumber = Number.isFinite(n) && n > 0;
  // A title in place of a locator: use the number when we have one, else
  // whatever text the source holds (still better than «المادة 0»).
  return hasNumber ? `المادة ${n}` : cleanNumberText(numberText);
}
