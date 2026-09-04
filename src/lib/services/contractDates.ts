/**
 * contractDates.ts — the few pure date/number rules of the contract manager.
 * ─────────────────────────────────────────────────────────
 * Built on deadlineEngine's wall-clock date helpers so a contract date and a
 * radar deadline can never disagree about what "day" means. No I/O.
 */

import { addDays, daysUntil, isoDate, parseIsoDate } from "./deadlineEngine.ts";

/**
 * The day the renewal / non-renewal notice is due: `ends_on` minus the
 * contract's notice period. null when there is no end date or the notice
 * period is not a whole number of days in 0..365 (the column's CHECK).
 */
export function renewalNoticeDueOn(endsOn: string | null | undefined, noticeDays: number): string | null {
  if (!endsOn) return null;
  const end = parseIsoDate(endsOn);
  if (!end) return null;
  if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365) return null;
  return isoDate(addDays(end, -noticeDays));
}

export type ContractExpiryState = "none" | "expired" | "expiring_soon" | "ok";

/** «منتهٍ» / «ينتهي خلال ٣٠ يوماً» / fine — for the list badge. */
export function contractExpiryState(endsOn: string | null | undefined, today: Date = new Date(), soonDays = 30): ContractExpiryState {
  if (!endsOn) return "none";
  const left = daysUntil(endsOn, today);
  if (left === null) return "none";
  if (left < 0) return "expired";
  if (left <= soonDays) return "expiring_soon";
  return "ok";
}

export interface PaymentTotals {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  /** total − paid − cancelled */
  outstanding: number;
}

/** Sums a payment schedule by status; cancelled rows count in nothing but `total` is what was ever scheduled minus cancelled. */
export function paymentScheduleTotals(payments: { amountSar: number; status: string }[]): PaymentTotals {
  const t: PaymentTotals = { total: 0, paid: 0, pending: 0, overdue: 0, outstanding: 0 };
  for (const p of payments) {
    const amount = Number.isFinite(p.amountSar) ? p.amountSar : 0;
    if (p.status === "cancelled") continue;
    t.total += amount;
    if (p.status === "paid") t.paid += amount;
    else if (p.status === "overdue") t.overdue += amount;
    else t.pending += amount;
  }
  t.outstanding = Math.max(0, Math.round((t.total - t.paid) * 100) / 100);
  return t;
}

/** A pending payment whose due date has passed is overdue — derived, never stored ahead of time. */
export function isPaymentOverdue(p: { dueOn: string | null; status: string }, today: Date = new Date()): boolean {
  if (p.status !== "pending" || !p.dueOn) return false;
  const left = daysUntil(p.dueOn, today);
  return left !== null && left < 0;
}
