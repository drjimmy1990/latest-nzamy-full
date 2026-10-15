/**
 * Principle text as the collection reader shows it (owner package 10-06, gap
 * analysis §4: «Precedents show raw `**`. Facts, reasons and ruling run as one
 * wall of text»).
 *
 * The principle rows carry the source's Markdown — bold marks, «###» headings,
 * separator lines, page-break comments — and the fact / reasons / ruling
 * fields are PDF text hard-wrapped mid-sentence («…عدم قبول تظلمه شكلاً،\n
 * لكونه…»). The reader printed the marks verbatim and, outside
 * `whitespace-pre-line`, ran every line of a ruling into one block.
 *
 * Two pure steps, no wording changed:
 *   1. cleanPrincipleText — the marks go (stripMarkdownMarks, per paragraph
 *      block so blank-line breaks survive), plus page-break comments and
 *      blockquote marks;
 *   2. principleParagraphs — paragraphs from the source's own breaks: a blank
 *      line, a Markdown heading, a line ending a sentence or a label («.»,
 *      «:», «؟», «!», «؛»), a short «…:» label line, a line-only bullet, a
 *      numbered item, or a short heading line. Other line
 *      breaks are wraps and become spaces. A paragraph still longer than
 *      LONG_PARAGRAPH is cut at sentence ends («. » / «؟ » before a word) into
 *      pieces of about TARGET_PARAGRAPH characters.
 *
 * Joining the paragraphs back with spaces gives the cleaned text's words in
 * the same order (only line-only bullets drop): _principle-text.test.ts.
 */
import { stripMarkdownMarks } from "../../../lib/text/stripMarkdownMarks.ts";

/** A paragraph longer than this is cut at sentence ends. */
export const LONG_PARAGRAPH = 600;
/** Roughly how long each cut piece is. */
export const TARGET_PARAGRAPH = 300;
/** A cut never leaves a tail shorter than this. */
const MIN_TAIL = 120;

/** «<!-- PAGE_END -->» and the garbled «<-- PAGE_END --!>» the corpus carries. */
const PAGE_COMMENT = /<!?-{2,}\s*PAGE_(?:END|START|BREAK)[^>]*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Display text: no Markdown marks; blank-line paragraph breaks kept as «\n\n». */
export function cleanPrincipleText(text: string | null | undefined): string {
  if (typeof text !== "string" || text.trim() === "") return "";
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(PAGE_COMMENT, "")
    .replace(HTML_COMMENT, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    // A Markdown heading line is a paragraph of its own («### المبدأ رقم 7»).
    .replace(/^([ \t]*#{1,6}[ \t]*\S[^\n]*)$/gm, "\n$1\n");
  return normalized
    .split(/\n[ \t]*\n/)
    .map((block) => stripMarkdownMarks(block))
    .filter((block) => block !== "")
    .join("\n\n");
}

/** A line that ends a sentence or a label: the next line starts a new paragraph. */
const ENDS_PARAGRAPH = /[.:؟!?؛…][)\]»"”']?$/;
/** A bullet alone on its line («-\nالفقرة 4 من المادة 86»): the next line is an item. */
const BULLET_ONLY = /^[-–—•*+]$/;
/** A numbered or lettered item: «1- », «١) », «(2) », «أ- », «ب) ». */
const ITEM_START = /^(?:\(?[0-9٠-٩]{1,3}\s*[-.)]\s|\([0-9٠-٩]{1,3}\)\s|[ء-ي]\s*[-)]\s)/;
/**
 * A section label alone on its line («الوقائع:», «الأسانيد النظامية:»): it
 * starts a paragraph even when the line before has no closing mark. Known
 * labels only — a wrapped tail such as «بأنه:» is not a label.
 */
const LABEL_LINE = /^(?:ال)?(?:وقائع|موضوعات|أسانيد(?: النظامية)?|أسباب|تسبيب|منطوق(?: الحكم)?|حيثيات(?: والقرار)?|قرار|حكم|نص الحكم|مستند الحكم)\s*:$/;
/** Arabic-Indic and Western digits. */
const DIGIT = /[0-9٠-٩]/;

/** A short line with no closing mark and no digits at a paragraph start: «الأسباب», «المنطوق». */
function isHeadingLine(line: string): boolean {
  return line.length <= 25 && line.split(/\s+/).length <= 3 && !DIGIT.test(line) && !ENDS_PARAGRAPH.test(line);
}

/** Cut positions after a sentence end, never inside «.....», before a number, or after a one-letter abbreviation («م.», «د.»). */
function sentenceCuts(text: string): number[] {
  const cuts: number[] = [];
  const re = /[.؟!?]+(?=\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length > 1) continue; // an ellipsis or a redaction run
    const end = m.index + 1;
    const next = text.slice(end).trimStart().charAt(0);
    if (next === "" || DIGIT.test(next) || next === ".") continue;
    const before = text.slice(0, m.index);
    const lastWord = before.slice(before.search(/\S+$/));
    if (lastWord.length <= 1) continue;
    cuts.push(end);
  }
  return cuts;
}

/** A long paragraph as pieces of about TARGET_PARAGRAPH characters, cut at sentence ends only. */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= LONG_PARAGRAPH) return [paragraph];
  const pieces: string[] = [];
  let start = 0;
  for (const cut of sentenceCuts(paragraph)) {
    if (cut - start >= TARGET_PARAGRAPH && paragraph.length - cut >= MIN_TAIL) {
      pieces.push(paragraph.slice(start, cut).trim());
      start = cut;
    }
  }
  pieces.push(paragraph.slice(start).trim());
  return pieces.filter((p) => p !== "");
}

/** The paragraphs to render, in order. Empty input → []. */
export function principleParagraphs(text: string | null | undefined): string[] {
  const cleaned = cleanPrincipleText(text);
  if (cleaned === "") return [];
  const paragraphs: string[] = [];
  for (const block of cleaned.split(/\n{2,}/)) {
    let current = "";
    let currentIsHeading = false;
    const flush = () => {
      if (current !== "") paragraphs.push(...splitLong(current));
      current = "";
      currentIsHeading = false;
    };
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (line === "") continue;
      if (BULLET_ONLY.test(line)) {
        flush();
        continue;
      }
      if (current !== "" && (currentIsHeading || ENDS_PARAGRAPH.test(current) || ITEM_START.test(line) || LABEL_LINE.test(line))) flush();
      if (current === "") {
        current = line;
        currentIsHeading = isHeadingLine(line);
      } else {
        current = `${current} ${line}`;
      }
    }
    flush();
  }
  return paragraphs;
}
