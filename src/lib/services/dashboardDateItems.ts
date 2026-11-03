/**
 * dashboardDateItems.ts — where a home-page date row leads, and what the
 * «مواعيد حرجة» card may claim about how many there are.
 *
 * CODE-F16 (owner code review 2026-10-30): the «مواعيد حرجة» card mixes
 * hearings and deadlines-table rows, but every link on it — the urgent
 * banner, «و N موعد حرج آخر» — went to /dashboard/lawyer/hearings, so a
 * deadline opened the hearings diary where it does not exist. Each row now
 * carries its source and case, and opens its own record's tab.
 *
 * CODE-F14: the counters were the length of capped preview lists (50
 * hearings, 10 deadlines). The route now asks the database for exact counts;
 * a count it could not read is `null` — «غير معروف» — never a guess.
 *
 * Pure — `node --test` loads it.
 */

export type DashboardDateSource = "hearing" | "deadline";

export function dashboardItemHref(item: { source: DashboardDateSource; caseId: string | null }): string {
  if (item.source === "deadline") {
    return item.caseId ? `/dashboard/lawyer/cases/${encodeURIComponent(item.caseId)}?tab=deadlines` : "/dashboard/lawyer/deadlines";
  }
  return item.caseId ? `/dashboard/lawyer/cases/${encodeURIComponent(item.caseId)}?tab=hearings` : "/dashboard/lawyer/hearings";
}

/** The «more» link: the radar when any hidden row may be a deadline, else the diary. */
export function moreCriticalHref(hasDeadlineRows: boolean): string {
  return hasDeadlineRows ? "/dashboard/lawyer/deadlines" : "/dashboard/lawyer/hearings";
}

/** Sum of two exact counts; unknown when either part is unknown. */
export function sumKnown(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

/** How many rows the card is not showing — null when the total is unknown. */
export function hiddenCount(total: number | null, shown: number): number | null {
  return total === null ? null : Math.max(0, total - shown);
}
