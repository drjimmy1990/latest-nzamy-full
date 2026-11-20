/**
 * The publish hold for `needs_human_review` (l10 gap 1.5, option A) — OPT-IN
 * (coordinator ruling 2026-11-20: the 10-03 corpus has 483 flagged law /
 * decree files, an unknown share of them stale, so the owner / agent clears
 * the stale flags first and only then switches the hold on).
 *
 * Default (no flag): today's behaviour — every file is built, and every
 * flagged law / decree file is listed loudly on screen and in
 * needs-human-review-report.json with the count, as
 * «موسوم للمراجعة — يُنشر لأن البوابة غير مفعّلة».
 *
 * `--hold-review-flagged`: a law or decree FILE whose frontmatter says
 * `needs_human_review: true` is held back — scripts/seed-library.ts leaves it
 * out of the rows it builds (the dry-run JSONL the owner loads, and a live
 * seed alike), lists it as held_back and prints «held back» with the count.
 * The whole document goes: its chapters, articles, amendments, regulations or
 * decree pages are built from the same parsed object, so nothing is orphaned.
 * `--allow-review-flagged` (the earlier escape) is still accepted and means
 * the default.
 *
 * The hold never deletes anything: the loader only upserts, so a document that
 * is already live stays live until its flag is cleared and it is loaded again,
 * or until its rows are deleted by hand (a separate decision).
 *
 * Precedent collections are never held (their flag stays report-only).
 *
 * Pure and import-free: node:test and the seeder both load it.
 */

/** How a flagged file that is built anyway is labelled on screen and in the report. */
export const PUBLISHED_FLAGGED_LABEL = "موسوم للمراجعة — يُنشر لأن البوابة غير مفعّلة";

/**
 * A load from rows built with the hold on is NOT a full load: the held-back
 * documents keep their live rows, untouched. So the one-time cleanup after
 * the first full l9 load (20261129_70 header: `delete … where position is
 * null`, and deleting what library:diff lists as left behind) must not follow
 * it — it would delete the held-back documents' amendment cards and, through
 * the diff, the documents themselves. Printed only when the hold is on.
 */
export const HELD_BACK_NOT_FULL_LOAD =
  "Rows built with held-back files are NOT a FULL load: do not run the 20261129_70 «position is null» cleanup, " +
  "and do not delete what library:diff lists as left behind — the held-back documents would lose their live rows. " +
  "Do the first full l9 load and its cleanup from rows built without --hold-review-flagged.";

/** The parser writes `needsHumanReview`; an older parse may carry the frontmatter key. */
export function isReviewFlagged(o: unknown): boolean {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return r.needsHumanReview === true || r.needs_human_review === true;
}

export interface HeldBackItem {
  table: "laws" | "decrees_circulars";
  /** The document's id as the report lists it (law slug, decree id). */
  id: string;
  reason: string;
}

export function reviewReasonOf(o: Record<string, unknown>): string {
  return String(o.reviewReason ?? o.review_reason ?? "").trim() || "(بلا سبب مسجَّل)";
}

/**
 * Split the parsed rows into what is built and what is held back. Without
 * `hold` (the default) everything is built, and the flagged files come back
 * in `published` so they can be listed.
 */
export function holdBackReviewFlagged<T>(
  rows: readonly T[],
  table: HeldBackItem["table"],
  idOf: (row: T) => string,
  hold: boolean,
): { kept: T[]; held: HeldBackItem[]; published: HeldBackItem[] } {
  const kept: T[] = [];
  const held: HeldBackItem[] = [];
  const published: HeldBackItem[] = [];
  for (const row of rows) {
    if (!isReviewFlagged(row)) {
      kept.push(row);
      continue;
    }
    const item: HeldBackItem = { table, id: idOf(row), reason: reviewReasonOf(row as Record<string, unknown>) };
    if (hold) {
      held.push(item);
    } else {
      kept.push(row);
      published.push(item);
    }
  }
  return { kept, held, published };
}
