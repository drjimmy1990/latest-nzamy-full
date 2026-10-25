/**
 * N2.2 — the outer catalogue cards show the موجز in two lines with
 * «... قراءة المزيد ▾» that opens it in place and «طي الموجز ▴» that folds it
 * (owner preview 2026-10-22, preview_10). Pure helpers of ClampedSummary.tsx (summaryClamp.ts: a different name, the file system is case-insensitive).
 */

/** The text a law card shows: its موجز, else a description that is not just the title again. */
export function lawCardSummaryText(summaryBrief: unknown, description: unknown, title: unknown): string {
  const brief = typeof summaryBrief === "string" ? summaryBrief.trim() : "";
  if (brief) return brief;
  const desc = typeof description === "string" ? description.trim() : "";
  const name = typeof title === "string" ? title.trim() : "";
  return desc && desc !== name ? desc : "";
}

/** The toggle shows only when two lines really cut the text (1px of rounding slack). */
export function clampOverflows(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight + 1;
}

export function summaryToggleLabel(expanded: boolean, isRTL = true): string {
  if (isRTL) return expanded ? "طي الموجز ▴" : "... قراءة المزيد ▾";
  return expanded ? "Fold summary ▴" : "... Read more ▾";
}
