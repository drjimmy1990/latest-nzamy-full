/**
 * enactmentLabels.ts — Arabic count wording for the enactment widget (T28-27).
 *
 * Arabic number agreement: 1 and 2 take the singular / dual with no numeral,
 * 3–10 the plural «أيام», 11 and above the accusative singular «يوماً».
 * Pure, no imports: `node --test src/app/laws/components/enactmentLabels.test.ts`.
 */

/** «بدأ سريانه اليوم» / «… منذ يوم» / «… منذ يومين» / «… منذ 5 أيام» / «… منذ 12 يوماً». */
export function sinceEffectiveLabel(days: number): string {
  const n = Math.max(0, Math.floor(Number(days) || 0));
  if (n === 0) return "بدأ سريانه اليوم";
  if (n === 1) return "بدأ سريانه منذ يوم";
  if (n === 2) return "بدأ سريانه منذ يومين";
  if (n <= 10) return `بدأ سريانه منذ ${n} أيام`;
  return `بدأ سريانه منذ ${n} يوماً`;
}

/**
 * The unit printed under a day count: 1 يوم، 2 يومان، 3–10 أيام، 11–99 يوماً.
 * Past 100 the last two digits decide (103 أيام، 114 يوماً), and a round
 * hundred or 101/102 takes «يوم» (مئة يوم).
 */
export function dayCountUnit(days: number): string {
  const n = Math.abs(Math.floor(Number(days) || 0));
  if (n === 1) return "يوم";
  if (n === 2) return "يومان";
  const r = n % 100;
  if (n >= 100 && r <= 2) return "يوم";
  if (r >= 3 && r <= 10) return "أيام";
  return "يوماً";
}
