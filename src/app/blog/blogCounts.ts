/**
 * The blog's «الكل» count — pure, so `node --test` can import it.
 *
 * Owner answer ٢١٥ (18 Oct): the «الكل» pill shows the live number of
 * published articles. That number is the `total` /api/v1/blog returns for an
 * unfiltered request (an exact COUNT). The sum of the category pills is NOT
 * the same number: /api/v1/blog/categories skips every article whose
 * category is blank, and a pill only exists for a category with a label.
 */

/**
 * `total` when it is a usable count (finite, not negative); otherwise the sum
 * of the category counts (bad entries skipped, so never NaN); and `undefined`
 * — no number on the pill — while neither is known.
 */
export function allPillCount(
  total: number | null | undefined,
  categoryCounts: readonly number[],
): number | undefined {
  if (typeof total === "number" && Number.isFinite(total) && total >= 0) return total;
  if (categoryCounts.length === 0) return undefined;
  let sum = 0;
  for (const n of categoryCounts) {
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}
