/**
 * decreeDisplay.ts — how a decree / order page shows its stored text (owner
 * file 03 L9, screenshot lib07: decree م/115 printed raw `#`, `<details open>`,
 * `<summary>`, `###`, `| --- |` tables and `**` in «الديباجة التمهيدية», and
 * its موجز twice).
 *
 *   - decreePreambleForDisplay: the preamble without the «📝 موجز» block (the
 *     page's summary box shows the موجز — owner Q96: only a reviewed one, as
 *     the API sends it — so it never shows twice) and with the
 *     «📊 بطاقة تعريف» table lifted out as rows; what is left is rendered by
 *     the law reader's Markdown renderer (MD), never printed as text. No word
 *     of the text changes. This overrules our earlier owner-٢٥٩(أ) rule
 *     «تطبع الديباجة كما هي».
 *   - hasBlockMarkup: a decree page that carries block markup (a heading, a
 *     `<details>`, a table) is rendered by MD too; any other page stays the
 *     plain text it was.
 *   - pageSnippet: the «صفحات المستند» side list's one-line snippet, without
 *     Markdown marks (lib07: «**١-**»).
 *   - decreeCategoryLabel: «تصنيف الملف» as the section's name, not the code
 *     («30»); null hides the row.
 *
 * Pure (relative .ts imports only): `node --test` runs decreeDisplay.test.ts.
 */
import { extractLawPreambleBlocks, isHollowPreamble, type LawMetadataCard } from "./lawPreambleBlocks.ts";
import { stripMarkdownMarks } from "../text/stripMarkdownMarks.ts";
import { LEGAL_TAXONOMY } from "../../constants/taxonomies.ts";
import { SECTION_30, toTaxonomyId } from "../../app/laws/lawsIndexFacets.ts";

export interface DecreePreambleDisplay {
  /** The preamble to render with MD; '' when nothing but headings and wrappers is left. */
  text: string;
  /** The identity card's rows, when the preamble had one. */
  card: LawMetadataCard | null;
}

export function decreePreambleForDisplay(preamble: unknown): DecreePreambleDisplay {
  const raw = typeof preamble === "string" ? preamble : "";
  if (!raw.trim()) return { text: "", card: null };
  const blocks = extractLawPreambleBlocks(raw);
  const card = blocks.metadataCard && (blocks.metadataCard.main.length > 0 || blocks.metadataCard.more.length > 0) ? blocks.metadataCard : null;
  const rest = blocks.rest.replace(/\n{3,}/g, "\n\n").trim();
  return { text: rest && !isHollowPreamble(rest) ? rest : "", card };
}

/** A Markdown heading, a `<details>` / `<summary>` tag, or a table separator row. */
const BLOCK_MARKUP_RE = /^[ \t>]*#{1,6}[ \t]+\S|<\/?details\b|<summary\b|^[ \t]*\|[ \t:|-]*-{3,}[ \t:|-]*\|?[ \t]*$/im;

/** True when the text has markup that only the Markdown renderer draws correctly. */
export function hasBlockMarkup(text: unknown): boolean {
  return typeof text === "string" && BLOCK_MARKUP_RE.test(text);
}

/** One line of plain text for a side-list snippet: no tags, no Markdown marks, at most `max` characters. */
export function pageSnippet(text: unknown, max = 45): string {
  const plain = stripMarkdownMarks(
    String(typeof text === "string" ? text : "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/?[a-z][^>]*>/gi, " ")
      .replace(/^[ \t]*>[ \t]?/gm, "")
      .replace(/^[ \t]*\|?[ \t:|-]*-{3,}[ \t:|-]*\|?[ \t]*$/gm, " ")
      .replace(/\|/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(plain);
  return chars.length > max ? `${chars.slice(0, max).join("")}...` : plain;
}

/** «30» / «SA-30» / «08» → the section's name; null for an empty or unknown code (the row hides). */
export function decreeCategoryLabel(code: unknown, isRTL = true): string | null {
  const id = toTaxonomyId(code);
  if (!id) return null;
  const hit = LEGAL_TAXONOMY.find((c) => c.id === id) ?? (id === SECTION_30.id ? SECTION_30 : null);
  if (!hit) return null;
  return isRTL ? hit.label : hit.labelEn;
}
