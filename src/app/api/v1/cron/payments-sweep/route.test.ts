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
  assert.match(routeSource, /\.order\("created_at", \{ ascending: false \}\)/, "initiated orders newest first");
});

test("intent-only initiated orders: Moyasar's paid payment for the order, verified again by fulfillOrder", () => {
  const post = routeSource.slice(routeSource.indexOf("// (b)"));
  const block = post.slice(0, post.indexOf("// (c)"));
  assert.match(block, /\.is\("moyasar_payment_id", null\)/);
  assert.match(block, /\.not\("moyasar_intent_id", "is", null\)/);
  const findAt = block.indexOf("await findPaidPaymentForOrder(row.id)");
  const settleAt = block.indexOf("await settle(row, found.paymentId)");
  assert.ok(findAt > -1 && settleAt > findAt, "list the order's payments, then settle with the paid one");
  assert.match(block, /if \(!found\.paymentId\) \{\s*tally\.intent_unpaid\+\+;\s*continue;/, "none paid → left alone");
  assert.doesNotMatch(block, /update\(/, "the sweep never stamps an unverified payment id");
});

test("paid-but-unfinished orders count their attempts and are given up after SWEEP_MAX_ATTEMPTS", () => {
  const post = routeSource.slice(routeSource.indexOf("// (c)"));
  assert.match(post, /select\("id, merchant, moyasar_payment_id, metadata"\)/);
  assert.match(post, /sweepGaveUp\(row\.metadata\)/);
  assert.match(post, /if \(outcome !== "granted" && outcome !== "already_done"\)[\s\S]{0,200}sweepAttemptPatch\(row\.metadata, row\.moyasar_payment_id/);
  assert.match(post, /await mergePaymentOrderMetadata\(row\.id, patch\)/);
});

test("a missing payments table never answers 500", () => {
  assert.match(routeSource, /isMissingPaymentsObject\(/);
  assert.doesNotMatch(routeSource, /status: 500/);
});

test("the sweep is outside the general rate limiter, like every /api/v1/cron/ route", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/cron/payments-sweep"), false);
});
