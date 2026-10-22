import { test } from "node:test";
import assert from "node:assert/strict";
import { refundDecision, canOfferRefund } from "./refundDecision.ts";
const now = new Date("2026-10-22T12:00:00Z");
const base = { status: "paid", kind: "plan", paid_at: "2026-10-22T10:01:00Z" };
test("refund selects void only under 90 minutes after payment, refund from 90 minutes on", () => {
  const usage = { pointsUsedFromOrderLot: 0, planPointsUsedPct: 0 };
  // now = 12:00Z
  assert.equal(refundDecision({ ...base, paid_at: "2026-10-22T10:31:00Z" }, now, usage)?.method, "void"); // 89 min
  assert.equal(refundDecision({ ...base, paid_at: "2026-10-22T11:59:00Z" }, now, usage)?.method, "void"); // 1 min
  assert.equal(refundDecision({ ...base, paid_at: "2026-10-22T10:30:00Z" }, now, usage)?.method, "refund"); // exactly 90 min
  assert.equal(refundDecision({ ...base, paid_at: "2026-10-22T10:29:00Z" }, now, usage)?.method, "refund"); // 91 min
  assert.equal(refundDecision({ ...base, paid_at: "2026-10-22T10:01:00Z" }, now, usage)?.method, "refund"); // 1 h 59 min: was void under the 2 h rule
});
test("closed orders and invalid dates cannot be refunded", () => {
  for (const change of [{ status: "refunded" }, { status: "failed" }, { paid_at: null }, { paid_at: "bad" }]) assert.equal(refundDecision({ ...base, ...change }, now, { pointsUsedFromOrderLot: 0, planPointsUsedPct: 0 }), null);
});
test("used points warn and reverse unspent points with plan or topup", () => {
  const plan = refundDecision(base, now, { pointsUsedFromOrderLot: 100, planPointsUsedPct: 6 });
  assert.ok(plan?.warnings.length);
  assert.deepEqual(plan?.reverse, ["cancel_plan", "revoke_lot"]);
  const topup = refundDecision({ ...base, kind: "topup" }, now, { pointsUsedFromOrderLot: 1, planPointsUsedPct: 0 });
  assert.deepEqual(topup?.reverse, ["revoke_lot"]);
  assert.ok(topup?.warnings.length);
});
test("the admin list offers a refund only for paid platform orders with a known mode", () => {
  assert.equal(canOfferRefund({ status: "paid", merchant: "platform", live: false }), true);
  assert.equal(canOfferRefund({ status: "paid", merchant: "platform", live: true }), true);
  for (const change of [{ merchant: "office" }, { live: null }, { status: "refunded" }, { status: "voided" }]) {
    assert.equal(canOfferRefund({ status: "paid", merchant: "platform", live: false, ...change }), false);
  }
});
