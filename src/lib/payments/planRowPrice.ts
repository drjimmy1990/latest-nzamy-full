/**
 * planRowPrice.ts — read a subscription_plans row's price for a billing
 * cycle, for the admin MRR figures (stats, ERP, corporates) and the admin user
 * page. Since 20261026_10 the row has price_quarterly / price_semiannual
 * next to price_monthly / price_yearly; before it, the two new columns are
 * simply absent (undefined) and nothing changes.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { BILLING_LABEL_AR, CYCLE_MONTHS, isBilling, isCycle, type Cycle } from "../pricing/priceBook.ts";

export interface PlanPriceRow {
  price_monthly?: number | string | null;
  price_quarterly?: number | string | null;
  price_semiannual?: number | string | null;
  price_yearly?: number | string | null;
}

const COLUMN: Readonly<Record<Cycle, keyof PlanPriceRow>> = {
  monthly: "price_monthly",
  quarterly: "price_quarterly",
  semiannual: "price_semiannual",
  yearly: "price_yearly",
};

function positive(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** The row's price for one cycle (SAR), or null when the row has none. */
export function cyclePrice(row: PlanPriceRow | null | undefined, cycle: string): number | null {
  if (!row || !isCycle(cycle)) return null;
  return positive(row[COLUMN[cycle]]);
}

/**
 * The monthly equivalent of a subscription for MRR, in this order:
 *   1. the price of its own cycle over the cycle's months (yearly / 12,
 *      quarterly / 3, semiannual / 6);
 *   2. a quarterly or half-yearly subscription whose plan row has no price
 *      for that cycle (a row from before 20261026_10, or an admin grant on a
 *      plan not sold in it): price_yearly / 12 — the nearest committed
 *      price. The full monthly price would count it at the dearest rate
 *      there is (399 a month for a plan sold at 3,990 a year);
 *   3. otherwise price_monthly: a monthly subscription on a row with no
 *      monthly price falls through to here and gets 0, and a 'custom' admin
 *      grant keeps the rule these screens used before the new cycles.
 * 0 when nothing is priced. The amount actually paid lives on the order
 * (payment_orders.total_halalas); this is the list price, as before.
 */
export function monthlyEquivalent(row: PlanPriceRow | null | undefined, billingCycle: string | null | undefined): number {
  if (!row) return 0;
  const cycle = typeof billingCycle === "string" ? billingCycle : "";
  const own = cyclePrice(row, cycle);
  if (own !== null && isCycle(cycle)) return own / CYCLE_MONTHS[cycle];
  if (cycle === "quarterly" || cycle === "semiannual") {
    const yearly = positive(row.price_yearly);
    if (yearly !== null) return yearly / CYCLE_MONTHS.yearly;
  }
  return positive(row.price_monthly) ?? 0;
}

/** «شهري» / «ربع سنوي» / «نصف سنوي» / «سنوي»; «مخصص» for an admin 'custom' grant; «—» otherwise. */
export function subscriptionCycleAr(billingCycle: string | null | undefined): string {
  if (billingCycle === "custom") return "مخصص";
  return isBilling(billingCycle) ? BILLING_LABEL_AR[billingCycle] : "—";
}

/** The unit after a price: «شهر» / «٣ أشهر» / «٦ أشهر» / «سنة». */
export function cycleUnitAr(billingCycle: string | null | undefined): string {
  if (billingCycle === "yearly") return "سنة";
  if (billingCycle === "quarterly") return "٣ أشهر";
  if (billingCycle === "semiannual") return "٦ أشهر";
  return "شهر";
}
