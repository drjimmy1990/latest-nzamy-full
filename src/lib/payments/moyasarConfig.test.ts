import assert from "node:assert/strict";
import test from "node:test";
import {
  MOYASAR_DISABLED_MESSAGE_AR,
  billingCompanySettingIssue,
  isBillingCompanyComplete,
  paymentsGatewaySettingIssue,
  resolveMoyasarConfig,
} from "./moyasarConfig.ts";

// Placeholder test values only; they are never real keys.
const TEST_ENV = {
  secretKey: "sk_test_placeholderSecret123",
  publishableKey: "pk_test_placeholderPublish123",
  webhookSecret: "whsec_placeholder_456",
};
const LIVE_ENV = {
  secretKey: "sk_live_placeholderSecret789",
  publishableKey: "pk_live_placeholderPublish789",
  webhookSecret: "whsec_placeholder_456",
};
const COMPLETE_BILLING = {
  legal_name_ar: "شركة نظامي",
  cr_number: "1010000000",
  vat_number: "300000000000003",
  address_ar: "الرياض",
};

test("test mode with test keys is enabled and carries the keys", () => {
  assert.deepEqual(resolveMoyasarConfig({ status: "test", provider: "moyasar" }, TEST_ENV, false), {
    enabled: true,
    mode: "test",
    secretKey: TEST_ENV.secretKey,
    publishableKey: TEST_ENV.publishableKey,
    webhookSecret: TEST_ENV.webhookSecret,
  });
});

test("live mode with live keys and a complete billing company is enabled", () => {
  const cfg = resolveMoyasarConfig({ status: "live", provider: "moyasar" }, LIVE_ENV, true);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.enabled && cfg.mode, "live");
});

test("mode and key-prefix matrix: every mismatch is disabled", () => {
  const cases: Array<[string, unknown, Parameters<typeof resolveMoyasarConfig>[1], boolean]> = [
    ["test + sk_live", { status: "test", provider: "moyasar" }, { ...TEST_ENV, secretKey: LIVE_ENV.secretKey }, true],
    ["test + pk_live", { status: "test", provider: "moyasar" }, { ...TEST_ENV, publishableKey: LIVE_ENV.publishableKey }, true],
    ["live + sk_test", { status: "live", provider: "moyasar" }, { ...LIVE_ENV, secretKey: TEST_ENV.secretKey }, true],
    ["live + pk_test", { status: "live", provider: "moyasar" }, { ...LIVE_ENV, publishableKey: TEST_ENV.publishableKey }, true],
    ["live + incomplete billing", { status: "live", provider: "moyasar" }, LIVE_ENV, false],
    ["missing webhook secret", { status: "test", provider: "moyasar" }, { ...TEST_ENV, webhookSecret: undefined }, true],
    ["blank webhook secret", { status: "test", provider: "moyasar" }, { ...TEST_ENV, webhookSecret: "   " }, true],
    ["missing secret key", { status: "test", provider: "moyasar" }, { ...TEST_ENV, secretKey: undefined }, true],
    ["missing publishable key", { status: "test", provider: "moyasar" }, { ...TEST_ENV, publishableKey: "" }, true],
    ["disabled status", { status: "disabled", provider: "moyasar" }, TEST_ENV, true],
    ["stub provider", { status: "test", provider: "stub" }, TEST_ENV, true],
    ["unknown status", { status: "prod", provider: "moyasar" }, LIVE_ENV, true],
    ["null setting", null, TEST_ENV, true],
    ["array setting", ["test"], TEST_ENV, true],
    ["string setting", "test", TEST_ENV, true],
  ];
  for (const [label, setting, env, billing] of cases) {
    const cfg = resolveMoyasarConfig(setting, env, billing);
    assert.equal(cfg.enabled, false, label);
    assert.equal(typeof (cfg as { reason: string }).reason, "string", label);
  }
});

test("a disabled reason never carries key material", () => {
  const settings = [
    { status: "test", provider: "moyasar" },
    { status: "live", provider: "moyasar" },
  ];
  const envs = [
    { ...TEST_ENV, secretKey: LIVE_ENV.secretKey },
    { ...LIVE_ENV, publishableKey: TEST_ENV.publishableKey },
    { ...TEST_ENV, webhookSecret: undefined },
  ];
  const secrets = [
    TEST_ENV.secretKey, LIVE_ENV.secretKey, TEST_ENV.publishableKey, LIVE_ENV.publishableKey,
    TEST_ENV.webhookSecret,
    Buffer.from(`${TEST_ENV.secretKey}:`).toString("base64"),
    Buffer.from(`${LIVE_ENV.secretKey}:`).toString("base64"),
  ];
  for (const setting of settings) {
    for (const env of envs) {
      const text = JSON.stringify(resolveMoyasarConfig(setting, env, false));
      for (const s of secrets) assert.equal(text.includes(s), false);
      assert.equal(/sk_(test|live)_|pk_(test|live)_/.test(text), false);
    }
  }
});

