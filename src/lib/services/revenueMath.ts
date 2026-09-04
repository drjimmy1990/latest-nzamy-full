/**
 * revenueMath.ts — owner item ١٨٣: the admin revenue page used to render a
 * hardcoded six-month series and four invented KPIs («٣٠١٬٠٠٠ ر.س» etc.) that
 * never moved when the real ledger did. Pure — no I/O, no Date.now(), no
 * Supabase — so every rule here is testable without a database.
 *
 * The route (src/app/api/v1/admin/revenue/route.ts) supplies the reference
 * date and the raw ledger rows (public.payments where status = 'paid', plus
 * public.receipts — the two tables money actually received can appear in;
 * see 20260826_receipts.sql). This module only buckets and formats.
 */

import { toArabicDigits } from "./arabicCount.ts";

/** One row of money received: a paid `payments` row or an issued `receipts` row. */
export interface LedgerRow {
  amount: number;
  /** `payments.created_at` or `receipts.issued_at`, as the DB returned it. */
  occurredAt: string | Date;
}

export interface MonthlyBucket {
  /** "2026-04" — UTC year-month, stable regardless of server timezone. */
  key: string;
  year: number;
  /** 0–11, JS Date convention. */
  month: number;
  labelAr: string;
  total: number;
  /** How many ledger rows fell in this month. The signal for "has data" —
   *  NOT `total > 0`, because a month can hold real rows that sum to zero. */
  count: number;
}

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/** Arabic name of a Gregorian month, 0–11. `null` for anything else. */
export function monthLabelAr(month: number): string | null {
  return Number.isInteger(month) && month >= 0 && month <= 11 ? MONTHS_AR[month] : null;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * The last `months` calendar months ending at `reference`'s month (inclusive),
 * oldest first, each summing the `rows` that fall inside it. UTC throughout:
 * a `timestamptz` column and a bucket boundary must agree on what "the first
 * of the month" means regardless of which timezone the Node process runs in.
 *
 * A row whose `occurredAt` does not parse, or falls outside the window, is
 * silently dropped rather than crashing the whole aggregate — the route
 * already filters by date server-side, so this is a defensive default, not
 * the primary filter.
 */
export function buildMonthlyBuckets(
  rows: readonly LedgerRow[],
  reference: Date,
  months: number,
): MonthlyBucket[] {
  const n = Number.isInteger(months) && months > 0 ? months : 6;
  const refYear = reference.getUTCFullYear();
  const refMonth = reference.getUTCMonth();

  const buckets: MonthlyBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const totalMonthIndex = refYear * 12 + refMonth - i;
    const year = Math.floor(totalMonthIndex / 12);
    const month = ((totalMonthIndex % 12) + 12) % 12;
    buckets.push({
      key: monthKey(year, month),
      year,
      month,
      labelAr: monthLabelAr(month) ?? "—",
      total: 0,
      count: 0,
    });
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const row of rows) {
    const d = row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = byKey.get(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
    if (!bucket) continue; // outside the window
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    bucket.total += amount;
    bucket.count += 1;
  }

  return buckets;
}

/** True once at least one bucket holds a real ledger row. */
export function bucketsHaveData(buckets: readonly MonthlyBucket[]): boolean {
  return buckets.some((b) => b.count > 0);
}

/** Sum of every bucket's total. */
export function sumBuckets(buckets: readonly MonthlyBucket[]): number {
  return buckets.reduce((acc, b) => acc + b.total, 0);
}

/**
 * Percent change from `previous` to `current`, or `null` when either month
 * has no ledger rows at all — the task's rule: "growth percentages only when
 * both months have data". Also `null` when `previous.total` is exactly 0 (a
 * real month that summed to zero): dividing by zero would print `Infinity%`
 * or `-Infinity%`, which is not a percentage anything happened at.
 */
export function monthGrowthPct(
  current: Pick<MonthlyBucket, "total" | "count">,
  previous: Pick<MonthlyBucket, "total" | "count">,
): number | null {
  if (current.count === 0 || previous.count === 0) return null;
  if (previous.total === 0) return null;
  return ((current.total - previous.total) / previous.total) * 100;
}

function groupThousandsAscii(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
}

/**
 * "٣٠١٬٠٠٠ ر.س" — Arabic-Indic digits, Arabic thousands separator, riyal
 * suffix. Fraction shown only when the amount is not a whole riyal, using the
 * Arabic decimal separator «٫» rather than a dot.
 *
 * Deliberately not `toLocaleString("ar-SA")`: that output depends on the
 * runtime's ICU build (see toArabicDigits in arabicCount.ts for the same
 * reasoning), which would make this function's tests assert against the test
 * runner rather than against this code.
 */
export function formatSarAr(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const negative = amount < 0;
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const whole = Math.trunc(rounded);
  const fraction = Math.round((rounded - whole) * 100);
  const grouped = groupThousandsAscii(whole);
  const body =
    fraction > 0
      ? `${toArabicDigits(grouped)}٫${toArabicDigits(String(fraction).padStart(2, "0"))}`
      : toArabicDigits(grouped);
  return `${negative ? "-" : ""}${body} ر.س`;
}
