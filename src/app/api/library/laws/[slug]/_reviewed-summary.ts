/**
 * _reviewed-summary.ts — the document's موجز from the library agent's
 * frontmatter (owner file 16 §6 / file 18 item 4; columns added by l9-parser's
 * 20261129_70: library.laws.summary, summary_status).
 *
 *   * summary_status = 'reviewed' and a summary → that summary is the موجز
 *     above the document (cleaned of decree numbers and dates for a
 *     non-subscriber, like the preamble's — owner ٣١٩);
 *   * a draft (or no status) → never shown: the reader keeps today's موجز,
 *     the one lifted from the preamble (lawReaderExtras) — the same fallback
 *     the /laws card's summary_brief takes in 20261129_70;
 *   * the columns not there yet (the SQL runs after the deploy), or the read
 *     failing → today's behaviour, unchanged.
 *
 * Pure: `node --test` runs _reviewed-summary.test.ts.
 */
import { summaryForViewer } from "../../../../../lib/library/legislativeEvent.ts";

/** Read with the service role, on its own, so a missing column never fails the law read. */
export const LAW_REVIEWED_SUMMARY_COLUMNS = "summary, summary_status";

/** The reviewed frontmatter موجز for this viewer; null = keep today's (no reviewed summary, or no columns yet). */
export function reviewedSummaryFor(row: unknown, isSubscriber: boolean): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { summary?: unknown; summary_status?: unknown };
  if (r.summary_status !== "reviewed" || typeof r.summary !== "string" || r.summary.trim() === "") return null;
  return summaryForViewer(r.summary.trim(), isSubscriber).trim();
}
