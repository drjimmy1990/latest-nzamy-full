/**
 * checkoutRules.test.ts — the pure half of POST /api/v1/payments/checkout
 * (Moyasar payments B1, Task 6): the body, the callback origin, and which of
 * the buyer's earlier orders a new checkout supersedes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callbackUrlFor,
  cancelOrderAfterIntentCancel,
  intentDescription,
  ordersToSupersede,
  parseCheckoutBody,
  resolveCallbackOrigin,
  type SupersedeCandidateRow,
} from "./checkoutRules.ts";

test("parseCheckoutBody accepts {itemId, billing} and nothing priced", () => {
  assert.deepEqual(parseCheckoutBody({ itemId: "lawyer-pro", billing: "monthly" }), {
    ok: true,
    itemId: "lawyer-pro",
    billing: "monthly",
  });
  // a price in the body is ignored, never returned
  const withPrice = parseCheckoutBody({ itemId: "topup-100", billing: "once", amount: 1, totalHalalas: 1 });
  assert.deepEqual(withPrice, { ok: true, itemId: "topup-100", billing: "once" });
});

test("parseCheckoutBody: an optional couponCode is normalised; empty / null means none; a malformed one refuses the body (P7)", () => {
  assert.deepEqual(parseCheckoutBody({ itemId: "ind-ai", billing: "yearly", couponCode: " nzamy50 " }), {
    ok: true,
    itemId: "ind-ai",
    billing: "yearly",
    couponCode: "NZAMY50",
  });
  for (const none of [null, ""]) {
    assert.deepEqual(parseCheckoutBody({ itemId: "ind-ai", billing: "yearly", couponCode: none }), { ok: true, itemId: "ind-ai", billing: "yearly" });
  }
  for (const bad of [5, "x", "NZ AMY", "x".repeat(40), {}]) {
    assert.deepEqual(parseCheckoutBody({ itemId: "ind-ai", billing: "yearly", couponCode: bad }), { ok: false }, JSON.stringify(bad));
  }
});

test("parseCheckoutBody reads the two new cycles too (whether the item sells them is quote's question)", () => {
  for (const billing of ["quarterly", "semiannual", "yearly"]) {
    assert.deepEqual(parseCheckoutBody({ itemId: "lawyer-pro", billing }), { ok: true, itemId: "lawyer-pro", billing });
  }
});

test("parseCheckoutBody refuses a missing or ill-typed item or billing", () => {
  for (const body of [
    null,
    "lawyer-pro",
    [],
    {},
    { itemId: "lawyer-pro" },
    { billing: "monthly" },
    { itemId: 5, billing: "monthly" },
    { itemId: "", billing: "monthly" },
    { itemId: "x".repeat(65), billing: "monthly" },
    { itemId: "lawyer-pro", billing: "weekly" },
    { itemId: "lawyer-pro", billing: "Monthly" },
    { itemId: "lawyer-pro", billing: "custom" },
    { itemId: "lawyer-pro", billing: "biannual" },
  ]) {
    assert.deepEqual(parseCheckoutBody(body), { ok: false }, JSON.stringify(body));
  }
});

test("resolveCallbackOrigin: unset or not a URL refuses in both modes", () => {
  for (const mode of ["test", "live"] as const) {
    assert.equal(resolveCallbackOrigin(undefined, mode).ok, false, mode);
    assert.equal(resolveCallbackOrigin("", mode).ok, false, mode);
    assert.equal(resolveCallbackOrigin("   ", mode).ok, false, mode);
    assert.equal(resolveCallbackOrigin("nezamy.sa", mode).ok, false, mode);
    assert.equal(resolveCallbackOrigin("ftp://nezamy.sa", mode).ok, false, mode);
    assert.equal(resolveCallbackOrigin("javascript:alert(1)", mode).ok, false, mode);
  }
});

test("resolveCallbackOrigin: live needs https; test also takes http (local)", () => {
  assert.deepEqual(resolveCallbackOrigin("https://nezamy.sa", "live"), { ok: true, origin: "https://nezamy.sa" });
  assert.equal(resolveCallbackOrigin("http://nezamy.sa", "live").ok, false);
  assert.equal(resolveCallbackOrigin("http://localhost:3000", "live").ok, false);
  assert.deepEqual(resolveCallbackOrigin("http://localhost:3000", "test"), { ok: true, origin: "http://localhost:3000" });
  assert.deepEqual(resolveCallbackOrigin("https://staging.nezamy.sa", "test"), { ok: true, origin: "https://staging.nezamy.sa" });
});

test("resolveCallbackOrigin keeps only the origin: a path, query or trailing slash is dropped", () => {
  assert.deepEqual(resolveCallbackOrigin("https://nezamy.sa/", "live"), { ok: true, origin: "https://nezamy.sa" });
  assert.deepEqual(resolveCallbackOrigin("https://nezamy.sa/ar/x?y=1#z", "live"), { ok: true, origin: "https://nezamy.sa" });
  assert.deepEqual(resolveCallbackOrigin(" https://nezamy.sa ", "live"), { ok: true, origin: "https://nezamy.sa" });
});

test("callbackUrlFor names the order on the result page", () => {
  assert.equal(
    callbackUrlFor("https://nezamy.sa", "11111111-1111-4111-8111-111111111111"),
    "https://nezamy.sa/payments/result?order=11111111-1111-4111-8111-111111111111",
  );
});

test("intentDescription is «NEZAMY — <labelAr>»", () => {
  assert.equal(intentDescription("المحامي المحترف"), "NEZAMY — المحامي المحترف");
});

const row = (over: Partial<SupersedeCandidateRow>): SupersedeCandidateRow => ({
  id: "o1",
  item_id: "lawyer-pro",
  status: "initiated",
  moyasar_intent_id: "pi_1",
  moyasar_payment_id: null,
  ...over,
});

test("ordersToSupersede: the buyer's open orders for the same item that no payment has reached", () => {
  const rows = [
    row({ id: "same-initiated" }),
    row({ id: "same-created", status: "created", moyasar_intent_id: null }),
    row({ id: "other-billing" }), // the same item bought with the other billing is superseded too
    row({ id: "other-item", item_id: "ind-ai" }),
    row({ id: "has-payment", moyasar_payment_id: "pay_1" }),
    row({ id: "paid", status: "paid", moyasar_payment_id: "pay_2" }),
    row({ id: "failed", status: "failed" }),
    row({ id: "cancelled", status: "cancelled" }),
  ];
  assert.deepEqual(ordersToSupersede(rows, "lawyer-pro"), [
    { id: "same-initiated", intentId: "pi_1" },
    { id: "same-created", intentId: null },
    { id: "other-billing", intentId: "pi_1" },
  ]);
  assert.deepEqual(ordersToSupersede(null, "lawyer-pro"), []);
  assert.deepEqual(ordersToSupersede([], "lawyer-pro"), []);
});

test("cancelOrderAfterIntentCancel: an order is closed only when no payment can still reach it", () => {
  // no intent: no client secret was ever handed out
  assert.equal(cancelOrderAfterIntentCancel({ id: "o", intentId: null }, null), true);
  // Moyasar cancelled the intent: its client_secret no longer works
  assert.equal(cancelOrderAfterIntentCancel({ id: "o", intentId: "pi" }, { ok: true }), true);
  // intent_not_cancelable: already fulfilled into a payment (or expired) — the
  // order stays open so a late payment still settles it (callback, webhook, sweep)
  assert.equal(cancelOrderAfterIntentCancel({ id: "o", intentId: "pi" }, { ok: false }), false);
  // the cancel call never made / network error
  assert.equal(cancelOrderAfterIntentCancel({ id: "o", intentId: "pi" }, null), false);
});
