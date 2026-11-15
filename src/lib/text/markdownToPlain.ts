/**
 * markdownToPlain — the library's Markdown/HTML layout turned into clean,
 * readable text, for the legal graph (what is embedded and searched) and the
 * graph explorer's inspector (what staff read).
 *
 * Decree preambles arrive as a page layout: a «#» title, a «📊 بطاقة تعريف»
 * table, «<details><summary>📝 موجز …</summary>» blocks, «***» rules and
 * «#### [صفحة 1]» page markers. Shown raw, the inspector printed the tags;
 * embedded raw, the vector paid for markup and for the موجز twice (it is
 * also the node's summary).
 *
 * Keeps every word of content; removes only layout:
 *   - a two-cell table row becomes «key: value», a wider one «a — b — c»;
 *     separator rows and the «الحقل | القيمة» header go;
 *   - `<details>` / `</details>` tags go, a `<summary>` label line goes
 *     (it names the block, it is not its text), `<br>` becomes a new line;
 *   - with `dropSummaryBlocks`, a whole `<details>` block whose label says
 *     «موجز» goes — only when the caller already has that summary;
 *   - heading hashes, quote marks, bold/italic marks, rules and bullets
 *     (stripMarkdownMarks), emoji, link targets (`[text](url)` → text, bare
 *     URLs dropped), and page-marker lines («[صفحة 1]», «الصفحة 3»).
 *
 * Pure, one pure import: `node --test src/lib/text/markdownToPlain.test.ts`.
 * Safe in client components (no Node APIs).
 */
import { stripMarkdownMarks } from "./stripMarkdownMarks.ts";

export interface MarkdownToPlainOptions {
  /** Drop `<details>` blocks labelled «موجز» (the caller shows that summary already). */
  dropSummaryBlocks?: boolean;
}

const SUMMARY_BLOCK = /<details\b[^>]*>\s*<summary\b[^>]*>[^<]*موجز[^<]*<\/summary>[\s\S]*?<\/details>/giu;
const SUMMARY_LABEL = /<summary\b[^>]*>[\s\S]*?<\/summary>/giu;
const HTML_TAG = /<\/?[a-zA-Z][^>\n]*>/g;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const TABLE_SEPARATOR = /^[\s|:-]*-[\s|:-]*$/;
const PAGE_MARKER = /^\[?\s*(?:ال)?صفحة\s+[\d٠-٩]+\s*\]?$/u;
const PICTOGRAPH = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

function tableRowToText(line: string): string | null {
  const m = TABLE_ROW.exec(line);
  if (!m) return line;
  if (TABLE_SEPARATOR.test(line)) return null;
  const cells = m[1].split("|").map((c) => stripMarkdownMarks(c).trim());
  const filled = cells.filter(Boolean);
  if (filled.length === 0) return null;
  if (filled.length === 2 && filled[0] === "الحقل" && filled[1] === "القيمة") return null;
  if (cells.length === 2) return filled.length === 2 ? `${cells[0]}: ${cells[1]}` : filled[0];
  return filled.join(" — ");
}

export function markdownToPlain(input: string | null | undefined, options: MarkdownToPlainOptions = {}): string {
  if (typeof input !== "string" || input.trim() === "") return "";
  let text = input.replace(/\r\n?/g, "\n");

  if (options.dropSummaryBlocks) text = text.replace(SUMMARY_BLOCK, "\n");
  text = text
    .replace(SUMMARY_LABEL, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(HTML_TAG, "")
    .replace(/\[([^\]\n]*)\]\((?:[^)\s]*)\)/g, "$1")
    .replace(/(?:https?:\/\/|www\.)[^\s)\]»"'،|]*/gi, "")
    .replace(PICTOGRAPH, "");

  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    let line = raw.replace(/^\s*(?:>\s?)+/, "").replace(/^\s*(?:#{1,6}(?=\s|$)\s*)+/, "");
    const row = tableRowToText(line);
    if (row === null) continue;
    line = row.trim();
    if (PAGE_MARKER.test(line)) continue;
    lines.push(line);
  }

  // Per paragraph: stripMarkdownMarks folds blank lines, and they are kept here.
  return lines
    .join("\n")
    .split(/\n[ \t]*\n/)
    .map((paragraph) => stripMarkdownMarks(paragraph))
    .filter(Boolean)
    .join("\n\n")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
