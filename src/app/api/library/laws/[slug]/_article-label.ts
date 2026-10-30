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

/**
 * Item ordinals «أولاً … عاشراً», in every spelling the corpus uses: tanween
 * after the alef («ثالثاً»), tanween before it («ثالثًا» — 6 labels of نظام
 * الغرف التجارية fell back to «المادة N» on this one), bare alef («ثالثا»),
 * and the doubled-alef slip «سادساا» (measured in the owner corpus,
 * 2026-10-04). The bare stem «ثالث» alone is NOT the adverbial ordinal; it
 * only counts in a compound «ثالث عشر» (13th).
 */
const ORDINAL_STEMS = "(?:[أا]ول|ثاني|ثالث|رابع|خامس|سادس|سابع|ثامن|تاسع|عاشر)";
const ORDINAL = `(?:${ORDINAL_STEMS}(?:اً|ًا|اا|ا)|(?:حادي|${ORDINAL_STEMS})\\s+عشر(?:اً|ًا|ا)?)`;

/**
 * Words that mark a string as an article/item locator rather than a title.
 * The word must end at a space, the end, «(», «:», or a dash/tatweel/period —
 * «ثالثًا- الأمانة العامة…» puts a dash straight after the ordinal.
 * (Do not add «تعديل» or «الدليل»: they open titles, not locators.)
 */
const LOCATOR = new RegExp(
  `(^|\\s)(المادة|مادة|البند|بند|الفقرة|فقرة|${ORDINAL})(\\s|$|\\(|:|-|–|—|ـ|\\.)|^[\\s(]*[0-9٠-٩]+`,
  "u",
);

/** An item ordinal opening the text, ending at the same separators LOCATOR accepts. */
const LEADING_ORDINAL = new RegExp(`^\\s*(${ORDINAL})(?=\\s|$|\\(|:|-|–|—|ـ|\\.)`, "u");

/**
 * The item ordinal a text opens with («ثالثًا- الأمانة العامة…» → «ثالثًا»),
 * exactly as written, or null. Used by the reader's citation builder to cite a
 * long ordinal-led heading by its ordinal, as a bare «ثالثاً» always was.
 */
export function leadingOrdinal(text: string | null | undefined): string | null {
  const m = LEADING_ORDINAL.exec(String(text ?? ""));
  return m ? m[1] : null;
}

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

/**
 * Owner note ١١ item ٤ (2026-10-26): a document that is NOT divided into
 * numbered articles in its official source (a guide or instrument split by
 * topical headings — `source_number: null` in the owner's export) must never
 * show an invented «المادة N». `articles.number` there is only a technical
 * order. The database has no `source_number` column, so the document-level
 * signal is: not one of its rows names an article or item in `number_text`
 * («المادة», «البند», «الفقرة», an ordinal, a leading number —
 * documentIsUnnumbered). The law route computes it once per document and
 * passes `{ unnumbered: true }`.
 */
export function documentIsUnnumbered(
  rows: ReadonlyArray<{ number_text?: unknown }>,
): boolean {
  if (rows.length === 0) return false;
  // A real locator names an article / item («المادة», «البند», an ordinal, a
  // number) — not merely short text, which articleLocatorText also keeps.
  return rows.every((r) => !LOCATOR.test(cleanNumberText(typeof r.number_text === "string" ? r.number_text : null)));
}

export interface ArticleLabelOptions {
  /**
   * The document has no numbered articles in its source (documentIsUnnumbered,
   * or a future `source_number IS NULL`). Then a topical heading is shown as
   * written, and an instrument name repeated in place of a number — the case
   * the «المادة N» fallback exists for (thirty identical lines in the contents)
   * — shows the bare position «(N)», never the word «المادة».
   */
  unnumbered?: boolean;
}

export function articleDisplayLabel(
  numberText: string | null | undefined,
  number: number | string | null | undefined,
  options: ArticleLabelOptions = {},
): string {
  const locator = articleLocatorText(numberText, number);
  if (locator !== null) return locator;
  if (options.unnumbered) {
    const cleaned = cleanNumberText(numberText);
    const n = typeof number === "string" && number.trim() === "" ? NaN : Number(number);
    const positive = Number.isFinite(n) && n > 0;
    if (cleaned && !INSTRUMENT_NAME.test(cleaned)) return cleaned;
    return positive ? `(${n})` : cleaned;
  }
  // `articles.number` is 0 for many rows whose locator is spelled out
  // («المادة الأولى:» — measured 2026-09-28 on executive-regulations-health-
  // profession), so only a positive number is trusted for the fallback.
  // A blank or "0" number (string or number) is "no number": never «المادة 0».
  const n = typeof number === "string" && number.trim() === "" ? NaN : Number(number);
  const hasNumber = Number.isFinite(n) && n > 0;
  // A title in place of a locator: use the number when we have one, else
  // whatever text the source holds (number_text — never «المادة 0»).
  return hasNumber ? `المادة ${n}` : cleanNumberText(numberText);
}
