/**
 * The reader's `<details>` blocks (BUG-LIB-05, owner package 2026-11-02).
 *
 * Every `<details>` in a law's text used to render as the amber amendment
 * toggle, whose summary prints «سابق» — so a never-amended law showed a
 * «previous version» badge over its موجز and info card. And a
 * `<details open><summary>…</summary>` written on ONE line (the preamble's
 * موجز, lawPreambleBlocks.ts) lost its summary: the parser skipped the whole
 * line and put the invented label «النص قبل التعديل…» in its place.
 *
 * This module:
 *   - puts every `<details>` / `<summary>…</summary>` / `</details>` on a line
 *     of its own, so the reader's line parser sees the real summary;
 *   - says whether a block is amendment history (amber «سابق» toggle) or
 *     known current content (a neutral toggle);
 *   - cleans a summary into plain text (it is rendered as text, never HTML).
 *
 * The classification follows the parser's design
 * (scripts/parsers/lib/article-history.ts, whose label lists it imports):
 * superseded text must never look current, so a block is history UNLESS it
 * is known current content, and history wording in the body overrides a
 * live-annex summary.
 *
 * Pure: `node --test` loads it (_details-block.test.ts).
 */
import {
  BEFORE_TEXT_LABELS,
  ENGLISH_TEXT_SUMMARY_RE,
  HISTORIC_SUMMARY_RE,
  LIVE_ANNEX_SUMMARY_ALLOWLIST,
  REFERENCE_LABELS,
  REFERENCE_NOTICE_VERBS,
  UNBOLDED_BEFORE_RE,
  isPredominantlyLatin,
} from "../../../../scripts/parsers/lib/article-history.ts";

/** The label of a history block whose source wrote no summary. */
export const AMENDMENT_DETAILS_FALLBACK_SUMMARY = "📜 النص قبل التعديل وتفاصيل قرار/مرسوم التعديل";
/** The label of a known-current block whose source wrote no summary. */
export const GENERAL_DETAILS_FALLBACK_SUMMARY = "عرض التفاصيل";

/** Arabic diacritics + tatweel — the parser's stripTashkeel, for matching only. */
function stripTashkeel(s: string): string {
  return s.replace(/[ً-ْٰـ]/g, "");
}

/** stripTashkeel plus the hamza forms of alef («أُلغيت» = «الغيت»), for matching only. */
function fold(s: string): string {
  return stripTashkeel(s).replace(/[أإآ]/g, "ا");
}

function alternation(labels: readonly string[]): string {
  return labels.map((l) => fold(l).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

/** A line that opens with one of the parser's «before» labels: superseded wording follows. */
const BEFORE_LABEL_LINE_RE = new RegExp(`^[\\s>*_]*(?:${alternation(BEFORE_TEXT_LABELS)})`, "m");
/** A bold or colon-ended reference label: «**الإلغاء:**», «تعديل:», «**إضافة**:». */
const REFERENCE_LABEL_LINE_RE = new RegExp(`^[\\s>]*\\**\\s*(?:${alternation(REFERENCE_LABELS)})\\s*\\**\\s*[:：]`, "m");
/** A notice recording the change at a line's start: «عُدّلت…», «نُقلت…», «أُلغي…». */
const NOTICE_LINE_RE = new RegExp(`^[\\s>*_]*(?:${alternation(REFERENCE_NOTICE_VERBS)})(?=[\\s:،.]|$)`, "m");

/**
 * The preamble's own toggles, which are never history (lawPreambleBlocks.ts:
 * the «📝 موجز المستند…» block, the «📊 بطاقة تعريف…» card and its «➕ المزيد…»
 * rows; lawSummaryVisibility.ts: «🗂️ البطاقة التعريفية…»). Decided before the
 * body is read: a موجز may well say «عُدّل النظام…».
 */
const PREAMBLE_SUMMARY_RE = /📝[^\n]*موجز|بطاقة\s+تعريف|البطاقة\s+التعريفية|➕/;

/** The parser's history evidence: the summary says so, or the body carries a label or notice. */
function hasHistoryWording(summary: string, content: string): boolean {
  if (HISTORIC_SUMMARY_RE.test(stripTashkeel(summary))) return true;
  if (UNBOLDED_BEFORE_RE.test(stripTashkeel(content))) return true;
  const body = fold(content);
  return BEFORE_LABEL_LINE_RE.test(body) || REFERENCE_LABEL_LINE_RE.test(body) || NOTICE_LINE_RE.test(body);
}

/**
 * True when the block is (or may be) a previous version of the text — the
 * amber «سابق» toggle. False only for known current content: the preamble's
 * موجز / info card (always), a hand-verified live annex or a confirmed English
 * courtesy translation (unless the body carries history wording). Anything
 * else is history, as the parser treats it.
 */
export function isAmendmentDetails(summary: string | null | undefined, content: string | null | undefined): boolean {
  const s = (summary ?? "").replace(/\s+/g, " ").trim();
  const body = content ?? "";
  if (PREAMBLE_SUMMARY_RE.test(s)) return false;
  if (hasHistoryWording(s, body)) return true;
  if (LIVE_ANNEX_SUMMARY_ALLOWLIST.has(s)) return false;
  if (ENGLISH_TEXT_SUMMARY_RE.test(s) && isPredominantlyLatin(body)) return false;
  return true;
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
