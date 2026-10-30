import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeMonthRevenue, riyadhMonthBounds, isMissingTable, type InvoicePaymentRow } from "./monthRevenue.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const oct = riyadhMonthBounds("2026-10-30")!;
const inv = (id: string, amount: number, status: string, created_at: string, metadata: Record<string, unknown> = {}): InvoicePaymentRow =>
  ({ id, amount, status, created_at, metadata: { invoice: true, ...metadata } });

test("the Riyadh month starts at 00:00 +03:00 — 21:00 UTC the evening before", () => {
  assert.equal(new Date(oct.start).toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(new Date(oct.end).toISOString(), "2026-10-31T21:00:00.000Z");
  assert.equal(new Date(riyadhMonthBounds("2026-12-05")!.end).toISOString(), "2026-12-31T21:00:00.000Z");
  assert.equal(riyadhMonthBounds("bad"), null);
});

test("CODE-F15: a September invoice collected in October is October's revenue; partial collections count", () => {
  const invoices = [
    inv("a", 5000, "paid", "2026-09-10T09:00:00Z"),            // issued Sept, collected Oct in two parts
    inv("b", 3000, "requires_payment", "2026-10-02T09:00:00Z", { paidAmount: 1000 }), // issued Oct, part paid Oct
    inv("c", 2000, "paid", "2026-09-25T09:00:00Z"),            // issued and collected in September
  ];
  const collections = [
    { payment_id: "a", amount: 2000, collected_at: "2026-10-03T08:00:00Z" },
    { payment_id: "a", amount: 3000, collected_at: "2026-10-20T08:00:00Z" },
    { payment_id: "b", amount: 1000, collected_at: "2026-10-04T08:00:00Z" },
    { payment_id: "c", amount: 2000, collected_at: "2026-09-30T20:59:00Z" }, // 23:59 Riyadh, 30 Sept
  ];
  const r = computeMonthRevenue(invoices, collections, oct);
  assert.equal(r.collected, 6000);
  assert.equal(r.issued, 3000);      // only b was issued in October
  assert.equal(r.outstanding, 2000); // b still owes 2000
  assert.equal(r.basis, "ledger");
});

test("before the ledger exists: the invoice's own paidAt decides; a paid invoice with no date is not guessed", () => {
  const invoices = [
    inv("a", 1000, "paid", "2026-09-01T09:00:00Z", { paidAt: "2026-10-01T10:00:00Z", paidAmount: 1000 }),
    inv("b", 800, "paid", "2026-10-01T09:00:00Z"), // no paidAt — date unknown
    inv("c", 900, "requires_payment", "2026-10-01T09:00:00Z", { paidAt: "2026-10-02T10:00:00Z", paidAmount: 400 }),
    { id: "d", amount: 99999, status: "paid", created_at: "2026-10-01T09:00:00Z", metadata: {} }, // not an invoice row — filtered upstream
  ].filter((r) => r.metadata?.invoice === true);
  const r = computeMonthRevenue(invoices, null, oct);
  assert.equal(r.collected, 1400);
  assert.equal(r.outstanding, 500);
  assert.equal(r.basis, "legacy");
});

test("refunded / not_required rows are neither issued nor owed; halalas do not drift", () => {
  const r = computeMonthRevenue([
    inv("a", 100.1, "requires_payment", "2026-10-01T00:00:00Z"),
    inv("b", 200.2, "requires_payment", "2026-10-01T00:00:00Z"),
    inv("x", 500, "refunded", "2026-10-01T00:00:00Z"),
  ], [], oct);
  assert.equal(r.issued, 300.3);
  assert.equal(r.outstanding, 300.3);
  assert.equal(r.collected, 0);
});

test("a missing collections table is recognised; the route reads collections, not created_at", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "PGRST205" }), true);
  assert.equal(isMissingTable({ code: "42501" }), false);
  const route = read("app/api/v1/lawyer/dashboard/summary/route.ts");
  assert.match(route, /\.from\("invoice_collections"\)/);
  assert.match(route, /computeMonthRevenue\(invoices, collections, month\)/);
  assert.doesNotMatch(route, /\.eq\("status", "paid"\)\s*\n\s*\.gte\("created_at", monthStart\)/);
  const page = read("app/dashboard/lawyer/page.tsx");
  assert.match(page, /revenueSub\(/);
});
