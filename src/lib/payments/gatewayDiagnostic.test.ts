/**
 * RUN: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/payments/gatewayDiagnostic.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GATEWAY_REASON_FALLBACK_AR,
  buildGatewayDiagnostic,
  gatewayReasonAr,
  keyMode,
} from "./gatewayDiagnostic.ts";
import { resolveMoyasarConfig } from "./moyasarConfig.ts";

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
const TEST = { status: "test", provider: "moyasar" };
const LIVE = { status: "live", provider: "moyasar" };

test("keyMode: by the key's own prefix; blank is missing; anything else is other", () => {
  assert.equal(keyMode("sk_test_x", "sk"), "test");
  assert.equal(keyMode("  sk_live_x ", "sk"), "live");
  assert.equal(keyMode("pk_test_x", "pk"), "test");
  assert.equal(keyMode("pk_live_x", "pk"), "live");
  for (const v of [undefined, null, "", "   ", 42]) assert.equal(keyMode(v, "sk"), "missing", String(v));
  // a key in the wrong slot is not "test"/"live"
  assert.equal(keyMode("pk_test_x", "sk"), "other");
  assert.equal(keyMode("sk_live_x", "pk"), "other");
  assert.equal(keyMode("sk_test", "sk"), "other");
  assert.equal(keyMode("SK_TEST_x", "sk"), "other");
});

/** One fixture per disabled reason resolveMoyasarConfig can give. */
const DISABLED_CASES: Array<[string, unknown, Record<string, string | undefined>, boolean, string]> = [
  ["missing setting", null, TEST_ENV, false, "إعداد بوابة الدفع غير محفوظ أو تالف"],
  ["provider stub", { status: "test", provider: "stub" }, TEST_ENV, false, "مزوّد الدفع ليس ميسّر"],
  ["status disabled", { status: "disabled", provider: "moyasar" }, TEST_ENV, false, "حالة البوابة معطّلة"],
  ["no secret key", TEST, { ...TEST_ENV, secretKey: "" }, false, "المفتاح السري غير مضبوط في الخادم"],
  ["no publishable key", TEST, { ...TEST_ENV, publishableKey: undefined }, false, "المفتاح العام غير مضبوط في الخادم"],
  ["no webhook secret", TEST, { ...TEST_ENV, webhookSecret: " " }, false, "سر Webhook غير مضبوط في الخادم"],
  ["live secret in test", TEST, { ...TEST_ENV, secretKey: LIVE_ENV.secretKey }, false, "المفتاح السري لا يطابق الوضع المختار (تجريبي)"],
  [
    "live publishable in test (the production incident)",
    TEST,
    { ...TEST_ENV, publishableKey: LIVE_ENV.publishableKey },
    false,
    "المفتاح العام لا يطابق الوضع المختار (تجريبي) — المفتاح العام يُضمَّن عند البناء، فأعد النشر بعد تعديله",
  ],
  ["test secret in live", LIVE, { ...LIVE_ENV, secretKey: TEST_ENV.secretKey }, true, "المفتاح السري لا يطابق الوضع المختار (مباشر)"],
  ["live without billing company", LIVE, LIVE_ENV, false, "الوضع المباشر يحتاج بيانات المنشأة كاملة"],
];

for (const [name, setting, env, billing, expected] of DISABLED_CASES) {
  test(`reason → Arabic: ${name}`, () => {
    const cfg = resolveMoyasarConfig(setting, env, billing);
    assert.equal(cfg.enabled, false);
    if (cfg.enabled) return;
    assert.equal(gatewayReasonAr(cfg.reason), expected, cfg.reason);
    assert.notEqual(gatewayReasonAr(cfg.reason), GATEWAY_REASON_FALLBACK_AR);
  });
}

