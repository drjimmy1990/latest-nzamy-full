/**
 * _blankFields.ts — rule R3 of the Najiz memo cleanup (owner ٤١٦, rule v5.2).
 *
 * The rule used to delete every line with an unfilled placeholder («الاسم:
 * ..........»), so a missing ID number or date vanished from the memo without
 * a trace. Now the placeholder stays where it was, replaced by «[يحتاج تحقق]»,
 * so the lawyer sees what he still has to fill in before filing.
 *
 *   - a run of 5+ dots, underscores or dashes inside a line with words
 *     → «[يحتاج تحقق]» (one marker per run, the words around it kept);
 *   - a label ending in a colon followed only by 5+ spaces → «الاسم: [يحتاج تحقق]»;
 *   - a line that is ONLY such a run (a separator or ruler, no words) is
 *     decoration, not a field, and is dropped as before;
 *   - «...» (up to four dots) is an ellipsis and is left alone, and so are
 *     spaces anywhere else (indentation, justified text).
 *
 * Free and rule-based: no model is called (only the AI condense costs points).
 * Pure: `node --test` runs it.
 */

export const NAJIZ_NEEDS_CHECK = "[يحتاج تحقق]";

const FILLER = String.raw`(?:\.{5,}|_{5,}|-{5,})`;
const HAS_FILLER = new RegExp(FILLER);
const FILLER_RUN = new RegExp(String.raw`[ \t]*${FILLER}[ \t]*`, "g");
const ONLY_FILLER = /^[\s.\-_*•:]*$/;
const COLON_THEN_SPACES = /:[ \t]{5,}$/;

export interface BlankFieldsResult {
  text: string;
  /** Placeholders marked «[يحتاج تحقق]». */
  marked: number;
}

function markLine(line: string): { line: string | null; marked: number } {
  if (HAS_FILLER.test(line) && ONLY_FILLER.test(line)) return { line: null, marked: 0 };
  let marked = 0;
  const lead = /^[ \t]*/.exec(line)![0];
  let out = line.replace(FILLER_RUN, () => {
    marked++;
    return ` ${NAJIZ_NEEDS_CHECK} `;
  });
  if (COLON_THEN_SPACES.test(out)) {
    marked++;
    out = out.replace(COLON_THEN_SPACES, `: ${NAJIZ_NEEDS_CHECK}`);
  }
  if (marked > 0) out = lead + out.trim();
  return { line: out, marked };
}

/** R3 over the whole memo; keeps each line's own ending (\n or \r\n). */
export function markBlankFields(input: string): BlankFieldsResult {
  let marked = 0;
  const lines: string[] = [];
  for (const raw of input.split("\n")) {
    const cr = raw.endsWith("\r") ? "\r" : "";
    const r = markLine(cr ? raw.slice(0, -1) : raw);
    marked += r.marked;
    if (r.line !== null) lines.push(r.line + cr);
  }
  return { text: lines.join("\n"), marked };
}
