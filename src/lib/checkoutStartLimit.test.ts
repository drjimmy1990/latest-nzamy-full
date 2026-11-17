/**
 * checkoutStartLimit.test.ts — S5 (owner package 17 Nov, file 04): «الحجز 3
 * كل 10 دقائق لكل مستخدم». The founder seat is reserved inside POST
 * /api/v1/payments/checkout, so the proxy limits that one path, keyed by the
 * verified user (src/proxy.ts applyCheckoutStartLimit).
 *
 * The pure half is exercised; the proxy wiring is read as source (proxy.ts
 * imports next/server, which node:test cannot load).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/checkoutStartLimit.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCheckoutStartRoute,
  checkoutStartKey,
  checkoutStartRefusalAr,
  CHECKOUT_START_POLICY,
  isGeneralRateLimitedApiPath,
} from "./rateLimitRoutes.ts";
import { RateLimiter } from "./rateLimit.ts";

test("isCheckoutStartRoute: POST of the exact checkout path only", () => {
  assert.equal(isCheckoutStartRoute("POST", "/api/v1/payments/checkout"), true);
  assert.equal(isCheckoutStartRoute("post", "/api/v1/payments/checkout"), true);
  // An encoded spelling of the same route is the same route.
  assert.equal(isCheckoutStartRoute("POST", "/api/v1/payments/checkou%74"), true);
  assert.equal(isCheckoutStartRoute("GET", "/api/v1/payments/checkout"), false);
  assert.equal(isCheckoutStartRoute("POST", "/api/v1/payments/checkout/x"), false);
  assert.equal(isCheckoutStartRoute("POST", "/api/v1/payments/webhook"), false);
  assert.equal(isCheckoutStartRoute("POST", "/checkout"), false);
  // The general write bucket still counts it as well.
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/checkout"), true);
});

test("the owner's number: 3 per 10 minutes", () => {
  assert.deepEqual({ ...CHECKOUT_START_POLICY }, { windowMs: 10 * 60 * 1000, max: 3 });
});

test("checkoutStartKey: the user when verified, else the IP, never colliding", () => {
  assert.equal(checkoutStartKey("u-1", "203.0.113.4"), "user:u-1");
  assert.equal(checkoutStartKey(null, "203.0.113.4"), "ip:203.0.113.4");
  assert.equal(checkoutStartKey("", "203.0.113.4"), "ip:203.0.113.4");
  assert.notEqual(checkoutStartKey("203.0.113.4", "x"), checkoutStartKey(null, "203.0.113.4"));
});

test("a fourth start inside 10 minutes is refused for that user only, and the window reopens", () => {
  let now = 1_000_000;
  const limiter = new RateLimiter({ clock: () => now });
  const a = checkoutStartKey("user-a", "198.51.100.1");
  const b = checkoutStartKey("user-b", "198.51.100.1"); // same office address
  for (let i = 0; i < 3; i++) assert.equal(limiter.check("checkout-start", a, CHECKOUT_START_POLICY).allowed, true);
  const fourth = limiter.check("checkout-start", a, CHECKOUT_START_POLICY);
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfterSeconds > 0 && fourth.retryAfterSeconds <= 600);
  assert.equal(limiter.check("checkout-start", b, CHECKOUT_START_POLICY).allowed, true, "another user behind the same IP is not blocked");
  now += 10 * 60 * 1000 + 1;
  assert.equal(limiter.check("checkout-start", a, CHECKOUT_START_POLICY).allowed, true);
});

test("the refusal is Arabic and names the wait", () => {
  assert.equal(checkoutStartRefusalAr(30), "محاولات دفع كثيرة خلال وقت قصير. حاول مرة أخرى بعد دقيقة.");
  assert.equal(checkoutStartRefusalAr(61), "محاولات دفع كثيرة خلال وقت قصير. حاول مرة أخرى بعد دقيقتين.");
  assert.equal(checkoutStartRefusalAr(600), "محاولات دفع كثيرة خلال وقت قصير. حاول مرة أخرى بعد 10 دقائق.");
  assert.match(checkoutStartRefusalAr(Number.NaN), /بعد دقيقة\.$/);
});

const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("proxy: the checkout limit runs right after the sync buckets, before anything else", () => {
  const syncAt = proxy.indexOf("if (rateLimited) return rateLimited;");
  const checkoutAt = proxy.indexOf("const checkoutLimited = await applyCheckoutStartLimit(req, pathname);");
  const quotaAt = proxy.indexOf("const quotaResponse = await applyLibraryReadQuota(req, pathname);");
  assert.ok(syncAt > -1 && checkoutAt > syncAt && checkoutAt < quotaAt);
  assert.ok(proxy.includes("if (checkoutLimited) return checkoutLimited;"));
});

test("proxy: keyed by a VERIFIED getUser(), 429 with Retry-After, fails open", () => {
  const start = proxy.indexOf("async function applyCheckoutStartLimit(");
  const end = proxy.indexOf("\n}\n", start);
  const fn = proxy.slice(start, end);
  assert.ok(fn.includes("if (!isCheckoutStartRoute(req.method, pathname)) return null;"));
  assert.ok(fn.includes("supabase.auth.getUser("), "the user comes from GoTrue");
  assert.ok(!/jwt|atob|split\("\."\)|decode/i.test(fn.replace(/\/\/.*$/gm, "")), "the cookie's JWT is never decoded here");
  assert.ok(fn.includes('rateLimiter.check("checkout-start", checkoutStartKey(userId, ip), CHECKOUT_START_POLICY)'));
  assert.ok(fn.includes("{ status: 429 }"));
  assert.ok(fn.includes('refused.headers.set("Retry-After", String(decision.retryAfterSeconds));'));
  assert.ok(/\} catch \{\n\s*return null;\n\s*\}/.test(fn), "fails open");
});