test("every reason string in moyasarConfig.ts has its own Arabic (a new one fails here)", () => {
  const src = readFileSync(join(import.meta.dirname, "moyasarConfig.ts"), "utf8");
  const fn = src.slice(src.indexOf("export function resolveMoyasarConfig("), src.indexOf("// ─── billing_company"));
  const reasons = [...fn.matchAll(/reason: (["`])([^"`]+)\1/g)].map((m) => m[2]);
  assert.ok(reasons.length >= 9, "the reason scan found too few reasons");
  for (const raw of reasons) {
    const variants = raw.includes("${mode}") ? ["test", "live"].map((m) => raw.replace("${mode}", m)) : [raw];
    for (const reason of variants) {
      const ar = gatewayReasonAr(reason);
      assert.ok(ar && ar !== GATEWAY_REASON_FALLBACK_AR, reason);
    }
  }
});

test("an unknown reason gets the generic Arabic, never the English; no reason is null", () => {
  assert.equal(gatewayReasonAr("something new"), GATEWAY_REASON_FALLBACK_AR);
  assert.equal(gatewayReasonAr(null), null);
  assert.equal(gatewayReasonAr(undefined), null);
  assert.equal(gatewayReasonAr(""), null);
});

test("diagnostic: test mode with test keys is on, and no key material is in the result", () => {
  const d = buildGatewayDiagnostic(TEST, TEST_ENV, false);
  assert.deepEqual(d, {
    saved: { status: "test", provider: "moyasar" },
    effective: { enabled: true, mode: "test", reasonAr: null },
    keys: { secretKeyMode: "test", publishableKeyMode: "test", webhookSecretSet: true },
  });
  const json = JSON.stringify(d);
  for (const v of Object.values(TEST_ENV)) assert.equal(json.includes(v), false, "key material leaked");
  assert.equal(/placeholder|whsec|sk_|pk_/.test(json), false);
});

test("diagnostic: live mode with live keys and billing is on, and leaks nothing", () => {
  const d = buildGatewayDiagnostic(LIVE, LIVE_ENV, true);
  assert.deepEqual(d.effective, { enabled: true, mode: "live", reasonAr: null });
  assert.deepEqual(d.keys, { secretKeyMode: "live", publishableKeyMode: "live", webhookSecretSet: true });
  const json = JSON.stringify(d);
  for (const v of Object.values(LIVE_ENV)) assert.equal(json.includes(v), false, "key material leaked");
});

test("diagnostic: the production incident — test saved, pk_live_ built in", () => {
  const d = buildGatewayDiagnostic(TEST, { ...TEST_ENV, publishableKey: LIVE_ENV.publishableKey }, false);
  assert.equal(d.effective.enabled, false);
  assert.equal(d.effective.mode, null);
  assert.match(d.effective.reasonAr ?? "", /^المفتاح العام لا يطابق الوضع المختار/);
  assert.deepEqual(d.keys, { secretKeyMode: "test", publishableKeyMode: "live", webhookSecretSet: true });
});

test("diagnostic: saved echoes only known status/provider strings, never the stored object", () => {
  assert.deepEqual(buildGatewayDiagnostic(null, {}, false).saved, { status: null, provider: null });
  assert.deepEqual(buildGatewayDiagnostic([TEST], {}, false).saved, { status: null, provider: null });
  assert.deepEqual(
    buildGatewayDiagnostic({ status: "on", provider: "<script>", extra: "x" }, {}, false).saved,
    { status: null, provider: null },
  );
  assert.deepEqual(buildGatewayDiagnostic({ status: "disabled", provider: null }, {}, false).saved, {
    status: "disabled",
    provider: null,
  });
  assert.deepEqual(buildGatewayDiagnostic({}, {}, false).keys, {
    secretKeyMode: "missing",
    publishableKeyMode: "missing",
    webhookSecretSet: false,
  });
});

test("source contract: the route is staff-gated, no-store, and returns only the diagnostic", () => {
  const route = readFileSync(
    join(import.meta.dirname, "../../app/api/v1/admin/payments/gateway-status/route.ts"),
    "utf8",
  );
  assert.match(route, /await requireStaff\("payments\.read"\)/);
  assert.match(route, /if \(!gate\.ok\) return gate\.response;/);
  assert.match(route, /getPaymentGatewayDiagnostic\(\)/);
  assert.equal((route.match(/"Cache-Control": "private, no-store"/g) ?? []).length >= 2, true);
  assert.doesNotMatch(route, /process\.env/);
  assert.doesNotMatch(route, /console\.(log|info|debug)/);
  assert.doesNotMatch(route, /export (async function|const) (POST|PUT|PATCH|DELETE)\b/);

  const access = readFileSync(join(import.meta.dirname, "../access-control.ts"), "utf8");
  const start = access.indexOf("export async function getPaymentGatewayDiagnostic(");
  assert.ok(start > -1);
  const fn = access.slice(start, access.indexOf("\nexport ", start + 1));
  assert.match(fn, /buildGatewayDiagnostic\(/);
  assert.match(fn, /moyasarEnv\(\)/);
  assert.match(fn, /if \(error\)[\s\S]*?return null;/, "a read error is null (a 503), never a fake disabled state");
});
