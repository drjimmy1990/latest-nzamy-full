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


// Placeholder test values only; they are never real keys.
const MOYASAR_TEST_ENV = {
  secretKey: "sk_test_placeholderSecret123",
  publishableKey: "pk_test_placeholderPublish123",
  webhookSecret: "whsec_placeholder_456",
};
const MOYASAR_LIVE_ENV = {
  secretKey: "sk_live_placeholderSecret789",
  publishableKey: "pk_live_placeholderPublish789",
  webhookSecret: "whsec_placeholder_456",
};

test("moyasar test with test keys is enabled in any environment, without the stub opt-in", () => {
  for (const deploymentEnvironment of [undefined, "production", "staging"]) {
    assert.deepEqual(
      resolvePaymentGatewayState(
        { status: "test", provider: "moyasar" },
        { deploymentEnvironment, allowStubPayments: false, moyasar: MOYASAR_TEST_ENV },
      ),
      { status: "test", provider: "moyasar", disabled: false },
    );
  }
});

test("moyasar live needs live keys and a complete billing company", () => {
  const stored = { status: "live", provider: "moyasar" };
  assert.deepEqual(
    resolvePaymentGatewayState(stored, { moyasar: MOYASAR_LIVE_ENV, billingCompanyComplete: true }),
    { status: "live", provider: "moyasar", disabled: false },
  );
  assert.equal(
    resolvePaymentGatewayState(stored, { moyasar: MOYASAR_LIVE_ENV, billingCompanyComplete: false }).disabled,
    true,
  );
  assert.equal(
    resolvePaymentGatewayState(stored, { moyasar: MOYASAR_LIVE_ENV }).disabled,
    true,
  );
  assert.equal(
    resolvePaymentGatewayState(stored, { moyasar: MOYASAR_TEST_ENV, billingCompanyComplete: true }).disabled,
    true,
  );
  assert.equal(
    resolvePaymentGatewayState(
      { status: "test", provider: "moyasar" },
      { moyasar: MOYASAR_LIVE_ENV, billingCompanyComplete: true },
    ).disabled,
    true,
  );
});

test("the stub never goes live, even with every runtime flag set", () => {
  assert.equal(
    resolvePaymentGatewayState(
      { status: "live", provider: "stub" },
      {
        deploymentEnvironment: "staging",
        allowStubPayments: true,
        moyasar: MOYASAR_LIVE_ENV,
        billingCompanyComplete: true,
      },
    ).disabled,
    true,
  );
});

test("the public gateway state carries exactly status/provider/disabled and no key", () => {
  for (const [stored, runtime] of [
    [{ status: "test", provider: "moyasar" }, { moyasar: MOYASAR_TEST_ENV }],
    [{ status: "live", provider: "moyasar" }, { moyasar: MOYASAR_LIVE_ENV, billingCompanyComplete: true }],
    [{ status: "live", provider: "moyasar" }, { moyasar: MOYASAR_TEST_ENV }],
  ] as const) {
    const state = resolvePaymentGatewayState(stored, runtime);
    assert.deepEqual(Object.keys(state).sort(), ["disabled", "provider", "status"]);
    const text = JSON.stringify(state);
    for (const secret of [
      ...Object.values(MOYASAR_TEST_ENV),
      ...Object.values(MOYASAR_LIVE_ENV),
    ]) {
      assert.equal(text.includes(secret), false);
    }
  }
});
