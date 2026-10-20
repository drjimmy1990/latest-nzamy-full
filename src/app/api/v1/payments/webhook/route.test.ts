/**
 * route.test.ts — source contract for POST /api/v1/payments/webhook
 * (Moyasar payments B1, Task 6). The route imports next/server and the
 * service client, so it cannot run under `node --test`; its wiring is pinned
 * in the source. The secret and body check (checkWebhook) and the outcome
 * rules are executed in src/lib/payments/webhookCheck.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneralRateLimitedApiPath } from "../../../../../lib/rateLimitRoutes.ts";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const code = codeOnly(routeSource);
const post = code.slice(code.indexOf("export async function POST("));

test("the secret is checked (checkWebhook, env secret) before any database work; a bad one is 401", () => {
  const checkAt = post.indexOf("checkWebhook(body, process.env.MOYASAR_WEBHOOK_SECRET");
  assert.ok(checkAt > -1, "checkWebhook against MOYASAR_WEBHOOK_SECRET");
  assert.match(post, /status: check\.status/, "401 / 400 from the check");
  for (const later of ["createServiceClient(", "getMoyasarConfig(", "fulfillOrder(", ".from("]) {
    const at = post.indexOf(later);
    assert.ok(at === -1 || at > checkAt, `${later} only after the secret check`);
  }
  assert.doesNotMatch(code, /getMoyasarConfig\(/, "the platform_settings read is fulfillOrder's, not the webhook's");
});

test("the event row is inserted BEFORE fulfilment and its outcome recorded after", () => {
  const insertAt = post.search(/\.from\("payment_webhook_events"\)\s*\.insert\(/);
  const handleAt = post.indexOf("await handleEvent(");
  const updateAt = post.indexOf(".update({ outcome:");
  assert.ok(insertAt > -1, "insert the event");
  assert.ok(handleAt > insertAt, "then handle it");
  assert.ok(updateAt > handleAt, "then record the outcome");
  assert.match(post, /event_id: check\.eventId/);
  assert.match(post, /merchant: "platform"/);
});

test("a repeat event id: a final stored outcome is 200 {duplicate: true}; a pending one runs again", () => {
  assert.match(post, /insertErr\.code [!=]== "23505"/, "23505 = the event id is already recorded");
  assert.match(post, /isFinalWebhookOutcome\(/);
  assert.match(post, /duplicate: true/);
  const dupAt = post.indexOf("duplicate: true");
  const finalAt = post.indexOf("isFinalWebhookOutcome(");
  assert.ok(finalAt > -1 && dupAt > finalAt, "duplicate only after the stored outcome is final");
});

test("payment_paid / payment_failed / payment_faild settle the order found by payment id or metadata.order_id", () => {
  const handler = code.slice(code.indexOf("async function handleEvent("));
  assert.match(handler, /webhookAction\(check\.type\)/);
  assert.match(handler, /\.eq\("moyasar_payment_id", check\.paymentId\)/);
  assert.match(handler, /\?\? check\.orderId/);
  assert.match(
    handler,
    /fulfillOrder\(\{ orderId, paymentId: check\.paymentId, merchant: "platform", liveFlag: check\.live \}\)/,
  );
});

test("payment_refunded / payment_voided only record the event (B1 refunds are admin-initiated)", () => {
  const handler = code.slice(code.indexOf("async function handleEvent("));
  const recordAt = handler.indexOf('action === "record"');
  assert.ok(recordAt > -1);
  const recordArm = handler.slice(recordAt, handler.indexOf("}", recordAt));
  assert.doesNotMatch(recordArm, /fulfillOrder|update\(|insert\(/);
  assert.match(recordArm, /"recorded"/);
});

test("pending → 503 so Moyasar retries; granted / already_done / failed / rejected → 200", () => {
  assert.match(code, /webhookStatusFor\(result\.outcome\)/);
});

test("deploy order: a missing table answers 503 (Moyasar retries), never 500; logged once", () => {
  assert.match(code, /isMissingPaymentsObject\(/);
  assert.match(code, /logMissingOnce\(/);
  assert.doesNotMatch(code, /status: 500/);
});

test("the body's secret_token is never logged or stored", () => {
  for (const line of code.split("\n").filter((l) => /console\.(log|warn|error|info)/.test(l))) {
    assert.doesNotMatch(line, /secret|body\b/i, line);
  }
  const insert = post.slice(post.indexOf('.from("payment_webhook_events")'), post.indexOf("});", post.indexOf('.from("payment_webhook_events")')));
  assert.doesNotMatch(insert, /secret/);
});

test("the webhook is outside the general rate limiter", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/webhook"), false);
});
