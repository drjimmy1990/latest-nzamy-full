/**
 * PostgREST caps every unranged select at the server's max-rows setting (1000
 * on both the retired cloud project and the self-hosted instance), and it does
 * so silently: a law with 1,838 articles came back as 1,000 with no error.
 *
 * selectAllPages() walks a query in .range() windows and concatenates them, so
 * a list can never be truncated by that cap. It advances by the number of rows
 * each window actually returned and stops on the first EMPTY window, which
 * keeps it correct even if the server's max-rows is later set BELOW pageSize
 * (a "stop on a short page" loop would stop after the first capped page).
 *
 * The query the caller builds MUST carry a deterministic .order() whose last
 * key is unique (e.g. .order("order_index").order("id")); without it,
 * consecutive windows can overlap or skip rows.
 *
 * Usage:
 *   const { data, error } = await selectAllPages((from, to) =>
 *     supabase.schema("library").from("articles").select("*")
 *       .eq("law_slug", slug).order("order_index").order("id").range(from, to));
 */

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface SelectAllPagesOptions {
  /** Rows requested per window. Keep it at or below the server's max-rows. */
  pageSize?: number;
  /** Safety ceiling: stop and report an error past this many rows. */
  maxRows?: number;
}

export async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 1000, maxRows = 50_000 }: SelectAllPagesOptions = {},
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: out, error };
    const rows = data ?? [];
    if (rows.length === 0) return { data: out, error: null };
    out.push(...rows);
    from += rows.length;
  }
  // One more probe distinguishes "exactly maxRows" from "more than maxRows".
  const { data: extra, error } = await page(from, from);
  if (error) return { data: out, error };
  if ((extra ?? []).length === 0) return { data: out, error: null };
  return { data: out, error: { message: `selectAllPages: more than ${maxRows} rows` } };
}
