/**
 * summaryReview.ts — Q96 (batch l12; the owner: «يُخفى كل موجز حالته غير
 * «مراجَع»، بلا مكان فارغ», file 16 §6): only a REVIEWED summary is shown —
 * the law reader's موجز, the /laws card line, a decree's summaries and the
 * search snippets built from them. A summary whose status is draft, missing
 * or unknown is left out of the API answer entirely (the key omitted / null),
 * so the page has no empty slot to show.
 *
 * Built as a reversible SETTING: platform_settings
 * 'library_summaries_reviewed_only' = {"on": boolean} (20261202_50).
 * OFF by default (l12 integration): decree summaries had no status (the
 * loader did not write decrees_circulars.summary_status until batch l16), so
 * ON before the next full load would hide every decree summary. A missing,
 * malformed or unreadable row reads OFF; the admin switches it on once the
 * statuses are loaded — the settings card counts them (GET
 * /api/v1/admin/library-summary-status).
 *
 * Statuses: library.laws.summary_status (20261129_70) and
 * library.decrees_circulars.summary_status (20261202_50) — 'reviewed' |
 * 'draft' | NULL. Before a column exists the status is unknown: not shown.
 *
 * Pure: no imports, so `node --test` loads it. The read is
 * ./summaryReviewServer.ts.
 */

export const SUMMARIES_REVIEWED_ONLY_KEY = "library_summaries_reviewed_only";
export const SUMMARIES_REVIEWED_ONLY_DEFAULT = false;
export const REVIEWED_STATUS = "reviewed";

/** {"on": boolean} → the switch; anything else → the default (OFF). */
export function parseSummariesReviewedOnly(value: unknown): boolean {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const on = (value as { on?: unknown }).on;
    if (typeof on === "boolean") return on;
  }
  return SUMMARIES_REVIEWED_ONLY_DEFAULT;
}

/** The admin settings validator: exactly {"on": boolean}. */
export function summariesReviewedOnlyIssue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 'قيمة library_summaries_reviewed_only يجب أن تكون كائناً بالشكل {"on": true}';
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "on" || typeof (value as { on?: unknown }).on !== "boolean") {
    return 'قيمة library_summaries_reviewed_only يجب أن تكون {"on": true} أو {"on": false}';
  }
  return null;
}

/** May a summary with this status be shown? */
export function summaryShown(status: unknown, reviewedOnly: boolean): boolean {
  return !reviewedOnly || status === REVIEWED_STATUS;
}

/**
 * A row's summary fields for the answer: kept when shown, else set to null
 * (the page then renders no box). The status column itself never leaves:
 * it is deleted from the row.
 */
export function withReviewedSummaries<T extends Record<string, unknown>>(
  row: T,
  fields: readonly string[],
  reviewedOnly: boolean,
  statusKey = "summary_status",
): T {
  const out: Record<string, unknown> = { ...row };
  const shown = summaryShown(out[statusKey], reviewedOnly);
  delete out[statusKey];
  if (!shown) for (const f of fields) if (f in out) out[f] = null;
  return out as T;
}
