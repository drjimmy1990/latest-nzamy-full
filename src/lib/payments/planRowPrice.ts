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
 * The monthly equivalent of a subscription for MRR: the price of its own
 * cycle divided by the cycle's months (yearly / 12, quarterly / 3,
 * semiannual / 6). A cycle the row does not price, or a 'custom' grant, falls
 * back to price_monthly — the rule these screens used before the new cycles.
 * 0 when nothing is priced.
 */
export function monthlyEquivalent(row: PlanPriceRow | null | undefined, billingCycle: string | null | undefined): number {
  if (!row) return 0;
  const cycle = typeof billingCycle === "string" ? billingCycle : "";
  const own = cyclePrice(row, cycle);
  if (own !== null && isCycle(cycle)) return own / CYCLE_MONTHS[cycle];
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
