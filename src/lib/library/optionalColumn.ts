/**
 * A select that names a column a pending migration adds, read so the code can
 * deploy BEFORE the SQL: when PostgREST answers "column does not exist" for
 * that column, the same read runs once more without it.
 *
 * Used by /api/library/init for library.laws.summary_brief (20261025_20):
 * before the migration the cards show no موجز and the laws section is not
 * marked degraded. Any other error is returned as it came.
 *
 * readWithOptionalFeatures is the general form (N2.5): several pending
 * migrations, each a "feature" with its columns (in the select, a filter or
 * the order), applied in any order. A missing-column answer naming one of a
 * feature's columns drops that feature only, and the read runs again.
 * PostgREST v12.2.3 (probed locally, 2026-10-25) answers an unknown column in
 * `select=` and in `order=` alike: HTTP 400, code 42703, "column laws.<c>
 * does not exist". A PGRST100 parse error that names the column is dropped
 * too (isMissingFeatureColumn), so a future PostgREST that checks `order=`
 * itself still degrades to the old order, never to an empty catalogue —
 * always with a console.warn naming the column.
 *
 * Pure (no imports): `node --test` loads it directly.
 */

export interface PgErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
}

/** 42703 (Postgres undefined_column) or PGRST204 (schema cache miss) naming `column`. */
export function isMissingColumnError(error: PgErrorLike | null | undefined, column: string): boolean {
  if (!error || !column) return false;
  if (error.code !== "42703" && error.code !== "PGRST204") return false;
  return String(error.message ?? "").includes(column);
}

function namesColumn(text: unknown, column: string): boolean {
  const s = String(text ?? "");
  let i = s.indexOf(column);
  while (i !== -1) {
    const before = i === 0 ? "" : s[i - 1];
    const after = s[i + column.length] ?? "";
    if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) return true;
    i = s.indexOf(column, i + 1);
  }
  return false;
}

/**
 * readWithOptionalFeatures' test: 42703 / PGRST204 (missing column) or
 * PGRST100 (PostgREST could not parse the select / order) whose message or
 * details name `column` as a whole identifier.
 */
export function isMissingFeatureColumn(error: PgErrorLike | null | undefined, column: string): boolean {
  if (!error || !column) return false;
  if (error.code !== "42703" && error.code !== "PGRST204" && error.code !== "PGRST100") return false;
  return namesColumn(error.message, column) || namesColumn(error.details, column);
}

export interface OptionalFeature {
  /** What the caller tests for in `run`'s set. */
  key: string;
  /** The columns the feature names; a 42703 / PGRST204 / PGRST100 naming any of them drops it. */
  columns: readonly string[];
}

/**
 * Runs `run` with every requested feature on; when the database answers that
 * one of a feature's columns does not exist, runs it again without that
 * feature. At most one extra read per feature. `wanted` (default: all) is the
 * features this read asks for — a viewer who gets no موجز never names it.
 */
export async function readWithOptionalFeatures<R extends { error: PgErrorLike | null }>(
  run: (on: ReadonlySet<string>) => PromiseLike<R>,
  features: readonly OptionalFeature[],
  wanted: readonly string[] = features.map((f) => f.key),
): Promise<R> {
  const on = new Set(features.filter((f) => wanted.includes(f.key)).map((f) => f.key));
  for (;;) {
    const res = await run(on);
    const dropped = features.find(
      (f) => on.has(f.key) && f.columns.some((c) => isMissingFeatureColumn(res.error, c)),
    );
    if (!dropped) return res;
    console.warn(`[optionalColumn] ${dropped.columns.join(", ")} not in the database yet — read without it (apply its migration)`);
    on.delete(dropped.key);
  }
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
