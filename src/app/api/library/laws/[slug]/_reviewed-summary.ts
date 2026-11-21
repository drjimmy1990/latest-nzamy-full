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
 * Q96 (batch l12): with platform_settings library_summaries_reviewed_only on
 * (the default), the preamble's موجز is no longer the fallback for a law
 * whose summary_status is not 'reviewed': no موجز at all (readerSummaryFields).
 *
 * Pure: `node --test` runs _reviewed-summary.test.ts.
 */
import { summaryForViewer } from "../../../../../lib/library/legislativeEvent.ts";
import { summaryShown } from "../../../../../lib/library/summaryReview.ts";

/** Read with the service role, on its own, so a missing column never fails the law read. */
export const LAW_REVIEWED_SUMMARY_COLUMNS = "summary, summary_status";

/** The reviewed frontmatter موجز for this viewer; null = keep today's (no reviewed summary, or no columns yet). */
export function reviewedSummaryFor(row: unknown, isSubscriber: boolean): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { summary?: unknown; summary_status?: unknown };
  if (r.summary_status !== "reviewed" || typeof r.summary !== "string" || r.summary.trim() === "") return null;
  return summaryForViewer(r.summary.trim(), isSubscriber).trim();
}

/**
 * The law answer's موجز keys: the reviewed frontmatter موجز when there is
 * one; else the preamble's (lawReaderExtras) — only while the reviewed-only
 * rule is off or the law's summary_status is 'reviewed' (Q96). Omitted, never
 * empty, when there is nothing to show.
 */
export function readerSummaryFields(
  row: unknown,
  isSubscriber: boolean,
  extras: { summary?: string; summaryLabel?: string },
  reviewedOnly: boolean,
): { summary?: string; summaryLabel?: string } {
  const reviewed = reviewedSummaryFor(row, isSubscriber);
  if (reviewed !== null) return reviewed ? { summary: reviewed } : {};
  const status = row && typeof row === "object" ? (row as { summary_status?: unknown }).summary_status : undefined;
  if (!summaryShown(status, reviewedOnly)) return {};
  return extras.summary ? { summary: extras.summary, summaryLabel: extras.summaryLabel } : {};
}
