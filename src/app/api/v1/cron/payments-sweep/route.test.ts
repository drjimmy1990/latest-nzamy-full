/**
 * route.test.ts — source contract for POST /api/v1/cron/payments-sweep
 * (Moyasar payments B1, Task 5). The route imports next/server and the
 * service client, so it cannot be executed under `node --test`; its wiring is
 * pinned in the source. The secret check itself (cronSecretMatches) is
 * executed in src/lib/payments/fulfillDecision.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneralRateLimitedApiPath } from "../../../../../lib/rateLimitRoutes.ts";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const helperSource = readFileSync(join(import.meta.dirname, "../../../../../lib/payments/fulfillDecision.ts"), "utf8");

test("the cron secret is checked with timingSafeEqual (through cronSecretMatches) before anything else", () => {
  const post = routeSource.slice(routeSource.indexOf("export async function POST("));
  assert.ok(post.length > 0, "the route exports POST");
  const checkAt = post.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
  assert.ok(checkAt > -1, "the route checks x-cron-secret against CRON_SECRET with cronSecretMatches");
  const unauthorizedAt = post.indexOf("status: 401");
  const clientAt = post.indexOf("createServiceClient(");
  assert.ok(unauthorizedAt > checkAt, "a wrong secret answers 401");
  assert.ok(clientAt > unauthorizedAt, "no database work before the secret is checked");
  assert.doesNotMatch(routeSource, /!==\s*secret|===\s*secret|x-cron-secret"\)\s*[!=]==/, "no plain comparison of the secret");

  const helper = helperSource.slice(helperSource.indexOf("export function cronSecretMatches("));
  assert.match(helper.slice(0, helper.indexOf("\n}\n")), /timingSafeEqual\(/);
});

test("the sweep re-runs fulfillOrder for initiated orders with a payment id and for paid orders not fulfilled", () => {
  assert.match(routeSource, /\.eq\("status", "initiated"\)/);
  assert.match(routeSource, /\.not\("moyasar_payment_id", "is", null\)/);
  assert.match(routeSource, /SWEEP_INITIATED_AFTER_MS/);
  assert.match(routeSource, /\.eq\("status", "paid"\)/);
  assert.match(routeSource, /\.is\("fulfilled_at", null\)/);
  assert.match(routeSource, /RESUME_AFTER_MS/);
  assert.match(routeSource, /\.limit\(SWEEP_BATCH\)/);
  assert.match(routeSource, /fulfillOrder\(\{[^}]*resume: true/, "the sweep is the one caller that resumes");
});

test("initiated orders with only an intent are counted, not guessed at", () => {
  assert.match(routeSource, /intent_only/);
});

test("a missing payments table never answers 500", () => {
  assert.match(routeSource, /isMissingPaymentsObject\(/);
  assert.doesNotMatch(routeSource, /status: 500/);
});

test("the sweep is outside the general rate limiter, like every /api/v1/cron/ route", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/cron/payments-sweep"), false);
});
