/**
 * The «معدّلة» marker the source writes after an article heading.
 *
 * Owner screenshot (2026-10-03, /laws/sharia-pleading-law-qadha-edition, the
 * «التشريعات الفرعية» view): a regulation article heading read
 * «المادة (5/3): [معدلة]» in plain text. The source line is
 *   > #### المادة (5/3): `[معدّلة]`
 * inside the regulation text; markdownBoldToSafeHtml drops the backticks and
 * the bracketed word was printed as part of the heading. The reader now strips
 * the token from the visible heading and shows an amber «معدّلة» badge.
 *
 * Only the marker is read — no amendment text is ever inferred from it. A
 * regulation article carries no amendment history in the API, so the badge is
 * a label, not a toggle.
 *
 * Pure, no imports: `node --test` loads it (_amended-marker.test.ts).
 */

/** Arabic diacritics that may sit on any letter of the word (shadda, harakat, tanween, dagger alef). */
const D = "[\\u064B-\\u0652\\u0670]*";
const WORD = `م${D}ع${D}د${D}ل${D}ة`;
/** `[معدّلة]` or `(معدلة)`, optionally inside backticks, with its leading spaces. */
const MARKER_RE = new RegExp(
  `\\s*\`?\\s*(?:\\[\\s*${WORD}\\s*\\]|\\(\\s*${WORD}\\s*\\))\\s*\`?`,
  "gu",
);

/** A line that starts with an article label — the only lines whose marker is read outside a heading. */
const LABEL_LINE_RE = /^\s*(?:\*\*|__)?\s*(?:ال)?مادة[\s(]/u;

/** How far into a label line the marker may sit (the label, not the article body). */
const LABEL_SPAN = 80;

export interface AmendedMarkerSplit {
  /** The text with the marker removed (unchanged when there is none). */
  text: string;
  /** True when the source marked the article as amended. */
  amended: boolean;
}

/** Strip every «[معدّلة]»/«(معدلة)» token from a heading. */
export function splitAmendedMarker(heading: string): AmendedMarkerSplit {
  MARKER_RE.lastIndex = 0;
  if (!MARKER_RE.test(heading)) return { text: heading, amended: false };
  MARKER_RE.lastIndex = 0;
  const text = heading
    .replace(MARKER_RE, " ")
    .replace(/[ \t]{2,}/g, " ")
    // `**المادة (1/7): **` → `**المادة (1/7):**` so the bold still closes cleanly.
    .replace(/\s+(\*\*|__)\s*$/u, "$1")
    .trim();
  return { text, amended: true };
}

/**
 * The same split for an ordinary line (paragraph / blockquote): only when the
 * line opens with an article label and the marker sits within that label —
 * a «(معدلة)» in the middle of statutory text is the text, not a marker.
 */
export function splitAmendedLabelLine(line: string): AmendedMarkerSplit {
  if (!LABEL_LINE_RE.test(line)) return { text: line, amended: false };
  MARKER_RE.lastIndex = 0;
  const match = MARKER_RE.exec(line);
  MARKER_RE.lastIndex = 0;
  if (!match || match.index > LABEL_SPAN) return { text: line, amended: false };
  const head = line.slice(0, match.index + match[0].length);
  const rest = line.slice(match.index + match[0].length);
  const split = splitAmendedMarker(head);
  if (!rest) return { text: split.text, amended: true };
  // A closing bold mark right after the marker re-attaches to the label.
  const glue = /^\s*(\*\*|__)/u.test(rest) ? "" : " ";
  return { text: `${split.text}${glue}${rest.trimStart()}`.trimEnd(), amended: true };
}
