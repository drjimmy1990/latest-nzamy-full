/**
 * A select that names a column a pending migration adds, read so the code can
 * deploy BEFORE the SQL: when PostgREST answers "column does not exist" for
 * that column, the same read runs once more without it.
 *
 * Used by /api/library/init for library.laws.summary_brief (20261025_20):
 * before the migration the cards show no موجز and the laws section is not
 * marked degraded. Any other error is returned as it came.
 *
 * Pure (no imports): `node --test` loads it directly.
 */

export interface PgErrorLike {
  code?: string;
  message?: string;
}

/** 42703 (Postgres undefined_column) or PGRST204 (schema cache miss) naming `column`. */
export function isMissingColumnError(error: PgErrorLike | null | undefined, column: string): boolean {
  if (!error || !column) return false;
  if (error.code !== "42703" && error.code !== "PGRST204") return false;
  return String(error.message ?? "").includes(column);
}

export async function selectWithOptionalColumn<R extends { error: PgErrorLike | null }>(
  run: (select: string) => PromiseLike<R>,
  withColumn: string,
  without: string,
  column: string,
): Promise<R> {
  if (withColumn === without) return run(without);
  const first = await run(withColumn);
  if (!isMissingColumnError(first.error, column)) return first;
  console.warn(`[optionalColumn] ${column} is not in the database yet — read without it (apply its migration)`);
  return run(without);
}
