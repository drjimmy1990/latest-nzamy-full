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

test("source contract: the admin settings page offers only accepted providers and edits billing_company", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const page = readFileSync(join(import.meta.dirname, "../../app/dashboard/admin/settings/page.tsx"), "utf8");
  const options = [...page.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options, ["moyasar", "stub"]);
  assert.match(page, /مدفوعات ميسّر بمفاتيح الاختبار \(لا يُخصم مال حقيقي\)/);
  assert.match(page, /مدفوعات حقيقية، ولا يُتاح حتى تكتمل بيانات المنشأة/);
  assert.doesNotMatch(page, /محول الدفع التجريبي \(stub\) — للاختبار فقط/);
  assert.match(page, /saveSettingKey\("billing_company", billingCompanyValue\(billingCompany\)/);
  for (const key of ["legal_name_ar", "cr_number", "vat_number", "address_ar"]) {
    assert.match(page, new RegExp(`key: "${key}"`));
  }
});

// ─── N1.1: key shape ─────────────────────────────────────────────────────────
// A key copied from Moyasar's masked screen ends in «****…»; a pasted key can
// carry a space or a line break; a truncated paste is too short. Each one is
// refused with its own reason, before the mode-prefix check (a masked live key
// saved in test mode must say "masked", not "wrong mode").

/** A 40-character body, the length of the keys the owner's dashboard shows. */
const BODY40 = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd";

test("N1.1: valid 40-character test and live keys still pass", () => {
  const test40 = { secretKey: `sk_test_${BODY40}`, publishableKey: `pk_test_${BODY40}`, webhookSecret: "whsec_placeholder_456" };
  const live40 = { secretKey: `sk_live_${BODY40}`, publishableKey: `pk_live_${BODY40}`, webhookSecret: "whsec_placeholder_456" };
  assert.equal(resolveMoyasarConfig({ status: "test", provider: "moyasar" }, test40, false).enabled, true);
  assert.equal(resolveMoyasarConfig({ status: "live", provider: "moyasar" }, live40, true).enabled, true);
  // Surrounding whitespace (a trailing newline in .env) is trimmed, as before.
  assert.equal(
    resolveMoyasarConfig({ status: "test", provider: "moyasar" }, { ...test40, secretKey: ` ${test40.secretKey}\n` }, false).enabled,
    true,
  );
});

const MASKED_SK = "sk_test_XzYQHba5GfKfNP**************************";
const MASKED_PK = "pk_test_XzYQHba5GfKfNP**************************";

test("N1.1: a bad key shape is disabled with its own reason", () => {
  const T = { status: "test", provider: "moyasar" };
  const cases: Array<[string, Parameters<typeof resolveMoyasarConfig>[1], RegExp]> = [
    ["masked secret", { ...TEST_ENV, secretKey: MASKED_SK }, /^secret key is masked/],
    ["masked publishable", { ...TEST_ENV, publishableKey: MASKED_PK }, /^publishable key is masked/],
    ["masked webhook secret", { ...TEST_ENV, webhookSecret: "sec_wh_****************" }, /^webhook secret is masked/],
    ["space inside secret", { ...TEST_ENV, secretKey: "sk_test_placeholder Secret123" }, /^secret key contains whitespace/],
    ["newline inside publishable", { ...TEST_ENV, publishableKey: "pk_test_placeholder\nPublish123" }, /^publishable key contains whitespace/],
    ["tab inside webhook secret", { ...TEST_ENV, webhookSecret: "whsec\tplaceholder" }, /^webhook secret contains whitespace/],
    ["truncated secret", { ...TEST_ENV, secretKey: "sk_test_XzYQHba5GfKfNP" }, /^secret key has an invalid length or characters/],
    ["truncated publishable", { ...TEST_ENV, publishableKey: "pk_test_abc" }, /^publishable key has an invalid length or characters/],
    ["over-long secret", { ...TEST_ENV, secretKey: `sk_test_${"a".repeat(81)}` }, /^secret key has an invalid length or characters/],
    ["odd character in secret", { ...TEST_ENV, secretKey: "sk_test_placeholder$ecret123" }, /^secret key has an invalid length or characters/],
  ];
  for (const [label, env, reason] of cases) {
    const cfg = resolveMoyasarConfig(T, env, false);
    assert.equal(cfg.enabled, false, label);
    assert.match((cfg as { reason: string }).reason, reason, label);
  }
});

test("N1.1: a masked LIVE key saved in test mode says masked, not wrong mode", () => {
  const cfg = resolveMoyasarConfig(
    { status: "test", provider: "moyasar" },
    { ...TEST_ENV, secretKey: "sk_live_wBmGtEv5WpmtFM**************************" },
    false,
  );
  assert.equal(cfg.enabled, false);
  assert.match((cfg as { reason: string }).reason, /^secret key is masked/);
});

test("N1.1: a shape reason never carries the key", () => {
  const envs = [
    { ...TEST_ENV, secretKey: MASKED_SK },
    { ...TEST_ENV, publishableKey: MASKED_PK },
    { ...TEST_ENV, secretKey: "sk_test_placeholder Secret123" },
    { ...TEST_ENV, secretKey: "sk_test_XzYQHba5GfKfNP" },
    { ...TEST_ENV, webhookSecret: "sec_wh_****************" },
  ];
  for (const env of envs) {
    const text = JSON.stringify(resolveMoyasarConfig({ status: "test", provider: "moyasar" }, env, false));
    for (const v of Object.values(env)) assert.equal(text.includes(String(v)), false);
    assert.equal(/sk_(test|live)_|pk_(test|live)_|XzYQ|\*\*\*/.test(text), false);
  }
});

test("N1.1: key bodies of the lengths Moyasar's own docs show (21, 24, 40) are valid", () => {
  // Moyasar does not publish a fixed key length; its API docs show bodies of
  // 21 («sk_test_5cD4…»), 24 («sk_test_Mrtw…») and 40 («pk_test_AQpx…»)
  // characters. Shape-only placeholders of those lengths — never real keys.
  const T = { status: "test", provider: "moyasar" };
  for (const len of [16, 21, 24, 40]) {
    const body = "Ab3".repeat(30).slice(0, len);
    const env = { secretKey: `sk_test_${body}`, publishableKey: `pk_test_${body}`, webhookSecret: "whsec_placeholder_456" };
    assert.equal(resolveMoyasarConfig(T, env, false).enabled, true, `body ${len}`);
  }
  // The 14 visible characters of a masked key, stars dropped, are still too short.
  assert.equal(resolveMoyasarConfig(T, { ...TEST_ENV, secretKey: "sk_test_XzYQHba5GfKfNP" }, false).enabled, false);
});
