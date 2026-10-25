import { normalizeSearch } from "../../utils/normalizeArabic.ts";

/**
 * HTML for an autocomplete suggestion label with the search term wrapped in
 * <mark>. The laws page puts the result into dangerouslySetInnerHTML, so:
 *   - the term is regex-escaped character by character BEFORE any letter or
 *     digit class is substituted (so `.*`, `(`, `[`, `\` stay literal);
 *   - matching runs on the RAW text and every slice (matched and unmatched) is
 *     HTML-escaped on its own, so a match can never split an entity and no tag
 *     from the label or the query reaches the DOM;
 *   - letters people type interchangeably (ا/أ/إ/آ, ه/ة, ي/ى) and the three
 *     numeral scripts (0-9, ٠-٩, ۰-۹) match each other; harakat and tatweel in
 *     the text are skipped between letters.
 * Harakat / tatweel are dropped from the TERM before the pattern is built: the
 * pattern joins letters with `[harakat]*`, and a literal haraka between two of
 * those would make the regex ambiguous (catastrophic backtracking on a label
 * with a long run of marks).
 *
 * Moved out of src/app/laws/page.tsx (owner fix 2026-10-25) so it can be
 * tested; the page imports it under its old name.
 */
const HARAKAT_TATWEEL = /[ً-ْٰـ]/g;
const BETWEEN_LETTERS = "[ً-ْٰـ]*";
const DIGIT_CLASSES = [
  "[0٠۰]", "[1١۱]", "[2٢۲]", "[3٣۳]", "[4٤۴]",
  "[5٥۵]", "[6٦۶]", "[7٧۷]", "[8٨۸]", "[9٩۹]",
];
/** Longer terms are not highlighted (a suggestion label is short anyway). */
const MAX_TERM_CHARS = 120;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function highlightSearchHtml(text: string, term: string): string {
  const source = String(text ?? "");
  if (!term || term.length < 2) return escapeHtml(source);
  const nTerm = normalizeSearch(term).replace(HARAKAT_TATWEEL, "");
  if (!nTerm || nTerm.length > MAX_TERM_CHARS) return escapeHtml(source);
  const pattern = Array.from(nTerm)
    .map((ch) => {
      if (ch === "ا") return "[اأإآ]";
      if (ch === "ه") return "[هة]";
      if (ch === "ي") return "[يى]";
      if (ch >= "0" && ch <= "9") return DIGIT_CLASSES[Number(ch)];
      return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join(BETWEEN_LETTERS);
  const regex = new RegExp(pattern, "gi");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    if (m[0].length === 0) { regex.lastIndex += 1; continue; }
    if (m.index > last) out += escapeHtml(source.slice(last, m.index));
    out += `<mark class="bg-yellow-300/80 text-yellow-900 rounded px-0.5">${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  if (last < source.length) out += escapeHtml(source.slice(last));
  return out || escapeHtml(source);
}
