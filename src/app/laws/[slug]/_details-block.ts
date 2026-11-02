/**
 * The reader's `<details>` blocks (BUG-LIB-05, owner package 2026-11-02).
 *
 * Every `<details>` in a law's text used to render as the amber amendment
 * toggle, whose summary prints «سابق» — so a never-amended law showed a
 * «previous version» badge over a schedule, an info card or a موجز. And a
 * `<details open><summary>…</summary>` written on ONE line (the preamble's
 * موجز, lawPreambleBlocks.ts) lost its summary: the parser skipped the whole
 * line and put the invented label «النص قبل التعديل…» in its place.
 *
 * This module:
 *   - puts every `<details>` / `<summary>…</summary>` / `</details>` on a line
 *     of its own, so the reader's line parser sees the real summary;
 *   - says whether a block is amendment history (amber toggle) or anything
 *     else (a neutral toggle, no «سابق»);
 *   - cleans a summary into plain text (it is rendered as text, never HTML).
 *
 * Pure, no imports: `node --test` loads it (_details-block.test.ts).
 */

/** The label of a history block whose source wrote no summary. */
export const AMENDMENT_DETAILS_FALLBACK_SUMMARY = "📜 النص قبل التعديل وتفاصيل قرار/مرسوم التعديل";
/** The label of any other block whose source wrote no summary. */
export const GENERAL_DETAILS_FALLBACK_SUMMARY = "عرض التفاصيل";

/** Arabic diacritics + tatweel, and the hamza forms of alef, for matching only. */
function normalizeArabic(s: string): string {
  return s.replace(/[ً-ْٰـ]/g, "").replace(/[أإآ]/g, "ا");
}

/**
 * Summary wording that marks a block as a previous version. Mirrors the
 * parser's HISTORIC_SUMMARY_RE (scripts/parsers/lib/article-history.ts:230)
 * without «حاشية/حواشي»: a footnote is history only when its body says so
 * (BODY_HISTORY_RE below). Matched on normalizeArabic() text.
 */
const SUMMARY_HISTORY_RE =
  /الاصدارات\s+السابقة|التعديلات|الالغاءات|نص\s+تاريخي|قبل\s+الالغاء|قبل\s+التعديل|النص\s+السابق|النص\s+الاصلي|(?:مرسوم|قرار)\s+التعديل/;

/**
 * Body wording that IS amendment history: the parser's «before» labels
 * (BEFORE_TEXT_LABELS) and its bare notices (REFERENCE_NOTICE_RE: «عُدّلت…»
 * at the start of a line). Matched on normalizeArabic() text.
 */
const BODY_HISTORY_RE =
  /قبل\s+التعديل|قبل\s+الالغاء|النص\s+السابق|نصها\s+الاصلي|^[\s>*_]*(?:اضيفت|عدلت|الغيت|حذفت|استبدلت)(?=\s|$)/m;

/** True when the block holds a previous version of the text (amber «سابق» toggle). */
export function isAmendmentDetails(summary: string | null | undefined, content: string | null | undefined): boolean {
  if (summary && SUMMARY_HISTORY_RE.test(normalizeArabic(summary))) return true;
  return !!content && BODY_HISTORY_RE.test(normalizeArabic(content));
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/**
 * A `<summary>` as plain text: no tags, comments, entities, `**`/`__`/`~~`,
 * backticks, markdown escapes or heading hashes. The reader prints the result
 * as a React text node, so nothing here becomes HTML.
 */
export function cleanDetailsSummary(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/&(?:nbsp|amp|quot|#39|apos|lt|gt);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, "$1")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A line that held nothing but markup (`<div …>`, `</div>`, `<br>`, a comment). */
const TAG_ONLY_LINE_RE = /^\s*(?:<!--[\s\S]*?-->|<\/?[a-z][^>]*>|\s)+$/i;

/**
 * The text as the reader's lines: HTML comments dropped, each summary joined
 * onto one line, and every `<details>` / `<summary>…</summary>` /
 * `</details>` on a line of its own (a line without them is kept as it is,
 * blank lines included). A line of bare markup becomes a blank line rather
 * than an empty paragraph.
 */
export function splitDetailsMarkup(text: string): string[] {
  const prepared = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/gi, (_m, s: string) => `<summary>${s.replace(/\s+/g, " ").trim()}</summary>`);
  const out: string[] = [];
  for (const line of prepared.split("\n")) {
    if (!/<\/?details\b|<summary>/i.test(line)) {
      out.push(TAG_ONLY_LINE_RE.test(line) ? "" : line);
      continue;
    }
    const marked = line
      .replace(/<summary>[^\n]*?<\/summary>/g, (m) => `\u0000${m}\u0000`)
      .replace(/<details\b[^>]*>/gi, "\u0000<details>\u0000")
      .replace(/<\/details\s*>/gi, "\u0000</details>\u0000");
    for (const seg of marked.split("\u0000")) {
      if (seg.trim()) out.push(seg);
    }
  }
  return out;
}
