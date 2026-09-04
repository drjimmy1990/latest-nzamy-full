/**
 * attachmentPurge.ts — the one place the 30-day bin cutoff becomes a
 * timestamp. Pure: no I/O, no Supabase, so it is unit-testable without a
 * database and importable from both the cron route (server) and any future
 * "days left in the bin" display without duplicating the arithmetic.
 *
 * DECISION 3 in 20260906_phase6_settings_out_of_browser.sql: deleting a
 * document is a 30-day soft delete, and the hourly cron purges rows older
 * than 30 days that carry no legal hold — row + storage object.
 */

/** Days a soft-deleted attachment sits in the bin before the cron may purge it. */
export const PURGE_AFTER_DAYS = 30;

/**
 * The ISO timestamp cutoff: an attachment whose `deleted_at` is BEFORE this
 * instant (strictly `<`, matching the cron's `.lt("deleted_at", cutoff)`) is
 * eligible for permanent purge — provided it also carries no legal hold.
 *
 * `now` is injected (defaults to the real clock) so the cron and the test
 * suite can both call this without the test depending on wall-clock time.
 *
 * NOTE for the caller: `.lt("deleted_at", cutoff)` already excludes rows
 * where `deleted_at` is NULL — SQL evaluates `NULL < x` as NULL, not true, so
 * an untouched attachment never matches. Do not add a redundant
 * `.not("deleted_at", "is", null)` filter alongside it.
 */
export function purgeCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
