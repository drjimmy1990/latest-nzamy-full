import assert from "node:assert/strict";
import test from "node:test";
import { isPaidServiceRequest, paidServiceRequestAllowed } from "./serviceRequestPaymentGate.ts";

test("a request is paid only when payment.amount is a positive number", () => {
  assert.equal(isPaidServiceRequest({ amount: 100 }), true);
  assert.equal(isPaidServiceRequest({ amount: "250" }), true);
  for (const payment of [
    undefined,
    null,
    "100",
    { amount: 0 },
    { amount: "0" },
    { amount: -5 },
    { amount: "abc" },
    { status: "not_required" },
  ]) {
    assert.equal(isPaidServiceRequest(payment), false, JSON.stringify(payment));
  }
});

test("until B3, a paid service request passes only through the enabled stub", () => {
  // stub enabled → allowed
  assert.equal(paidServiceRequestAllowed({ status: "test", provider: "stub", disabled: false }), true);
  // moyasar test / live → refused (B1 sells plans; office payments are B3)
  assert.equal(paidServiceRequestAllowed({ status: "test", provider: "moyasar", disabled: false }), false);
  assert.equal(paidServiceRequestAllowed({ status: "live", provider: "moyasar", disabled: false }), false);
  // disabled → refused
  assert.equal(paidServiceRequestAllowed({ status: "disabled", provider: null, disabled: true }), false);
  assert.equal(paidServiceRequestAllowed({ status: "test", provider: "stub", disabled: true }), false);
});

test("amount 0 never reaches the gateway check (route source contract)", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const route = readFileSync(join(import.meta.dirname, "../../app/api/v1/service-requests/route.ts"), "utf8");
  assert.match(route, /const isPaidRequest = isPaidServiceRequest\(payment\);/);
  assert.match(route, /if \(!paidServiceRequestAllowed\(gateway\)\) \{/);
  assert.match(route, /\{ error: MOYASAR_DISABLED_MESSAGE_AR \},\s*\{ status: 402 \}/);
});
