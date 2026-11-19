/**
 * «الإصدارات السابقة» — which previous-version cards the reader shows.
 *
 * Owner package 10-06 (gap analysis §4): an amended article's history listed
 * cards with an empty body — an amendment row with no summary and no text
 * still drew a frame, and for a non-subscriber (amending instrument and date
 * withheld, T28-22) the card held only the lock line.
 *
 * Owner file 16 §4 (19 Nov 2026, screenshot 04), on top of that:
 *   • the «📜 الإصدارات السابقة» heading inside each card is gone: a source (or
 *     summary, or first text line) that is only that heading is no field;
 *   • the text no longer starts with the source's quote mark «>» or wrapping
 *     quotation marks;
 *   • the date is not printed twice: when the instrument already names it
 *     («… وتاريخ 1443/11/09هـ»), `date` is left out;
 *   • no empty card: an instrument with no text left says so (`textMissing`,
 *     the reader prints «نص ما قبل التعديل غير متوفر») — never a blank frame.
 *     Which text belongs to which instrument is the corpus's to say (the
 *     parser pairs them, batch l9-parser); the reader never guesses a pairing;
 *   • newest first: dated cards by their Hijri date, newest to oldest; cards
 *     with no date keep their order after them;
 *   • the count is the number of cards.
 *
 * Fields are trimmed; a whitespace-only field is empty.
 *
 * Pure, no imports: `node --test` loads it (_previous-versions.test.ts).
 */

export interface AmendmentLike {
  date?: string | null;
  source?: string | null;
  sourceLocked?: boolean;
  summary?: string | null;
  fullText?: string | null;
}

export interface PreviousVersionCard {
  /** The amending instrument; '' when unknown or withheld. */
  source: string;
  /** Its date; '' when unknown, withheld, or already part of `source`. */
  date: string;
  summary: string;
  fullText: string;
  /** The instrument and date exist but are withheld from this viewer. */
  sourceLocked: boolean;
  /** An instrument whose previous text the corpus does not hold: «نص غير متوفر». */
  textMissing: boolean;
}

/** The heading the corpus repeats inside every history block. */
const HISTORY_HEADING_RE = /^[\s📜>*#_"«»“”]*(?:الإصدارات|النسخ|الصيغ)\s+السابقة[\s:：*_"«»“”]*$/u;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A field that is only the repeated «📜 الإصدارات السابقة» heading is empty. */
function withoutHeading(value: string): string {
  return HISTORY_HEADING_RE.test(value) ? "" : value;
}

/**
 * A version text as the reader shows it: no «📜 الإصدارات السابقة» heading
 * line, no blockquote mark «>» at the start of a line, no quotation marks
 * wrapping the whole text.
 */
export function cleanVersionText(value: unknown): string {
  const lines = clean(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:>\s?)+/, ""))
    .filter((l) => !HISTORY_HEADING_RE.test(l));
  let s = lines.join("\n").trim();
  for (const [open, close] of [['"', '"'], ["«", "»"], ["“", "”"]] as const) {
    if (s.length > 1 && s.startsWith(open) && s.endsWith(close)) {
      const inner = s.slice(open.length, s.length - close.length);
      // Only a pair that wraps the whole text (no other mark of the same kind inside).
      if (!inner.includes(open) && !inner.includes(close)) s = inner.trim();
    }
  }
  return s;
}

/** «1443/11/09هـ» → 14431109 (Latin digits), 0 when there is no Hijri date. */
export function hijriDateKey(value: string): number {
  const t = value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const m = /(1[2-5]\d{2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})/.exec(t);
  return m ? Number(`${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`) : 0;
}

/** The cards worth showing, newest first. Never throws. */
export function visibleAmendments(list: ReadonlyArray<AmendmentLike> | null | undefined): PreviousVersionCard[] {
  if (!Array.isArray(list)) return [];
  const cards: Array<PreviousVersionCard & { key: number; at: number }> = [];
  list.forEach((entry, at) => {
    if (!entry || typeof entry !== "object") return;
    const sourceLocked = entry.sourceLocked === true;
    const source = sourceLocked ? "" : withoutHeading(clean(entry.source));
    let date = sourceLocked ? "" : clean(entry.date);
    const key = hijriDateKey(date) || hijriDateKey(source);
    // The instrument already names its date: print it once.
    if (date && source && (source.includes(date) || (hijriDateKey(date) !== 0 && hijriDateKey(date) === hijriDateKey(source)))) date = "";
    const summary = withoutHeading(cleanVersionText(entry.summary));
    const fullText = cleanVersionText(entry.fullText);
    const hasBody = summary !== "" || fullText !== "";
    const hasInstrument = source !== "" || date !== "";
    if (!hasBody && !hasInstrument) return;
    cards.push({ source, date, summary, fullText, sourceLocked, textMissing: !hasBody, key, at });
  });
  // Newest first by date; undated cards after the dated ones, in their own order.
  cards.sort((a, b) => (a.key && b.key ? b.key - a.key || a.at - b.at : a.key ? -1 : b.key ? 1 : a.at - b.at));
  return cards.map((c) => ({ source: c.source, date: c.date, summary: c.summary, fullText: c.fullText, sourceLocked: c.sourceLocked, textMissing: c.textMissing }));
}
