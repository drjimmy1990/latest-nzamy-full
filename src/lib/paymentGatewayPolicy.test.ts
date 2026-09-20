import assert from "node:assert/strict";
import test from "node:test";
import { resolvePaymentGatewayState } from "./paymentGatewayPolicy.ts";

test("payment gateway is fail-closed for missing, malformed, unknown, and live settings", () => {
  for (const value of [
    null,
    "test",
    {},
    { status: "unknown", provider: "stub" },
    { status: "live", provider: "moyasar" },
    { status: "test", provider: "unknown" },
  ]) {
    assert.deepEqual(resolvePaymentGatewayState(value), {
      status: "disabled",
      provider: null,
      disabled: true,
    });
  }
});

test("stub payments require both an explicit non-production environment and opt-in", () => {
  const stored = { status: "test", provider: "stub" };

  assert.equal(
    resolvePaymentGatewayState(stored, {
      deploymentEnvironment: "production",
      allowStubPayments: true,
    }).disabled,
    true,
  );
  assert.equal(
    resolvePaymentGatewayState(stored, {
      deploymentEnvironment: "staging",
      allowStubPayments: false,
    }).disabled,
    true,
  );
  assert.deepEqual(
    resolvePaymentGatewayState(stored, {
      deploymentEnvironment: "staging",
      allowStubPayments: true,
    }),
    { status: "test", provider: "stub", disabled: false },
  );
});

