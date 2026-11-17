/**
 * chartBuckets.ts — the periods the lawyer finance chart («توزيع الإيرادات
 * والتحصيل») draws, derived from the invoices' own dates.
 *
 * Pure: no imports, so `node --test` loads it directly (chartBuckets.test.ts).
 *
 * N07-64 (owner, 13-Nov package): the monthly view used to keep only the months
 * that HAD invoices. A practice that billed in one month drew one bucket, the
 * chart stretched that one bar across the whole width, and with the old
 * `rx = width / 2` it became a giant oval. The monthly view is now always six
 * consecutive months, an empty month drawn as 0.
 */

export type ChartBucket = { sort: number; label: string; paid: number; pending: number };

export type BucketKey = { key: string; sort: number; label: string };

/** The minimal invoice shape the chart reads (the page's rows carry more). */
export type ChartInvoice = {
  year?: unknown;
  month?: unknown;
  quarter?: unknown;
  totalFee?: unknown;
  paidAmount?: unknown;
};

/**
 * Gregorian month names. The server derives `month`/`quarter`/`year` from
 * `payments.created_at` with getMonth()/getFullYear() — Gregorian — while the
 * date printed on a fee card is Hijri (ar-SA = Umm al-Qura, as elsewhere on the
 * lawyer dashboard). So the axis labels carry the Gregorian year explicitly,
 * and a month is never read as a Hijri one. Unifying the two calendars across
 * the product is the owner's call, not this chart's.
 */
export const GREGORIAN_MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/** What is still owed on an invoice, never negative. */
export const remainderOf = (inv: ChartInvoice): number =>
  Math.max((Number(inv?.totalFee) || 0) - (Number(inv?.paidAmount) || 0), 0);

/**
 * Groups invoices into the periods `bucketOf` names, oldest first, keeping the
 * `keepMostRecent` latest. An invoice that cannot be dated is left out rather
 * than put in an invented period.
 */
export function groupInvoices(
  invoices: readonly ChartInvoice[],
  bucketOf: (inv: ChartInvoice) => BucketKey | null,
  keepMostRecent: number,
): ChartBucket[] {
  const map = new Map<string, ChartBucket>();
  for (const inv of invoices) {
    const b = bucketOf(inv);
    if (!b) continue;
    const cur = map.get(b.key) ?? { sort: b.sort, label: b.label, paid: 0, pending: 0 };
    cur.paid += Number(inv.paidAmount) || 0;
    cur.pending += remainderOf(inv);
    map.set(b.key, cur);
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort).slice(-keepMostRecent);
}

/** y*12 + m (m = 1..12): consecutive integers across a year boundary. */
const monthSort = (year: number, month: number) => year * 12 + month;

function monthOfSort(sort: number): { year: number; month: number } {
  const month = ((sort - 1) % 12 + 12) % 12 + 1;
  return { year: (sort - month) / 12, month };
}

export function monthLabel(year: number, month: number): string {
  return `${GREGORIAN_MONTHS_AR[month - 1]} ${year}`;
}

/** The month an invoice belongs to, or null when its stamp is not a real month. */
export function monthBucketOf(inv: ChartInvoice): BucketKey | null {
  const y = Number(inv.year);
  const m = Number(inv.month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return { key: `${y}-${m}`, sort: monthSort(y, m), label: monthLabel(y, m) };
}

/**
 * The last `months` consecutive Gregorian months, each with its paid and
 * outstanding totals — 0 for a month with no invoices.
 *
 * The window ends at the current month, or at the latest invoice month when an
 * invoice is dated later than `now`. No datable invoice at all → [] (the page
 * shows its honest empty state instead of a chart of zeros).
 *
 * `now` is a parameter, never read here: the page passes the browser's clock
 * (the invoices load client-side, so the server render takes the [] path).
 */
export function lastMonthsBuckets(invoices: readonly ChartInvoice[], months: number, now: Date): ChartBucket[] {
  const count = Math.max(1, Math.floor(months));
  const grouped = groupInvoices(invoices, monthBucketOf, Number.MAX_SAFE_INTEGER);
  if (grouped.length === 0) return [];

  const bySort = new Map(grouped.map((b) => [b.sort, b]));
  const nowSort = monthSort(now.getFullYear(), now.getMonth() + 1);
  const end = Math.max(nowSort, grouped[grouped.length - 1].sort);

  const out: ChartBucket[] = [];
  for (let sort = end - count + 1; sort <= end; sort++) {
    const hit = bySort.get(sort);
    if (hit) {
      out.push(hit);
    } else {
      const { year, month } = monthOfSort(sort);
      out.push({ sort, label: monthLabel(year, month), paid: 0, pending: 0 });
    }
  }
  return out;
}
