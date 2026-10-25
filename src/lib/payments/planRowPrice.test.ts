import assert from "node:assert/strict";
import test from "node:test";
import { cyclePrice, cycleUnitAr, monthlyEquivalent, subscriptionCycleAr } from "./planRowPrice.ts";

const lawyer = { price_monthly: 399, price_yearly: 3990 };
const firmQ = { price_monthly: null, price_quarterly: "2990.00", price_semiannual: 5490, price_yearly: 9900 };

test("cyclePrice reads the column of each cycle (numeric strings included)", () => {
  assert.equal(cyclePrice(lawyer, "monthly"), 399);
  assert.equal(cyclePrice(lawyer, "yearly"), 3990);
  assert.equal(cyclePrice(lawyer, "quarterly"), null, "a row before 20261026_10 has no such column");
  assert.equal(cyclePrice(firmQ, "quarterly"), 2990);
  assert.equal(cyclePrice(firmQ, "semiannual"), 5490);
  assert.equal(cyclePrice(firmQ, "monthly"), null);
  assert.equal(cyclePrice(lawyer, "custom"), null);
  assert.equal(cyclePrice(null, "monthly"), null);
});

test("monthlyEquivalent: the cycle's own price over its months; an unpriced quarter / half → yearly / 12; else monthly", () => {
  assert.equal(monthlyEquivalent(lawyer, "monthly"), 399);
  assert.equal(monthlyEquivalent(lawyer, "yearly"), 3990 / 12);
  assert.equal(monthlyEquivalent(firmQ, "quarterly"), 2990 / 3);
  assert.equal(monthlyEquivalent(firmQ, "semiannual"), 5490 / 6);
  assert.equal(monthlyEquivalent(firmQ, "yearly"), 9900 / 12);
  // the old rule for anything else
  assert.equal(monthlyEquivalent(lawyer, "custom"), 399);
  assert.equal(monthlyEquivalent(lawyer, "quarterly"), 3990 / 12, "an unpriced quarter counts at the yearly rate, never the full monthly price");
  assert.equal(monthlyEquivalent(lawyer, "semiannual"), 3990 / 12);
  assert.equal(monthlyEquivalent({ price_monthly: 399 }, "quarterly"), 399, "no yearly price either: the monthly price");
  assert.equal(monthlyEquivalent({ price_yearly: 3990 }, "monthly"), 0, "a monthly subscription never borrows the yearly rate");
  assert.equal(monthlyEquivalent(firmQ, "custom"), 0);
  assert.equal(monthlyEquivalent(null, "yearly"), 0);
});

test("the admin labels name every cycle in Arabic", () => {
  assert.equal(subscriptionCycleAr("monthly"), "شهري");
  assert.equal(subscriptionCycleAr("quarterly"), "ربع سنوي");
  assert.equal(subscriptionCycleAr("semiannual"), "نصف سنوي");
  assert.equal(subscriptionCycleAr("yearly"), "سنوي");
  assert.equal(subscriptionCycleAr("custom"), "مخصص");
  assert.equal(subscriptionCycleAr(undefined), "—");
  assert.equal(cycleUnitAr("quarterly"), "٣ أشهر");
  assert.equal(cycleUnitAr("semiannual"), "٦ أشهر");
  assert.equal(cycleUnitAr("yearly"), "سنة");
  assert.equal(cycleUnitAr("monthly"), "شهر");
});
