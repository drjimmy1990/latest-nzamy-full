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

export function decreeSummaries(meta: Record<string, unknown>, body: unknown): DecreeSummaries {
  const fromBlock = lawSummaryBrief(body);
  return {
    summary: text(meta.summary),
    summary_brief: fromBlock ?? text(meta.summary_brief),
  };
}
