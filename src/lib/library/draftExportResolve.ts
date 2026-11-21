/**
 * draftExportResolve.ts — L2: which text each draft item gets in the Word
 * file, from the rows the SERVER read (POST /api/library/draft-export).
 *
 *   - a law article found in library.articles: its stored text (audit notes
 *     stripped) when the viewer has full library access or the law is open to
 *     everyone (whitelisted); otherwise its title only (capped like the
 *     reader's locked title) and the locked line. The cart's text is never
 *     used for a law article. The regulation goes with it only when the item
 *     asked for it and the viewer has the text; a non-subscriber's regulation
 *     name loses its instrument number and date (T28-22, regulationRefForViewer);
 *   - anything else (a royal-order page, a principle, a book page — no row in
 *     library.articles): the cart's own text for a full subscriber, who may
 *     read all of these anyway; for anyone else the title only.
 *
 * Pure, relative imports only — `node --test` loads it.
 */
import { stripArticleAuditNotes } from "./lawPreambleBlocks.ts";
import { regulationRefForViewer } from "../../app/api/library/laws/[slug]/_regulation-heading.ts";
import type { DraftExportItem, ResolvedDraftEntry } from "./draftExport.ts";

/** The reader's cap on a locked article's title (laws/[slug]/route.ts LOCKED_TITLE_CHARS). */
export const DRAFT_LOCKED_TITLE_CHARS = 120;

export interface DraftArticleRow {
  id: string;
  law_slug: string;
  title?: unknown;
  text?: unknown;
  executive_reg_text?: unknown;
  executive_reg_ref?: unknown;
  article_regulations?: unknown;
}

export const DRAFT_ARTICLE_COLUMNS =
  "id, law_slug, title, text, executive_reg_text, executive_reg_ref, article_regulations (ref, text, sort_key)";

const s = (v: unknown): string => (typeof v === "string" ? v : "");

function regulationOf(row: DraftArticleRow, hideOfficialMeta: boolean): { ref: string; text: string } | null {
  const regs = Array.isArray(row.article_regulations) ? (row.article_regulations as Array<Record<string, unknown>>) : [];
  const withText = regs
    .map((r) => ({ ref: s(r.ref), text: stripArticleAuditNotes(r.text), sort: s(r.sort_key) || "99999" }))
    .filter((r) => r.text.trim());
  if (withText.length) {
    withText.sort((a, b) => a.sort.localeCompare(b.sort));
    const refs = Array.from(new Set(withText.map((r) => regulationRefForViewer(r.ref, hideOfficialMeta)).filter(Boolean)));
    return { ref: refs.join("، "), text: withText.map((r) => r.text).join("\n\n") };
  }
  const legacy = stripArticleAuditNotes(row.executive_reg_text);
  return legacy.trim() ? { ref: regulationRefForViewer(row.executive_reg_ref, hideOfficialMeta), text: legacy } : null;
}

export interface ResolveDraftViewer {
  /** hasFullLibraryAccess: a library plan / grant / founder / Pro tier / staff. */
  isSubscriber: boolean;
  /** Laws open in full to everyone (library_whitelisted_laws). */
  openLaws: ReadonlySet<string>;
}

export function resolveDraftEntries(
  items: ReadonlyArray<DraftExportItem>,
  rows: ReadonlyArray<DraftArticleRow>,
  viewer: ResolveDraftViewer,
): ResolvedDraftEntry[] {
  const byKey = new Map(rows.map((r) => [`${r.law_slug}\u0000${r.id}`, r]));
  return items.map((item): ResolvedDraftEntry => {
    const row = byKey.get(`${item.lawSlug}\u0000${item.articleId}`);
    if (row) {
      const entitled = viewer.isSubscriber || viewer.openLaws.has(item.lawSlug);
      const title = stripArticleAuditNotes(row.title) || item.title;
      return {
        lawName: item.lawName,
        lawSlug: item.lawSlug,
        label: item.label,
        title: entitled ? title : title.slice(0, DRAFT_LOCKED_TITLE_CHARS),
        text: entitled ? (item.withArticle ? stripArticleAuditNotes(row.text) : "") : null,
        execReg: entitled && item.withExecReg ? regulationOf(row, !viewer.isSubscriber) : null,
        source: "library",
      };
    }
    return {
      lawName: item.lawName,
      lawSlug: item.lawSlug,
      label: item.label,
      title: item.title.slice(0, DRAFT_LOCKED_TITLE_CHARS),
      text: viewer.isSubscriber ? item.text : null,
      execReg: null,
      source: "cart",
    };
  });
}

/** True when at least one item carries text: the download is a full open and counts. */
export function draftCarriesText(entries: ReadonlyArray<ResolvedDraftEntry>): boolean {
  return entries.some((e) => (e.text !== null && e.text.trim() !== "") || (e.execReg !== null && e.execReg.text.trim() !== ""));
}
