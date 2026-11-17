/**
 * chartBuckets.test.ts — N07-64: the monthly finance chart is always six
 * consecutive months (an empty month is 0), never only the months that had
 * invoices.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { groupInvoices, lastMonthsBuckets, monthBucketOf, remainderOf } from "./chartBuckets.ts";

// 15 Nov 2026, local time.
const NOV_2026 = new Date(2026, 10, 15);

test("one month of invoices → six consecutive months ending this month, the rest 0", () => {
  const rows = lastMonthsBuckets(
    [
      { year: 2026, month: 11, totalFee: 1000, paidAmount: 400 },
      { year: 2026, month: 11, totalFee: 500, paidAmount: 500 },
    ],
    6,
    NOV_2026,
  );
  assert.deepEqual(rows.map((r) => r.label), [
    "يونيو 2026", "يوليو 2026", "أغسطس 2026", "سبتمبر 2026", "أكتوبر 2026", "نوفمبر 2026",
  ]);
  assert.deepEqual(rows.slice(0, 5).map((r) => r.paid + r.pending), [0, 0, 0, 0, 0]);
  assert.equal(rows[5].paid, 900);
  assert.equal(rows[5].pending, 600);
});

test("the window crosses a year boundary without a gap", () => {
  const rows = lastMonthsBuckets([{ year: 2026, month: 2, totalFee: 100, paidAmount: 0 }], 6, new Date(2026, 1, 10));
  assert.deepEqual(rows.map((r) => r.label), [
    "سبتمبر 2025", "أكتوبر 2025", "نوفمبر 2025", "ديسمبر 2025", "يناير 2026", "فبراير 2026",
  ]);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].sort, rows[i - 1].sort + 1);
  assert.equal(rows[5].pending, 100);
});

test("older invoices fall out of the window; an all-zero window is still six months", () => {
  const rows = lastMonthsBuckets([{ year: 2025, month: 1, totalFee: 100, paidAmount: 100 }], 6, NOV_2026);
  assert.equal(rows.length, 6);
  assert.equal(rows[5].label, "نوفمبر 2026");
  assert.ok(rows.every((r) => r.paid === 0 && r.pending === 0));
});

test("an invoice dated after `now` moves the window's end forward", () => {
  const rows = lastMonthsBuckets([{ year: 2027, month: 1, totalFee: 10, paidAmount: 10 }], 6, NOV_2026);
  assert.equal(rows[5].label, "يناير 2027");
  assert.equal(rows[5].paid, 10);
});

test("nothing datable → [] (the page shows its empty state, not a chart of zeros)", () => {
  assert.deepEqual(lastMonthsBuckets([], 6, NOV_2026), []);
  assert.deepEqual(lastMonthsBuckets([{ year: 2026, month: 13 }, { year: "x", month: 2 }, {}], 6, NOV_2026), []);
});

test("monthBucketOf rejects a non-month; remainderOf is never negative", () => {
  assert.equal(monthBucketOf({ year: 2026, month: 0 }), null);
  assert.equal(monthBucketOf({ year: 2026.5, month: 3 }), null);
  assert.deepEqual(monthBucketOf({ year: "2026", month: "3" }), { key: "2026-3", sort: 2026 * 12 + 3, label: "مارس 2026" });
  assert.equal(remainderOf({ totalFee: 100, paidAmount: 150 }), 0);
});

test("groupInvoices keeps the most recent N periods, oldest first", () => {
  const rows = groupInvoices(
    [{ year: 2024 }, { year: 2026 }, { year: 2025 }],
    (inv) => ({ key: String(inv.year), sort: Number(inv.year), label: `عام ${inv.year}` }),
    2,
  );
  assert.deepEqual(rows.map((r) => r.label), ["عام 2025", "عام 2026"]);
});
