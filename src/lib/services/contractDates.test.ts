import test from "node:test";
import assert from "node:assert/strict";
import { renewalNoticeDueOn, contractExpiryState, contractExpiryForStatus, paymentScheduleTotals, isPaymentOverdue } from "./contractDates.ts";
import { parseIsoDate } from "./deadlineEngine.ts";

test("renewal notice is due notice-days before the end date; zero means the end date itself", () => {
  assert.equal(renewalNoticeDueOn("2027-08-31", 30), "2027-08-01");
  assert.equal(renewalNoticeDueOn("2027-08-31", 0), "2027-08-31");
  assert.equal(renewalNoticeDueOn("2027-03-01", 1), "2027-02-28", "crosses a month boundary correctly");
});

test("no end date or a notice period outside the column's CHECK gives null, never a guess", () => {
  assert.equal(renewalNoticeDueOn(null, 30), null);
  assert.equal(renewalNoticeDueOn("", 30), null);
  assert.equal(renewalNoticeDueOn("31/08/2027", 30), null);
  assert.equal(renewalNoticeDueOn("2027-08-31", 366), null);
  assert.equal(renewalNoticeDueOn("2027-08-31", -1), null);
  assert.equal(renewalNoticeDueOn("2027-08-31", 7.5), null);
});

test("expiry state for the list badge", () => {
  const today = parseIsoDate("2026-09-04")!;
  assert.equal(contractExpiryState(null, today), "none");
  assert.equal(contractExpiryState("2026-09-03", today), "expired");
  assert.equal(contractExpiryState("2026-09-04", today), "expiring_soon", "due today is still not expired");
  assert.equal(contractExpiryState("2026-10-04", today), "expiring_soon");
  assert.equal(contractExpiryState("2026-10-05", today), "ok");
});

test("LIVE-F41: a cancelled or terminated contract never counts as expiring or expired", () => {
  const today = parseIsoDate("2026-10-30")!;
  assert.equal(contractExpiryForStatus("cancelled", "2026-11-10", today), "none");
  assert.equal(contractExpiryForStatus("terminated", "2026-11-10", today), "none");
  assert.equal(contractExpiryForStatus("cancelled", "2026-01-01", today), "none");
  assert.equal(contractExpiryForStatus("active", "2026-11-10", today), "expiring_soon");
  assert.equal(contractExpiryForStatus("pending_signature", "2026-11-10", today), "expiring_soon");
  assert.equal(contractExpiryForStatus("active", "2026-01-01", today), "expired");
});

test("payment totals: cancelled rows are out, outstanding is total minus paid", () => {
  const t = paymentScheduleTotals([
    { amountSar: 4000, status: "paid" },
    { amountSar: 3000, status: "pending" },
    { amountSar: 2000, status: "overdue" },
    { amountSar: 9999, status: "cancelled" },
  ]);
  assert.deepEqual(t, { total: 9000, paid: 4000, pending: 3000, overdue: 2000, outstanding: 5000 });
});

test("a pending payment past its date is overdue; paid or undated ones are not", () => {
  const today = parseIsoDate("2026-09-04")!;
  assert.equal(isPaymentOverdue({ dueOn: "2026-09-01", status: "pending" }, today), true);
  assert.equal(isPaymentOverdue({ dueOn: "2026-09-04", status: "pending" }, today), false);
  assert.equal(isPaymentOverdue({ dueOn: "2026-09-01", status: "paid" }, today), false);
  assert.equal(isPaymentOverdue({ dueOn: null, status: "pending" }, today), false);
});
