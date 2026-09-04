import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlyBuckets,
  bucketsHaveData,
  sumBuckets,
  monthGrowthPct,
  formatSarAr,
  monthLabelAr,
} from "./revenueMath.ts";

test("buildMonthlyBuckets returns exactly N months, oldest first, ending at the reference month", () => {
  const reference = new Date(Date.UTC(2026, 3, 15)); // April 2026
  const buckets = buildMonthlyBuckets([], reference, 6);
  assert.equal(buckets.length, 6);
  assert.deepEqual(
    buckets.map((b) => b.key),
    ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"],
  );
  assert.equal(buckets[buckets.length - 1].labelAr, "أبريل");
  assert.ok(buckets.every((b) => b.total === 0 && b.count === 0));
});

test("buildMonthlyBuckets crosses a year boundary correctly", () => {
  const reference = new Date(Date.UTC(2026, 1, 1)); // February 2026
  const buckets = buildMonthlyBuckets([], reference, 3);
  assert.deepEqual(
    buckets.map((b) => b.key),
    ["2025-12", "2026-01", "2026-02"],
  );
});

test("buildMonthlyBuckets sums real rows into the right month and drops out-of-window rows", () => {
  const reference = new Date(Date.UTC(2026, 3, 30));
  const rows = [
    { amount: 1000, occurredAt: "2026-04-05T10:00:00Z" },
    { amount: 500, occurredAt: "2026-04-20T10:00:00Z" },
    { amount: 2000, occurredAt: "2026-03-01T10:00:00Z" },
    { amount: 9999, occurredAt: "2020-01-01T10:00:00Z" }, // outside the 6-month window
  ];
  const buckets = buildMonthlyBuckets(rows, reference, 6);
  const april = buckets.find((b) => b.key === "2026-04")!;
  const march = buckets.find((b) => b.key === "2026-03")!;
  assert.equal(april.total, 1500);
  assert.equal(april.count, 2);
  assert.equal(march.total, 2000);
  assert.equal(march.count, 1);
  assert.equal(sumBuckets(buckets), 3500, "the dropped 9999 must not leak into the total");
});

test("buildMonthlyBuckets ignores a row with an unparsable date instead of throwing", () => {
  const reference = new Date(Date.UTC(2026, 3, 1));
  const buckets = buildMonthlyBuckets(
    [{ amount: 100, occurredAt: "not-a-date" }],
    reference,
    6,
  );
  assert.equal(sumBuckets(buckets), 0);
});

test("bucketsHaveData is true only once a bucket holds a real row", () => {
  const reference = new Date(Date.UTC(2026, 3, 1));
  assert.equal(bucketsHaveData(buildMonthlyBuckets([], reference, 6)), false);
  assert.equal(
    bucketsHaveData(buildMonthlyBuckets([{ amount: 0, occurredAt: "2026-04-01" }], reference, 6)),
    true,
    "a real zero-amount row is still data",
  );
});

test("monthGrowthPct is null unless both months have a ledger row", () => {
  assert.equal(monthGrowthPct({ total: 200, count: 1 }, { total: 0, count: 0 }), null);
  assert.equal(monthGrowthPct({ total: 0, count: 0 }, { total: 100, count: 1 }), null);
  assert.equal(monthGrowthPct({ total: 0, count: 0 }, { total: 0, count: 0 }), null);
});

test("monthGrowthPct is null when the base month summed to zero, even with rows", () => {
  assert.equal(monthGrowthPct({ total: 500, count: 2 }, { total: 0, count: 1 }), null);
});

test("monthGrowthPct computes a signed percentage when both months carry real totals", () => {
  assert.equal(monthGrowthPct({ total: 150, count: 2 }, { total: 100, count: 3 }), 50);
  assert.equal(monthGrowthPct({ total: 80, count: 1 }, { total: 100, count: 1 }), -20);
});

test("formatSarAr — Arabic-Indic digits, Arabic thousands separator, whole riyals have no fraction", () => {
  assert.equal(formatSarAr(301000), "٣٠١٬٠٠٠ ر.س");
  assert.equal(formatSarAr(0), "٠ ر.س");
  assert.equal(formatSarAr(950), "٩٥٠ ر.س");
});

test("formatSarAr shows the fraction only when there is one, with the Arabic decimal separator", () => {
  assert.equal(formatSarAr(1500.5), "١٬٥٠٠٫٥٠ ر.س");
  assert.equal(formatSarAr(1500.0), "١٬٥٠٠ ر.س");
});

test("formatSarAr on a negative amount (a refund) keeps the sign in front", () => {
  assert.equal(formatSarAr(-250), "-٢٥٠ ر.س");
});

test("formatSarAr returns an em dash for a non-finite input rather than 'NaN ر.س'", () => {
  assert.equal(formatSarAr(NaN), "—");
  assert.equal(formatSarAr(Infinity), "—");
});

test("monthLabelAr covers all 12 months and rejects anything out of range", () => {
  assert.equal(monthLabelAr(0), "يناير");
  assert.equal(monthLabelAr(11), "ديسمبر");
  assert.equal(monthLabelAr(12), null);
  assert.equal(monthLabelAr(-1), null);
});
