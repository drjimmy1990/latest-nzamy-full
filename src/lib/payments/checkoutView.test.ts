/**
 * checkoutView.test.ts — the pure half of the /checkout screen and of the buy
 * buttons (Moyasar payments B1, Task 7): where a buy button goes, what the
 * screen says about an item, and the Moyasar.init config.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYABLE_ITEMS } from "./catalog.ts";
import { VAT_NOTICE } from "../pricing/vatNotice.ts";
import type { CheckoutResponse } from "./checkoutRules.ts";
import {
  buyButtonAction,
  checkoutBillingFor,
  checkoutHref,
  checkoutItemNotes,
  gatewayAllowsCheckout,
  initiatingResult,
  intentNeedsRefresh,
  listedVatNotice,
  moyasarInitConfig,
  moyasarMethods,
  needsNewCheckout,
  parseCheckoutQuery,
  parseCheckoutResponse,
  quoteVatNotice,
  refreshDecision,
  INTENT_EXPIRY_MARGIN_MS,
  INTENT_REFRESH_MS,
  LITIGATION_COVERAGE_AR,
} from "./checkoutView.ts";

// ── checkoutHref ────────────────────────────────────────────────────────────

test("checkoutHref: a signed-in buyer with the gateway on goes to /checkout", () => {
  assert.equal(checkoutHref("lawyer-pro", "monthly", true, true), "/checkout?item=lawyer-pro&billing=monthly");
  assert.equal(checkoutHref("firm-basic", "yearly", true, true), "/checkout?item=firm-basic&billing=yearly");
  assert.equal(checkoutHref("ind-litigation", "yearly", true, true), "/checkout?item=ind-litigation&billing=yearly");
});

test("checkoutHref: top-ups and library plans are paid once, whatever the /pricing toggle says", () => {
  assert.equal(checkoutHref("topup-250", "monthly", true, true), "/checkout?item=topup-250&billing=once");
  assert.equal(checkoutHref("topup-1000", "yearly", true, true), "/checkout?item=topup-1000&billing=once");
  assert.equal(checkoutHref("lib-q1", "monthly", true, true), "/checkout?item=lib-q1&billing=once");
  assert.equal(checkoutHref("lib-annual", "once", true, true), "/checkout?item=lib-annual&billing=once");
});

test("checkoutHref: null keeps today's request flow (gateway off, guest, or not sold online)", () => {
  assert.equal(checkoutHref("lawyer-pro", "monthly", false, true), null, "gateway off (owner ٢٤٦)");
  assert.equal(checkoutHref("lawyer-pro", "monthly", true, false), null, "guest");
  assert.equal(checkoutHref("lawyer-pro", "monthly", false, false), null);
  for (const id of ["provider-pro", "lib-firm-small", "lib-firm-enterprise", "micro-shield", "gov-department", "free", "", "constructor", "__proto__"]) {
    assert.equal(checkoutHref(id, "monthly", true, true), null, id);
  }
  // a plan has no one-off price
  assert.equal(checkoutHref("lawyer-pro", "once", true, true), null);
});

test("checkoutBillingFor maps the toggle to a billing the item offers", () => {
  assert.equal(checkoutBillingFor(PAYABLE_ITEMS["ind-ai"], "monthly"), "monthly");
  assert.equal(checkoutBillingFor(PAYABLE_ITEMS["ind-ai"], "yearly"), "yearly");
  assert.equal(checkoutBillingFor(PAYABLE_ITEMS["ind-ai"], "once"), null);
  assert.equal(checkoutBillingFor(PAYABLE_ITEMS["topup-100"], "monthly"), "once");
  assert.equal(checkoutBillingFor(PAYABLE_ITEMS["lib-q2"], "yearly"), "once");
});

test("gatewayAllowsCheckout: only Moyasar, enabled, and loaded", () => {
  assert.equal(gatewayAllowsCheckout({ disabled: false, provider: "moyasar", loading: false }), true);
  assert.equal(gatewayAllowsCheckout({ disabled: false, provider: "moyasar" }), true);
  assert.equal(gatewayAllowsCheckout({ disabled: true, provider: "moyasar", loading: false }), false);
  // the stub gateway (local/staging) is "enabled" but the checkout answers 503
  assert.equal(gatewayAllowsCheckout({ disabled: false, provider: "stub", loading: false }), false);
  assert.equal(gatewayAllowsCheckout({ disabled: false, provider: "moyasar", loading: true }), false);
  assert.equal(gatewayAllowsCheckout({ disabled: false, provider: null, loading: false }), false);
});

// ── the query string ────────────────────────────────────────────────────────

test("parseCheckoutQuery accepts an item and a billing it offers", () => {
  assert.deepEqual(parseCheckoutQuery("lawyer-pro", "yearly"), { ok: true, itemId: "lawyer-pro", billing: "yearly" });
  assert.deepEqual(parseCheckoutQuery(["topup-100", "x"], "once"), { ok: true, itemId: "topup-100", billing: "once" });
  for (const [item, billing] of [
    [undefined, "monthly"],
    ["lawyer-pro", undefined],
    ["nope", "monthly"],
    ["__proto__", "monthly"],
    ["lawyer-pro", "once"],
    ["topup-100", "monthly"],
    ["lawyer-pro", "weekly"],
  ] as const) {
    assert.deepEqual(parseCheckoutQuery(item, billing), { ok: false }, `${item} ${billing}`);
  }
});

// ── what the screen says ────────────────────────────────────────────────────

test("listedVatNotice: the item's own rule; the library states both before the buyer is known", () => {
  assert.equal(listedVatNotice(PAYABLE_ITEMS["lawyer-pro"], null), VAT_NOTICE.exclusive.ar);
  assert.equal(listedVatNotice(PAYABLE_ITEMS["firm-enterprise"], "firm"), VAT_NOTICE.exclusive.ar);
  assert.equal(listedVatNotice(PAYABLE_ITEMS["topup-500"], "individual"), VAT_NOTICE.exclusive.ar);
  assert.equal(listedVatNotice(PAYABLE_ITEMS["ind-preventive"], "individual"), VAT_NOTICE.inclusive.ar);
  assert.equal(listedVatNotice(PAYABLE_ITEMS["lib-q1"], null), VAT_NOTICE.library.ar);
  // a known buyer gets the rule the server will charge
  assert.equal(listedVatNotice(PAYABLE_ITEMS["lib-q1"], "lawyer"), VAT_NOTICE.exclusive.ar);
  assert.equal(listedVatNotice(PAYABLE_ITEMS["lib-q1"], "individual"), VAT_NOTICE.inclusive.ar);
});

test("quoteVatNotice: the sentence for the mode the server quoted", () => {
  assert.equal(quoteVatNotice("exclusive"), VAT_NOTICE.exclusive.ar);
  assert.equal(quoteVatNotice("inclusive"), VAT_NOTICE.inclusive.ar);
});

test("checkoutItemNotes: ind-litigation states the main-subscriber coverage verbatim", () => {
  assert.equal(LITIGATION_COVERAGE_AR, "تغطية المشترك الرئيسي؛ تُضاف التغطية العائلية بطلب يراجعه الفريق");
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["ind-litigation"]), [LITIGATION_COVERAGE_AR]);
});

test("checkoutItemNotes: each top-up states the validity the catalog grants; the points are in its label already", () => {
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-100"]), ["صالحة ٣ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-250"]), ["صالحة ٣ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-500"]), ["صالحة ٦ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-1000"]), ["صالحة ١٢ شهراً من تاريخ الشراء"]);
  // every top-up label names its points, so the screen shows them once
  for (const [id, points] of [["topup-100", "١٠٠ نقطة"], ["topup-250", "٣٠٠ نقطة"], ["topup-500", "٧٠٠ نقطة"], ["topup-1000", "١٬٥٠٠ نقطة"]]) {
    assert.ok(PAYABLE_ITEMS[id].labelAr.includes(points), id);
  }
  // a top-up whose label does not name its points still gets the line
  assert.deepEqual(checkoutItemNotes({ ...PAYABLE_ITEMS["topup-100"], labelAr: "شحن" }), ["١٠٠ نقطة", "صالحة ٣ أشهر من تاريخ الشراء"]);
});

test("checkoutItemNotes: the library states its access length; firm plans promise no seats", () => {
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["lib-q1"]), ["وصول إلى المكتبة القانونية لمدة ٩٠ يوماً"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["lib-annual"]), ["وصول إلى المكتبة القانونية لمدة ٣٦٥ يوماً"]);
  for (const id of ["firm-basic", "firm-enterprise"]) {
    const notes = checkoutItemNotes(PAYABLE_ITEMS[id]).join(" ");
    assert.doesNotMatch(notes, /مقعد|مقاعد|مستخدم|seat/i, id);
  }
  for (const id of Object.keys(PAYABLE_ITEMS)) {
    assert.doesNotMatch(checkoutItemNotes(PAYABLE_ITEMS[id]).join(" "), /مقعد|مقاعد|seat/i, id);
  }
});

// ── the buy buttons while the status loads ──────────────────────────────────

test("buyButtonAction: checkout / wait / request", () => {
  const on = { disabled: false, provider: "moyasar", loading: false };
  const off = { disabled: true, provider: null, loading: false };
  const loading = { disabled: true, provider: null, loading: true };
  assert.deepEqual(buyButtonAction("lawyer-pro", "yearly", on, true), {
    kind: "checkout",
    href: "/checkout?item=lawyer-pro&billing=yearly",
  });
  assert.deepEqual(buyButtonAction("topup-500", "monthly", on, true), {
    kind: "checkout",
    href: "/checkout?item=topup-500&billing=once",
  });
  assert.deepEqual(buyButtonAction("lawyer-pro", "monthly", off, true), { kind: "request" }, "gateway off (٢٤٦)");
  // a sellable item is not turned into a request while the status is unknown
  assert.deepEqual(buyButtonAction("lawyer-pro", "monthly", loading, true), { kind: "wait" });
  assert.deepEqual(buyButtonAction("lib-q1", "once", loading, true), { kind: "wait" });
  // items not sold online never wait on the gateway
  assert.deepEqual(buyButtonAction("provider-pro", "monthly", loading, true), { kind: "request" });
  assert.deepEqual(buyButtonAction("lib-firm-small", "monthly", on, true), { kind: "request" });
  // guests are the caller's business (register / login navigation)
  assert.deepEqual(buyButtonAction("lawyer-pro", "monthly", on, false), { kind: "request" });
});

// ── the Moyasar form ────────────────────────────────────────────────────────

const ORDER = "0b8f9a3e-1111-4222-8333-444455556666";
const RESPONSE: CheckoutResponse = {
  orderId: ORDER,
  intentId: "pi_123",
  clientSecret: "pi_123_secret_abc",
  publishableKey: "pk_test_abc",
  amountHalalas: 45885,
  descriptionAr: "NEZAMY — المحامي المحترف",
  saveCard: true,
  quote: { net: 39900, vat: 5985, total: 45885, vatMode: "exclusive" },
  callbackUrl: `https://nezamy.example/payments/result?order=${ORDER}`,
  expiresAt: "2026-10-22T11:00:00.000Z",
};

const opts = (over: Partial<Parameters<typeof moyasarInitConfig>[1]> = {}) => ({
  element: ".mysr-form",
  applePayFlag: undefined,
  initiate: async () => RESPONSE,
  onNeedsNewCheckout: () => {},
  ...over,
});

test("moyasarMethods: Apple Pay only with a publishable key and the flag set to 'true'", () => {
  assert.deepEqual(moyasarMethods("pk_test_abc", "true"), ["creditcard", "applepay"]);
  assert.deepEqual(moyasarMethods("pk_test_abc", undefined), ["creditcard"]);
  assert.deepEqual(moyasarMethods("pk_test_abc", "1"), ["creditcard"]);
  assert.deepEqual(moyasarMethods("pk_test_abc", "TRUE"), ["creditcard"]);
  assert.deepEqual(moyasarMethods("", "true"), ["creditcard"]);
});

test("initiatingResult hands Moyasar the intent, the order id as payment metadata and the server's callback", () => {
  const r = initiatingResult(RESPONSE);
  assert.deepEqual(r, {
    payment_intent: { id: "pi_123", client_secret: "pi_123_secret_abc" },
    amount: 45885,
    metadata: { order_id: ORDER },
    callback_url: RESPONSE.callbackUrl,
  });
  // only keys Moyasar lets on_initiating change (any other key throws there)
  const allowed = new Set(["callback_url", "description", "metadata", "amount", "splits", "publishable_api_key", "currency", "save_card", "use_payment_intent", "payment_intent"]);
  for (const k of Object.keys(r)) assert.ok(allowed.has(k), k);
});

test("moyasarInitConfig: the values the brief pins, and the server's callback URL", async () => {
  let calls = 0;
  const cfg = moyasarInitConfig(RESPONSE, opts({ initiate: async () => (calls++, RESPONSE) }));
  assert.equal(cfg.element, ".mysr-form");
  assert.equal(cfg.amount, 45885);
  assert.equal(cfg.currency, "SAR");
  assert.equal(cfg.description, "NEZAMY — المحامي المحترف");
  assert.equal(cfg.publishable_api_key, "pk_test_abc");
  assert.equal(cfg.callback_url, RESPONSE.callbackUrl);
  assert.deepEqual(cfg.metadata, { order_id: ORDER });
  assert.deepEqual(cfg.methods, ["creditcard"]);
  assert.deepEqual(cfg.supported_networks, ["mada", "visa", "mastercard"]);
  assert.equal(cfg.language, "ar");
  assert.equal(cfg.use_payment_intent, true);
  assert.deepEqual(cfg.credit_card, { save_card: true });
  assert.deepEqual(cfg.apple_pay, {
    country: "SA",
    label: "NEZAMY",
    validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate",
  });
  const result = await cfg.on_initiating();
  assert.equal(calls, 1);
  assert.deepEqual(result, initiatingResult(RESPONSE));
});

test("moyasarInitConfig: the callbacks are async functions (the form refuses any other kind)", () => {
  const cfg = moyasarInitConfig(RESPONSE, opts());
  assert.equal(cfg.on_initiating.constructor.name, "AsyncFunction");
  assert.equal(cfg.on_failure.constructor.name, "AsyncFunction");
});

test("moyasarInitConfig: one-off items keep no card; Apple Pay follows the flag", () => {
  const once = { ...RESPONSE, saveCard: false };
  const cfg = moyasarInitConfig(once, opts({ applePayFlag: "true", initiate: async () => once }));
  assert.deepEqual(cfg.credit_card, { save_card: false });
  assert.deepEqual(cfg.methods, ["creditcard", "applepay"]);
});

test("moyasarInitConfig: on_initiating uses the intent it is given, or false when none can be had", async () => {
  const other = "11111111-2222-4333-8444-555566667777";
  const fresh = {
    ...RESPONSE,
    orderId: other,
    intentId: "pi_new",
    clientSecret: "pi_new_secret",
    callbackUrl: `https://nezamy.example/payments/result?order=${other}`,
  };
  const r = await moyasarInitConfig(RESPONSE, opts({ initiate: async () => fresh })).on_initiating();
  assert.ok(r && typeof r === "object");
  assert.deepEqual(r.payment_intent, { id: "pi_new", client_secret: "pi_new_secret" });
  assert.deepEqual(r.metadata, { order_id: other });
  assert.equal(r.callback_url, fresh.callbackUrl);

  assert.equal(await moyasarInitConfig(RESPONSE, opts({ initiate: async () => null })).on_initiating(), false);
});

test("moyasarInitConfig: on_failure asks for a new checkout only when the intent is used up", async () => {
  let asked = 0;
  const cfg = moyasarInitConfig(RESPONSE, opts({ onNeedsNewCheckout: () => asked++ }));
  await cfg.on_failure({ type: "intent_not_fulfillable", message: "x", errors: null });
  assert.equal(asked, 1);
  await cfg.on_failure({ id: "pay_1", status: "failed" });
  assert.equal(asked, 2);
  await cfg.on_failure({ type: "api_error", message: "Error code: 500", errors: null });
  await cfg.on_failure(new TypeError("Failed to fetch"));
  assert.equal(asked, 2);
});

test("needsNewCheckout: a failed payment or a not-fulfillable intent", () => {
  assert.equal(needsNewCheckout({ type: "intent_not_fulfillable" }), true);
  assert.equal(needsNewCheckout({ status: "failed" }), true);
  for (const r of [null, undefined, "failed", {}, { status: "paid" }, { status: "initiated" }, { type: "api_error" }, { type: "invalid_request_error" }, new Error("x")]) {
    assert.equal(needsNewCheckout(r), false, String(JSON.stringify(r)));
  }
});

// ── the checkout answer ─────────────────────────────────────────────────────

test("parseCheckoutResponse keeps a well-formed answer and refuses anything else", () => {
  assert.deepEqual(parseCheckoutResponse(JSON.parse(JSON.stringify(RESPONSE))), RESPONSE);
  // expiresAt may be null or absent
  assert.deepEqual(parseCheckoutResponse({ ...RESPONSE, expiresAt: null }), { ...RESPONSE, expiresAt: null });
  const { expiresAt: _drop, ...noExpiry } = RESPONSE;
  void _drop;
  assert.deepEqual(parseCheckoutResponse(noExpiry), { ...RESPONSE, expiresAt: null });
  const broken: unknown[] = [
    null,
    [],
    "x",
    { ...RESPONSE, orderId: "" },
    { ...RESPONSE, clientSecret: undefined },
    { ...RESPONSE, publishableKey: "sk_test_abc" },
    { ...RESPONSE, amountHalalas: 99, quote: { ...RESPONSE.quote, total: 99 } },
    { ...RESPONSE, amountHalalas: 458.85 },
    { ...RESPONSE, saveCard: "yes" },
    { ...RESPONSE, quote: { ...RESPONSE.quote, vatMode: "buyer" } },
    { ...RESPONSE, quote: { ...RESPONSE.quote, total: 1 } },
    { ...RESPONSE, quote: null },
    { ...RESPONSE, callbackUrl: undefined },
    { ...RESPONSE, callbackUrl: "javascript:alert(1)//payments/result?order=" + ORDER },
    { ...RESPONSE, callbackUrl: "https://nezamy.example/payments/result?order=someone-else" },
    { ...RESPONSE, expiresAt: 3600 },
  ];
  for (const b of broken) assert.equal(parseCheckoutResponse(b), null, JSON.stringify(b));
});

// ── the held intent ─────────────────────────────────────────────────────────

test("intentNeedsRefresh follows expires_at, with a margin; without one, the age", () => {
  const expires = Date.parse(RESPONSE.expiresAt as string);
  assert.equal(intentNeedsRefresh(RESPONSE, 0, expires - INTENT_EXPIRY_MARGIN_MS - 1), false);
  assert.equal(intentNeedsRefresh(RESPONSE, 0, expires - INTENT_EXPIRY_MARGIN_MS), true);
  assert.equal(intentNeedsRefresh(RESPONSE, 0, expires + 1), true);
  const at = 1_000_000;
  for (const expiresAt of [null, "not a date"]) {
    assert.equal(intentNeedsRefresh({ expiresAt }, at, at + INTENT_REFRESH_MS - 1), false);
    assert.equal(intentNeedsRefresh({ expiresAt }, at, at + INTENT_REFRESH_MS), true);
  }
  assert.ok(INTENT_REFRESH_MS > 0 && INTENT_REFRESH_MS <= 55 * 60 * 1000);
  assert.ok(INTENT_EXPIRY_MARGIN_MS >= 5 * 60 * 1000);
});

test("refreshDecision: the same charge proceeds; a changed total stops for the payer to confirm", () => {
  const fresh = { ...RESPONSE, orderId: "x", intentId: "pi_2" };
  assert.equal(refreshDecision(RESPONSE, fresh), "proceed");
  assert.equal(refreshDecision(RESPONSE, { ...fresh, amountHalalas: 46000, quote: { ...RESPONSE.quote, total: 46000 } }), "confirm");
  assert.equal(refreshDecision(RESPONSE, { ...fresh, quote: { ...RESPONSE.quote, net: 39901, vat: 5984 } }), "confirm");
  assert.equal(refreshDecision(RESPONSE, { ...fresh, quote: { ...RESPONSE.quote, vatMode: "inclusive" } }), "confirm");
});
