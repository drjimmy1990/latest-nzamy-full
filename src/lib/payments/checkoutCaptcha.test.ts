/**
 * checkoutCaptcha.test.ts — S6b: the Turnstile rules of the founder checkout
 * (checkoutCaptcha.ts). The wiring in the route is pinned in
 * src/app/api/v1/payments/checkout/route.test.ts; the order of the check
 * inside startCheckoutWith in checkoutCore.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHECKOUT_CAPTCHA_REFUSED_AR,
  checkoutCaptchaPasses,
  checkoutCaptchaPolicy,
  parseCheckoutTurnstileToken,
} from "./checkoutCaptcha.ts";

test("the refusal copy is the brief's sentence, verbatim", () => {
  assert.equal(CHECKOUT_CAPTCHA_REFUSED_AR, "تعذّر اجتياز التحقق الأمني — أكمله مرة أخرى");
});

test("parseCheckoutTurnstileToken: a non-empty string up to 4096 characters, else null", () => {
  assert.equal(parseCheckoutTurnstileToken({ turnstileToken: " tok " }), "tok");
  const bad: unknown[] = [
    null,
    undefined,
    "tok",
    [],
    {},
    { turnstileToken: "" },
    { turnstileToken: "  " },
    { turnstileToken: 5 },
    { turnstileToken: "x".repeat(4097) },
  ];
  for (const raw of bad) assert.equal(parseCheckoutTurnstileToken(raw), null, String(JSON.stringify(raw)).slice(0, 40));
});

test("checkoutCaptchaPolicy: verify only with the secret AND the build's site key", () => {
  assert.equal(checkoutCaptchaPolicy("s", "site", "production"), "verify");
  assert.equal(checkoutCaptchaPolicy("s", "site", "development"), "verify");
  // no secret
  assert.equal(checkoutCaptchaPolicy(undefined, "site", "production"), "misconfigured");
  assert.equal(checkoutCaptchaPolicy("  ", "site", "production"), "misconfigured");
  assert.equal(checkoutCaptchaPolicy(undefined, "site", "development"), "skip");
  // a secret but no site key: the browser can produce no token at all
  assert.equal(checkoutCaptchaPolicy("s", undefined, "production"), "misconfigured");
  assert.equal(checkoutCaptchaPolicy("s", " ", "production"), "misconfigured");
  assert.equal(checkoutCaptchaPolicy("s", undefined, "test"), "skip");
});

function fetchAnswering(success: boolean | "throw") {
  const calls: Array<{ body: URLSearchParams }> = [];
  const impl = async (_url: string, init: { method: string; body: URLSearchParams }) => {
    calls.push({ body: init.body });
    if (success === "throw") throw new Error("network");
    return { ok: true, json: async () => ({ success }) };
  };
  return { impl, calls };
}

test("misconfigured ALLOWS the sale (a missing key never stops paying customers) and logs loudly; Cloudflare is not asked", async () => {
  const f = fetchAnswering(false);
  const logged: string[] = [];
  const ok = await checkoutCaptchaPasses({
    policy: "misconfigured",
    secret: undefined,
    token: null,
    fetchImpl: f.impl,
    logError: (m) => logged.push(m),
  });
  assert.equal(ok, true);
  assert.equal(f.calls.length, 0);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /MISCONFIGURED/);
  assert.match(logged[0], /TURNSTILE_SECRET_KEY/);
});

test("skip (local work) allows without asking Cloudflare or logging", async () => {
  const f = fetchAnswering(false);
  const logged: string[] = [];
  assert.equal(
    await checkoutCaptchaPasses({ policy: "skip", secret: "", token: null, fetchImpl: f.impl, logError: (m) => logged.push(m) }),
    true,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(logged.length, 0);
});

test("verify: Cloudflare's answer for THIS token decides; a missing token or a network error refuses", async () => {
  const yes = fetchAnswering(true);
  assert.equal(
    await checkoutCaptchaPasses({ policy: "verify", secret: "sec", token: "tok", remoteIp: "203.0.113.9", fetchImpl: yes.impl }),
    true,
  );
  assert.equal(yes.calls[0].body.get("response"), "tok");
  assert.equal(yes.calls[0].body.get("secret"), "sec");
  assert.equal(yes.calls[0].body.get("remoteip"), "203.0.113.9");

  assert.equal(await checkoutCaptchaPasses({ policy: "verify", secret: "sec", token: "tok", fetchImpl: fetchAnswering(false).impl }), false);
  assert.equal(await checkoutCaptchaPasses({ policy: "verify", secret: "sec", token: "tok", fetchImpl: fetchAnswering("throw").impl }), false);
  const none = fetchAnswering(true);
  assert.equal(await checkoutCaptchaPasses({ policy: "verify", secret: "sec", token: null, fetchImpl: none.impl }), false);
  assert.equal(none.calls.length, 0, "no token → refused without a network call");
});
