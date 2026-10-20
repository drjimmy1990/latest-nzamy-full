/**
 * webhookCheck.test.ts — the pure half of POST /api/v1/payments/webhook
 * (Moyasar payments B1, Task 6): the secret check, the body shape, which
 * events settle an order, and which stored outcomes end a retry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkWebhook,
  isFinalWebhookOutcome,
  modeOfSecretKey,
  webhookAction,
  webhookOutcomeLabel,
  webhookSecretMatches,
  webhookStatusFor,
} from "./webhookCheck.ts";

const SECRET = "whsec-test-0123456789";

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt-1",
    type: "payment_paid",
    created_at: "2026-10-22T10:00:00Z",
    secret_token: SECRET,
    account_name: "NEZAMY",
    live: false,
    data: {
      id: "pay_abc123",
      status: "paid",
      amount: 45885,
      currency: "SAR",
      metadata: { order_id: "11111111-1111-4111-8111-111111111111" },
    },
    ...overrides,
  };
}

test("the right secret passes and the event's fields come back", () => {
  const r = checkWebhook(event(), SECRET, "test");
  assert.deepEqual(r, {
    ok: true,
    eventId: "evt-1",
    type: "payment_paid",
    paymentId: "pay_abc123",
    live: false,
    orderId: "11111111-1111-4111-8111-111111111111",
    modeMatches: true,
  });
});

test("a wrong secret of the same length is 401", () => {
  const wrong = SECRET.slice(0, -1) + (SECRET.endsWith("9") ? "8" : "9");
  assert.equal(wrong.length, SECRET.length);
  assert.deepEqual(checkWebhook(event({ secret_token: wrong }), SECRET, "test"), { ok: false, status: 401 });
});

test("a wrong secret of a different length is 401 (and does not throw)", () => {
  assert.deepEqual(checkWebhook(event({ secret_token: "short" }), SECRET, "test"), { ok: false, status: 401 });
  assert.deepEqual(checkWebhook(event({ secret_token: SECRET + "-longer" }), SECRET, "test"), { ok: false, status: 401 });
});

test("a missing or non-string secret_token is 401", () => {
  const body = event();
  delete body.secret_token;
  assert.deepEqual(checkWebhook(body, SECRET, "test"), { ok: false, status: 401 });
  assert.deepEqual(checkWebhook(event({ secret_token: 123 }), SECRET, "test"), { ok: false, status: 401 });
  assert.deepEqual(checkWebhook(event({ secret_token: "" }), SECRET, "test"), { ok: false, status: 401 });
});

test("an unset or empty configured secret refuses everyone", () => {
  assert.deepEqual(checkWebhook(event({ secret_token: "" }), "", "test"), { ok: false, status: 401 });
  assert.deepEqual(checkWebhook(event(), "", "test"), { ok: false, status: 401 });
  assert.deepEqual(checkWebhook(event(), "   ", "test"), { ok: false, status: 401 });
});

test("the configured secret is compared trimmed, the way the gateway config reads it", () => {
  assert.equal(checkWebhook(event(), `  ${SECRET}\n`, "test").ok, true);
});

test("a body that is not an object is 400", () => {
  for (const body of [null, undefined, "x", 42, [], [event()]]) {
    assert.deepEqual(checkWebhook(body, SECRET, "test"), { ok: false, status: 400 }, String(body));
  }
});

test("a missing event id is 400", () => {
  const body = event();
  delete body.id;
  assert.deepEqual(checkWebhook(body, SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ id: "" }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ id: 7 }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ id: "x".repeat(201) }), SECRET, "test"), { ok: false, status: 400 });
});

test("an ill-typed type, data, data.id or live is 400", () => {
  assert.deepEqual(checkWebhook(event({ type: 1 }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ type: "" }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ data: null }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ data: [] }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ data: { status: "paid" } }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ data: { id: "" } }), SECRET, "test"), { ok: false, status: 400 });
  assert.deepEqual(checkWebhook(event({ live: "false" }), SECRET, "test"), { ok: false, status: 400 });
  const noLive = event();
  delete noLive.live;
  assert.deepEqual(checkWebhook(noLive, SECRET, "test"), { ok: false, status: 400 });
});

test("the secret is checked before the shape: a bad secret on a malformed event is still 401", () => {
  assert.deepEqual(checkWebhook({ secret_token: "nope" }, SECRET, "test"), { ok: false, status: 401 });
});

test("both failed-event spellings settle an order; refunded and voided only record", () => {
  for (const type of ["payment_paid", "payment_failed", "payment_faild"]) {
    const r = checkWebhook(event({ type }), SECRET, "test");
    assert.equal(r.ok, true, type);
    if (r.ok) assert.equal(r.type, type);
    assert.equal(webhookAction(type), "settle", type);
  }
  assert.equal(webhookAction("payment_refunded"), "record");
  assert.equal(webhookAction("payment_voided"), "record");
  for (const type of ["payment_authorized", "payment_captured", "balance_transferred", "payment_paid ", "PAYMENT_PAID"]) {
    assert.equal(webhookAction(type), "ignore", type);
  }
});

test("orderId is present only when data.metadata.order_id is a non-empty string", () => {
  const noMeta = checkWebhook(event({ data: { id: "pay_1" } }), SECRET, "test");
  assert.equal(noMeta.ok && "orderId" in noMeta, false);
  const numeric = checkWebhook(event({ data: { id: "pay_1", metadata: { order_id: 5 } } }), SECRET, "test");
  assert.equal(numeric.ok && "orderId" in numeric, false);
  const empty = checkWebhook(event({ data: { id: "pay_1", metadata: { order_id: "" } } }), SECRET, "test");
  assert.equal(empty.ok && "orderId" in empty, false);
});

test("modeMatches: the body's live flag against the mode of the configured key", () => {
  const liveBody = event({ live: true });
  const testBody = event({ live: false });
  const pick = (r: ReturnType<typeof checkWebhook>) => (r.ok ? r.modeMatches : null);
  assert.equal(pick(checkWebhook(liveBody, SECRET, "live")), true);
  assert.equal(pick(checkWebhook(testBody, SECRET, "live")), false);
  assert.equal(pick(checkWebhook(liveBody, SECRET, "test")), false);
  assert.equal(pick(checkWebhook(testBody, SECRET, "test")), true);
  // no key configured: nothing to compare against; fulfilment answers gateway_disabled
  assert.equal(pick(checkWebhook(liveBody, SECRET, null)), true);
});

test("modeOfSecretKey reads only the prefix", () => {
  assert.equal(modeOfSecretKey("sk_test_abc"), "test");
  assert.equal(modeOfSecretKey(" sk_live_abc "), "live");
  assert.equal(modeOfSecretKey("pk_live_abc"), null);
  assert.equal(modeOfSecretKey(""), null);
  assert.equal(modeOfSecretKey(undefined), null);
});

test("webhookSecretMatches compares SHA-256 digests with timingSafeEqual", () => {
  assert.equal(webhookSecretMatches(SECRET, SECRET), true);
  assert.equal(webhookSecretMatches("a", "b"), false);
  assert.equal(webhookSecretMatches("a", ""), false);
  assert.equal(webhookSecretMatches(null, SECRET), false);
  const src = readFileSync(join(import.meta.dirname, "webhookCheck.ts"), "utf8");
  const fn = src.slice(src.indexOf("export function webhookSecretMatches("));
  const fnBody = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(fnBody, /createHash\("sha256"\)/);
  assert.match(fnBody, /timingSafeEqual\(/);
  assert.doesNotMatch(src, /secret_token\s*[!=]==|[!=]==\s*secret\b/, "no plain comparison of the secret");
});

test("webhookStatusFor: pending is 503 so Moyasar retries; every other outcome is 200", () => {
  assert.equal(webhookStatusFor("pending"), 503);
  for (const o of ["granted", "already_done", "failed", "rejected"] as const) assert.equal(webhookStatusFor(o), 200, o);
});

test("webhookOutcomeLabel: machine words only — never Moyasar's failure message", () => {
  assert.equal(webhookOutcomeLabel({ outcome: "granted" }), "granted");
  assert.equal(webhookOutcomeLabel({ outcome: "already_done" }), "already_done");
  assert.equal(webhookOutcomeLabel({ outcome: "already_done", reason: "already_entitled" }), "already_done:already_entitled");
  assert.equal(webhookOutcomeLabel({ outcome: "failed", reason: "Insufficient Funds" }), "failed");
  assert.equal(webhookOutcomeLabel({ outcome: "pending", reason: "payment_fetch_failed" }), "pending:payment_fetch_failed");
  assert.equal(webhookOutcomeLabel({ outcome: "rejected", reason: "amount_mismatch" }), "rejected:amount_mismatch");
  assert.equal(webhookOutcomeLabel({ outcome: "rejected", reason: "x".repeat(300) }).length <= 100, true);
});

test("isFinalWebhookOutcome: a stored null or pending outcome is retried; anything else is a duplicate", () => {
  assert.equal(isFinalWebhookOutcome(null), false);
  assert.equal(isFinalWebhookOutcome(undefined), false);
  assert.equal(isFinalWebhookOutcome(""), false);
  assert.equal(isFinalWebhookOutcome("pending"), false);
  assert.equal(isFinalWebhookOutcome("pending:payment_fetch_failed"), false);
  for (const o of ["granted", "already_done", "already_done:claimed_elsewhere", "failed", "rejected:order_mismatch", "recorded", "ignored", "mode_mismatch", "no_order"]) {
    assert.equal(isFinalWebhookOutcome(o), true, o);
  }
});
