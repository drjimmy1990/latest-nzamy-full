/**
 * Search colours inside the reader's markdown (owner note ٠٦, 2026-10-30).
 *
 * MD (_article-components.tsx) renders article text, executive-regulation
 * text and the preamble as HTML: markdownBoldToSafeHtml → sanitizeHtml, which
 * leaves only <strong> <em> <br> <a href> tags. <Hl> works on plain strings,
 * so this applies the same engine (multiColorSearch) to that sanitised HTML:
 *
 *   - the string is split into tags and text runs; only TEXT is matched, so a
 *     term can never land inside a tag or an href, and every tag passes
 *     through byte for byte;
 *   - an entity (&amp; …) is one unit: a match never cuts one in half;
 *   - each match becomes <mark data-hl-term="n" class="…palette…">. The only
 *     markup added is that fixed tag — nothing from the text or the query
 *     reaches an attribute;
 *   - a match does not cross a tag («عزل **الوكيل**» as one phrase is not
 *     coloured across the bold) — accepted: the reader stays sanitised;
 *   - `focus` (a legend chip) leaves the other terms uncoloured, like <Hl>.
 * No terms → the input is returned unchanged.
 *
 * Pure: `node --test` loads it (_highlight-html.test.ts).
 */

import { highlightMultiColorSegments, paletteFor, type HighlightTerm } from "../../../lib/search/multiColorSearch.ts";

/** A tag sanitizeHtml left in place (anything else starting with `<` is text). */
const TAG = /<\/?[A-Za-z][^>]*>/g;
const ENTITY = /&(?:#\d+|#x[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g;
/** Stands for one entity while matching; never matched by a term pattern. */
const SLOT = "￼";

function highlightTextRun(text: string, terms: readonly HighlightTerm[], focus: number | null): string {
  if (!text || text.includes(SLOT)) return text;
  const entities: string[] = [];
  const plain = text.replace(ENTITY, (e) => {
    entities.push(e);
    return SLOT;
  });
  const segments = highlightMultiColorSegments(plain, terms);
  if (segments.length === 1 && segments[0].term === null) return text;
  let next = 0;
  const restore = (s: string) => s.replace(/￼/g, () => entities[next++] ?? "");
  return segments
    .map((seg) => {
      const raw = restore(seg.text);
      if (seg.term === null || (focus !== null && focus !== seg.term)) return raw;
      return `<mark data-hl-term="${seg.term}" class="${paletteFor(terms[seg.term].color).mark} rounded px-0.5">${raw}</mark>`;
    })
    .join("");
}

/** Sanitised HTML with the search terms wrapped in coloured <mark>s. */
export function highlightSafeHtml(
  html: string,
  terms: readonly HighlightTerm[],
  focus: number | null = null,
): string {
  if (!html || terms.length === 0) return html;
  let out = "";
  let last = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html)) !== null) {
    out += highlightTextRun(html.slice(last, m.index), terms, focus);
    out += m[0];
    last = m.index + m[0].length;
  }
  out += highlightTextRun(html.slice(last), terms, focus);
  return out;
}

/** Does this text hold any coloured term? (opens a collapsed block that holds a match). */
export function textHasHighlight(text: string | null | undefined, terms: readonly HighlightTerm[]): boolean {
  if (!text || terms.length === 0) return false;
  return highlightMultiColorSegments(text, terms).some((s) => s.term !== null);
}
