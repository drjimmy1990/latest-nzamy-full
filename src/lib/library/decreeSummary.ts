/**
 * A decree's two summaries (N2.8, parser code only):
 *
 *   summary        — the full summary, the front matter's `summary`, as is;
 *   summary_brief  — the short موجز: the file's `<details><summary>📝 موجز …`
 *                    block when it has one, else the front matter's
 *                    `summary_brief`.
 *
 * The owner's decree files (أوامر وتعاميم, 2026-10-25: 1,203 of 2,313 files)
 * carry the موجز as a `<details>` block in the body, the same template as
 * the laws; the parser used to read `summary_brief` from the front matter
 * only, where these files have none, so the card's موجز stayed empty. The
 * block is read by lawSummaryBrief() — the same rule as the laws' موجز
 * (first block, closed by the first `</details>` after it, blockquote marks
 * removed, CRLF-safe, capped) — and the two fields are never copied into
 * each other: an empty one stays empty. The body itself is not changed.
 *
 * Takes effect only when the owner re-parses and reloads.
 */

import { lawSummaryBrief } from "./lawPreambleBlocks.ts";

export interface DecreeSummaries {
  summary: string;
  summary_brief: string;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}

/**
 * Batch l16 (B-49; 20261202_50 added decrees_circulars.summary_status): the
 * summary's review status from the front matter — 'draft' | 'reviewed', any
 * case, else null (the column's CHECK accepts nothing else). The loader writes
 * it on every decree row, so the admin switch «إخفاء كل موجز غير مراجَع» can
 * keep a reviewed decree summary. A draft summary is still not loaded
 * (decreeSummaries below), so a draft never reaches the site while the switch
 * is off.
 */
export function decreeSummaryStatus(meta: Record<string, unknown>): "draft" | "reviewed" | null {
  const v = text(meta?.summary_status).trim().toLowerCase();
  return v === "draft" || v === "reviewed" ? v : null;
}

export function decreeSummaries(meta: Record<string, unknown>, body: unknown): DecreeSummaries {
  const fromBlock = lawSummaryBrief(body);
  // Owner file 18, item 4: a front-matter summary the library agent marks
  // `summary_status: draft` is not published (the laws store drafts and hide
  // them; the decree tables have no status column, so a draft is not loaded).
  // A file with no summary_status reads exactly as before.
  const draft = text(meta.summary_status).trim().toLowerCase() === "draft";
  return {
    summary: draft ? "" : text(meta.summary),
    summary_brief: fromBlock ?? (draft ? "" : text(meta.summary_brief)),
  };
}
