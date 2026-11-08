/**
 * How a text's pages are counted (owner ٤٣٩, answer of 8 Nov 2026): 3000
 * characters a page, counted AFTER the Arabic tashkeel (U+064B–U+065F and the
 * dagger alif U+0670) and the tatweel (U+0640) are dropped and every run of
 * whitespace is one space. Only the count: the text the model reads is the
 * original, marks and spacing included.
 *
 * One pure module with no imports, so the server (textExtract.ts textPages →
 * aiFiles.ts, runCore.ts paste pages, tools.ts paste caps) and the browser
 * (components/ai/aiReadable.ts pasteState) count the same way.
 */

/** The pinned page rule: it feeds case-brief's page price, the per-page charges and every page cap. */
export const TEXT_CHARS_PER_PAGE = 3000;

const NOT_COUNTED = /[\u064B-\u065F\u0670\u0640]/g;

/** The text as it is counted: no tashkeel, no tatweel, one space for each run of whitespace, trimmed. */
export function countableText(text: string): string {
  return text.replace(NOT_COUNTED, "").replace(/\s+/g, " ").trim();
}

/** The counted characters (code units of countableText). */
export function countableChars(text: string): number {
  return countableText(text).length;
}

/** Pages at 3000 counted characters each; any text is at least one page. */
export function textPages(text: string): number {
  return Math.max(1, Math.ceil(countableChars(text) / TEXT_CHARS_PER_PAGE));
}

/**
 * The raw ceiling over a counted limit: a text is also refused past twice its
 * limit in raw characters, so marks and runs of spaces can make a text heavier
 * but never unbounded. Twice covers fully vocalised Arabic (about one mark a
 * letter) with room to spare; textExtract.TEXT_FILE_MAX_CHARS is the same
 * factor over 30 pages, so whatever passes here is served whole.
 */
export const RAW_CEILING_FACTOR = 2;

/**
 * A paste box measured as the server measures it: `chars` is the counted
 * length; short and long go by the counted length, and long also by the raw
 * ceiling. One function for tools.ts pastedText and aiReadable.pasteState.
 */
export function measurePaste(text: string, rules: { min: number; max: number }) {
  const raw = text.trim();
  const chars = countableChars(raw);
  const empty = chars === 0;
  const tooShort = !empty && chars < rules.min;
  const tooLong = chars > rules.max || raw.length > rules.max * RAW_CEILING_FACTOR;
  return { chars, empty, tooShort, tooLong };
}
