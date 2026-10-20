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
  checkoutBillingFor,
  checkoutHref,
  checkoutItemNotes,
  gatewayAllowsCheckout,
  initiatingResult,
  listedVatNotice,
  moyasarInitConfig,
  moyasarMethods,
  parseCheckoutQuery,
  parseCheckoutResponse,
  quoteVatNotice,
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

test("checkoutItemNotes: each top-up states its points and the validity the catalog grants", () => {
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-100"]), ["١٠٠ نقطة", "صالحة ٣ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-250"]), ["٣٠٠ نقطة", "صالحة ٣ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-500"]), ["٧٠٠ نقطة", "صالحة ٦ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-1000"]), ["١٬٥٠٠ نقطة", "صالحة ١٢ شهراً من تاريخ الشراء"]);
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

// ── the Moyasar form ────────────────────────────────────────────────────────

const RESPONSE: CheckoutResponse = {
  orderId: "0b8f9a3e-1111-4222-8333-444455556666",
  intentId: "pi_123",
  clientSecret: "pi_123_secret_abc",
  publishableKey: "pk_test_abc",
  amountHalalas: 45885,
  descriptionAr: "NEZAMY — المحامي المحترف",
  saveCard: true,
  quote: { net: 39900, vat: 5985, total: 45885, vatMode: "exclusive" },
};

test("moyasarMethods: Apple Pay only with a publishable key and the flag set to 'true'", () => {
  assert.deepEqual(moyasarMethods("pk_test_abc", "true"), ["creditcard", "applepay"]);
  assert.deepEqual(moyasarMethods("pk_test_abc", undefined), ["creditcard"]);
  assert.deepEqual(moyasarMethods("pk_test_abc", "1"), ["creditcard"]);
  assert.deepEqual(moyasarMethods("pk_test_abc", "TRUE"), ["creditcard"]);
  assert.deepEqual(moyasarMethods("", "true"), ["creditcard"]);
});

test("initiatingResult hands Moyasar the intent and the order id as payment metadata", () => {
  const cb = "https://example.test/payments/result?order=0b8f9a3e-1111-4222-8333-444455556666";
  const r = initiatingResult(RESPONSE, cb);
  assert.deepEqual(r, {
    payment_intent: { id: "pi_123", client_secret: "pi_123_secret_abc" },
    amount: 45885,
    metadata: { order_id: RESPONSE.orderId },
    callback_url: cb,
  });
  // only keys Moyasar lets on_initiating change (any other key throws there)
  const allowed = new Set(["callback_url", "description", "metadata", "amount", "splits", "publishable_api_key", "currency", "save_card", "use_payment_intent", "payment_intent"]);
  for (const k of Object.keys(r)) assert.ok(allowed.has(k), k);
});

test("moyasarInitConfig: the values the brief pins", async () => {
  let calls = 0;
  const cfg = moyasarInitConfig(RESPONSE, {
    element: ".mysr-form",
    origin: "https://example.test",
    applePayFlag: undefined,
    initiate: async () => {
      calls++;
      return RESPONSE;
    },
  });
  assert.equal(cfg.element, ".mysr-form");
  assert.equal(cfg.amount, 45885);
  assert.equal(cfg.currency, "SAR");
  assert.equal(cfg.description, "NEZAMY — المحامي المحترف");
  assert.equal(cfg.publishable_api_key, "pk_test_abc");
  assert.equal(cfg.callback_url, "https://example.test/payments/result?order=0b8f9a3e-1111-4222-8333-444455556666");
  assert.deepEqual(cfg.metadata, { order_id: RESPONSE.orderId });
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
  assert.deepEqual(result, initiatingResult(RESPONSE, cfg.callback_url));
});

test("moyasarInitConfig: one-off items keep no card; Apple Pay follows the flag", () => {
  const once = { ...RESPONSE, saveCard: false };
  const cfg = moyasarInitConfig(once, { element: ".mysr-form", origin: "https://example.test", applePayFlag: "true", initiate: async () => once });
  assert.deepEqual(cfg.credit_card, { save_card: false });
  assert.deepEqual(cfg.methods, ["creditcard", "applepay"]);
});

test("moyasarInitConfig: on_initiating uses the intent it is given, or false when none can be had", async () => {
  const fresh = { ...RESPONSE, orderId: "11111111-2222-4333-8444-555566667777", intentId: "pi_new", clientSecret: "pi_new_secret" };
  const cfg = moyasarInitConfig(RESPONSE, { element: ".mysr-form", origin: "https://example.test", applePayFlag: undefined, initiate: async () => fresh });
  const r = await cfg.on_initiating();
  assert.ok(r && typeof r === "object");
  assert.deepEqual(r.payment_intent, { id: "pi_new", client_secret: "pi_new_secret" });
  assert.deepEqual(r.metadata, { order_id: fresh.orderId });
  assert.equal(r.callback_url, "https://example.test/payments/result?order=11111111-2222-4333-8444-555566667777");

  const none = moyasarInitConfig(RESPONSE, { element: ".mysr-form", origin: "https://example.test", applePayFlag: undefined, initiate: async () => null });
  assert.equal(await none.on_initiating(), false);
});

test("parseCheckoutResponse keeps a well-formed answer and refuses anything else", () => {
  assert.deepEqual(parseCheckoutResponse(JSON.parse(JSON.stringify(RESPONSE))), RESPONSE);
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
  ];
  for (const b of broken) assert.equal(parseCheckoutResponse(b), null, JSON.stringify(b));
});

test("an intent is refreshed well inside Moyasar's one-hour life", () => {
  assert.ok(INTENT_REFRESH_MS > 0 && INTENT_REFRESH_MS <= 55 * 60 * 1000);
});
