/**
 * #22 (owner package 6-Nov): a Diwan ruling with no number in the source now
 * has `principle_number` = "" (the parser no longer invents `++idx`). Every
 * label that used to print «مبدأ رقم (…)» says plain «مبدأ» instead of
 * «مبدأ رقم ()».
 *
 * Pure, no imports: `node "src/app/precedents/[slug]/_principle-label.test.ts"`.
 */

/** «مبدأ رقم (12)» / «Principle # (12)»; «مبدأ» / «Principle» when there is no number. */
export function principleLabel(num: unknown, isRTL: boolean, parens: boolean): string {
  const n = num == null ? "" : String(num).trim();
  if (!n) return isRTL ? "مبدأ" : "Principle";
  if (isRTL) return parens ? `مبدأ رقم (${n})` : `مبدأ رقم ${n}`;
  return parens ? `Principle # (${n})` : `Principle #${n}`;
}