test("the disabled copy is the brief's sentence", () => {
  assert.equal(MOYASAR_DISABLED_MESSAGE_AR, "الدفع الإلكتروني غير متاح حالياً");
});

test("billing company is complete only with four non-empty strings and a Saudi VAT number", () => {
  assert.equal(isBillingCompanyComplete(COMPLETE_BILLING), true);
  assert.equal(isBillingCompanyComplete(null), false);
  assert.equal(isBillingCompanyComplete(undefined), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, legal_name_ar: null }), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, address_ar: "  " }), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, cr_number: "" }), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, vat_number: "300000000000004" }), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, vat_number: "200000000000003" }), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, vat_number: "30000000000003" }), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, vat_number: "3000000000000003" }), false);
  assert.equal(isBillingCompanyComplete({ ...COMPLETE_BILLING, vat_number: 300000000000003 }), false);
  // The seeded empty row is incomplete.
  assert.equal(
    isBillingCompanyComplete({ legal_name_ar: null, cr_number: null, vat_number: null, address_ar: null }),
    false,
  );
});

test("billing_company admin validator: exactly four keys, string|null each, VAT format when given", () => {
  assert.equal(billingCompanySettingIssue(COMPLETE_BILLING), null);
  assert.equal(
    billingCompanySettingIssue({ legal_name_ar: null, cr_number: null, vat_number: null, address_ar: null }),
    null,
  );
  assert.equal(billingCompanySettingIssue({ ...COMPLETE_BILLING, vat_number: null }), null);
  for (const bad of [
    null,
    "x",
    [],
    { legal_name_ar: "a", cr_number: "b", vat_number: "300000000000003" },
    { ...COMPLETE_BILLING, extra: "x" },
    { ...COMPLETE_BILLING, cr_number: 1010000000 },
    { ...COMPLETE_BILLING, vat_number: "123" },
    { ...COMPLETE_BILLING, vat_number: "300000000000004" },
  ]) {
    assert.equal(typeof billingCompanySettingIssue(bad), "string", JSON.stringify(bad));
  }
});

test("payments_gateway admin validator: moyasar test/live, stub unchanged, live needs billing", () => {
  const off = { stubAllowed: false, billingCompanyComplete: false };
  const on = { stubAllowed: true, billingCompanyComplete: true };

  assert.equal(paymentsGatewaySettingIssue({ status: "disabled", provider: null }, off), null);
  assert.equal(paymentsGatewaySettingIssue({ status: "disabled" }, off), null);
  assert.equal(paymentsGatewaySettingIssue({ status: "disabled", provider: "moyasar" }, off), null);
  assert.equal(paymentsGatewaySettingIssue({ status: "test", provider: "moyasar" }, off), null);
  assert.equal(paymentsGatewaySettingIssue({ status: "live", provider: "moyasar" }, on), null);

  // live while billing_company is incomplete is refused
  assert.equal(
    typeof paymentsGatewaySettingIssue({ status: "live", provider: "moyasar" }, { stubAllowed: true, billingCompanyComplete: false }),
    "string",
  );
  // the stub keeps its old gate
  assert.equal(paymentsGatewaySettingIssue({ status: "test", provider: "stub" }, on), null);
  assert.equal(typeof paymentsGatewaySettingIssue({ status: "test", provider: "stub" }, off), "string");
  assert.equal(typeof paymentsGatewaySettingIssue({ status: "live", provider: "stub" }, on), "string");
  // anything else is refused
  for (const bad of [
    null,
    "live",
    [],
    { status: "live", provider: "other" },
    { status: "test", provider: null },
    { status: "prod", provider: "moyasar" },
    { status: "disabled", provider: "other" },
  ]) {
    assert.equal(typeof paymentsGatewaySettingIssue(bad, on), "string", JSON.stringify(bad));
  }
});

test("source contract: the admin route, the status route and access-control are wired", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const read = (rel: string) => readFileSync(join(import.meta.dirname, rel), "utf8");

  const settings = read("../../app/api/v1/admin/settings/route.ts");
  assert.match(settings, /"billing_company",/);
  assert.match(settings, /"points_enforcement",/);
  assert.match(settings, /billing_company:\s*billingCompanySettingIssue/);
  assert.match(settings, /points_enforcement:/);
  assert.match(settings, /return paymentsGatewaySettingIssue\(value,/);
  assert.match(settings, /await validate\(value, \{ billingCompanyComplete: readBillingCompanyComplete \}\)/);
  assert.doesNotMatch(settings, /live غير مدعوم بعد/);

  const status = read("../../app/api/v1/payments/status/route.ts");
  assert.match(status, /NextResponse\.json\(\{ status, provider, disabled \}/);

  const access = read("../access-control.ts");
  assert.match(access, /secretKey: process\.env\.MOYASAR_SECRET_KEY/);
  assert.match(access, /publishableKey: process\.env\.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY/);
  assert.match(access, /webhookSecret: process\.env\.MOYASAR_WEBHOOK_SECRET/);
  assert.match(access, /billingCompanyComplete: isBillingCompanyComplete\(byKey\.get\("billing_company"\)\)/);
});
