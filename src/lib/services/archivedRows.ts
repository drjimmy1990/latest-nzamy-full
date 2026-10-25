/**
 * archivedRows.ts — reading case notes / documents around the N3.9 archive
 * (migration 20261025_51), on a database where that migration may not have
 * run yet.
 *
 * Normal lists show live rows only (`deleted_at is null`). Before 20261025_51
 * case_notes has no `deleted_at`, and naming it fails the whole read with
 * 42703 — so `liveRowsOnly` retries once without the filter, which on such a
 * database returns exactly the same rows (nothing can be archived there yet).
 * The archive / restore calls have no such fallback: a missing function means
 * «not available yet», never a hard delete in its place.
 *
 * Pure (no imports) so archivedRows.test.ts runs it under `node --test`.
 */

export interface DbErrorLike {
  code?: string;
  message?: string;
}

export const ARCHIVE_UNAVAILABLE_AR =
  "الأرشفة غير متاحة بعد على هذه القاعدة — يلزم تنفيذ ترحيل قاعدة البيانات 20261025_51. لم يُحذف شيء.";

export function isMissingColumnError(err: DbErrorLike | null | undefined, column: string): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  if (err.code === "42703" || err.code === "PGRST204") return msg.includes(column);
  return false;
}

export function isMissingFunctionError(err: DbErrorLike | null | undefined): boolean {
  if (!err) return false;
  return err.code === "PGRST202" || err.code === "42883";
}

export async function liveRowsOnly<R extends { error: DbErrorLike | null }>(
  build: (excludeArchived: boolean) => PromiseLike<R>,
): Promise<R> {
  const first = await build(true);
  if (isMissingColumnError(first.error, "deleted_at")) return build(false);
  return first;
}
