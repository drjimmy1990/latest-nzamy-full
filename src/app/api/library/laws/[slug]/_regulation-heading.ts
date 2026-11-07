/**
 * Owner 2026-11-07 (screenshot ٣): an article that carries regulation rows
 * often ends its stored `text` with the line that introduces the regulation —
 * «من اللائحة التنفيذية لنظام المرور (القرار الوزاري رقم ۲۲٤۹ وتاريخ ١٤٤١/٣/١٠هـ):»
 * — because the parser cuts at the `<!-- REGULATION` anchor, after that line.
 * The reader then drew «الإصدارات السابقة» under it, and the article's own
 * previous versions read as the regulation's.
 *
 * liftRegulationHeading takes that line off the article text so the reader
 * can show it as the subtitle of its own «اللائحة التنفيذية» section.
 *
 * Pure, no imports: `node --test` loads it (_regulation-heading.test.ts).
 */

/** Tashkeel, superscript alef, tatweel — folded away before a test. */
const MARKS = /[ً-ٰٟـ]/g;

/** The introducing line, as the owner's brief gives it. */
export const REGULATION_HEADING_LINE = /^[>*\s]*من\s+(?:اللائحة|لائحة|القواعد|الضوابط)[^\n]{0,250}:\s*\**\s*$/;

/** «(القرار الوزاري رقم … وتاريخ …)» — the instrument's number and date. */
const INSTRUMENT_PARENTHETICAL = /\s*\([^()]*(?:رقم|وتاريخ|بتاريخ)[^()]*\)/g;
const ANY_DIGIT = /[0-9٠-٩۰-۹]/;

export interface LiftedRegulationHeading {
  /** The article text without the introducing line (unchanged when none). */
  text: string;
  /** The display form of the line for this viewer; null when none or nothing safe to show. */
  heading: string | null;
}

/**
 * The display form of an introducing line: markdown marks, the leading «من»
 * and the closing colon removed — «اللائحة التنفيذية لنظام المرور (…)».
 * For a viewer who must not see official metadata (T28-22: the same viewers
 * whose decree numbers and dates are withheld) the «(… رقم … وتاريخ …)» part
 * goes; if a number is still left after that, nothing is shown (null).
 */
export function regulationHeadingForViewer(line: string, hideOfficialMeta: boolean): string | null {
  let heading = String(line ?? "")
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .replace(/^[>*\s]+/, "")
    .replace(/[\s*:]+$/, "")
    .replace(/^م[ً-ٰ]*ن[ً-ٰ]*\s+/, "")
    .trim();
  if (hideOfficialMeta) {
    heading = heading.replace(INSTRUMENT_PARENTHETICAL, "").replace(/[ \t]{2,}/g, " ").trim();
    if (ANY_DIGIT.test(heading)) return null;
  }
  return heading || null;
}

/**
 * When the LAST non-empty line of `text` introduces a regulation, the text
 * without it and the line's display form. Call it only for an article that
 * has regulation rows. A text that is nothing but that line is left alone.
 */
export function liftRegulationHeading(text: unknown, hideOfficialMeta: boolean): LiftedRegulationHeading {
  const src = typeof text === "string" ? text : "";
  const lines = src.split("\n");
  let last = lines.length - 1;
  while (last >= 0 && lines[last].trim() === "") last--;
  if (last < 0) return { text: src, heading: null };
  const line = lines[last].replace(/\r$/, "");
  if (!REGULATION_HEADING_LINE.test(line.replace(MARKS, ""))) return { text: src, heading: null };
  const body = lines.slice(0, last).join("\n").replace(/\s+$/, "");
  if (!body.trim()) return { text: src, heading: null };
  return { text: body, heading: regulationHeadingForViewer(line, hideOfficialMeta) };
}
