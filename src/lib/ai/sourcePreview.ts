/**
 * sourcePreview.ts — what the citation sheet may show of a cited library text
 * (owner N06-34, Q483): clicking [S1] in an AI answer opens the text in place
 * instead of a new tab.
 *
 * The rules, pure so `node --test` covers them (the route is
 * src/app/api/v1/ai/source-preview/route.ts):
 *   - only a text cited in one of the caller's OWN runs is previewed — the
 *     sheet is no back door into the library for texts nobody asked about;
 *   - a viewer without full library access gets the reader's locked-article
 *     rule: 100 characters, applied to `text` AND `original_text` (a repealed
 *     article keeps its substance in original_text — the laws route's warning);
 *   - with full access the whole article, audit notes stripped (BUG-01), capped
 *     so one answer cannot pull a whole book through a principle row.
 *
 * Pure, no imports beyond other pure modules.
 */
import { stripArticleAuditNotes } from "../library/lawPreambleBlocks.ts";

export type PreviewKind = "article" | "principle";

/** The reader's preview for a locked article (api/library/laws/[slug], LOCKED_PREVIEW_CHARS). */
export const LOCKED_PREVIEW_CHARS = 100;
/** The longest text an entitled viewer gets in the sheet; the library has the rest. */
export const FULL_PREVIEW_MAX = 6000;

/** `?kind=article&id=labor__art-80` → the source, or null when it is malformed. */
export function parsePreviewQuery(params: URLSearchParams): { kind: PreviewKind; id: string } | null {
  const kind = params.get("kind");
  const id = (params.get("id") ?? "").trim();
  if (kind !== "article" && kind !== "principle") return null;
  if (!id || id.length > 200 || /[\u0000-\u001f]/.test(id)) return null;
  return { kind, id };
}

/** The jsonb containment value that finds a run citing this source: `[{"kind":…,"id":…}]`. */
export function citedByFilter(kind: PreviewKind, id: string): string {
  return JSON.stringify([{ kind, id }]);
}

function cut(s: string, limit: number): string {
  return s.length > limit ? `${s.slice(0, limit)}…` : s;
}

/**
 * The excerpt of a cited text. `text` first; an article whose `text` is empty
 * (repealed) falls back to `original_text`. Locked: 100 characters; otherwise
 * the whole text up to FULL_PREVIEW_MAX.
 */
export function previewExcerpt(row: { text?: unknown; original_text?: unknown }, full: boolean): { excerpt: string; truncated: boolean } {
  const own = stripArticleAuditNotes(row.text).trim();
  const clean = own || stripArticleAuditNotes(row.original_text).trim();
  const limit = full ? FULL_PREVIEW_MAX : LOCKED_PREVIEW_CHARS;
  return { excerpt: cut(clean, limit), truncated: clean.length > limit };
}
