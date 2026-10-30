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
  parseCouponPreview,
  couponFieldShown,
  quoteVatNotice,
  refreshDecision,
  INTENT_EXPIRY_MARGIN_MS,
  INTENT_REFRESH_MS,
  LITIGATION_COVERAGE_AR,
  billingLabelAr,
} from "./checkoutView.ts";

// ── checkoutHref ────────────────────────────────────────────────────────────

test("checkoutHref: a signed-in buyer with the gateway on goes to /checkout", () => {
  assert.equal(checkoutHref("lawyer-pro", "yearly", true, true), "/checkout?item=lawyer-pro&billing=yearly");
  assert.equal(checkoutHref("lawyer-pro", "monthly", true, true), null, "the professionals' monthly cycle is retired (owner, 26 Oct)");
  assert.equal(checkoutHref("ind-ai", "monthly", true, true), "/checkout?item=ind-ai&billing=monthly", "individuals keep monthly");
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
  assert.equal(checkoutHref("lawyer-pro", "yearly", false, true), null, "gateway off (owner ٢٤٦)");
  assert.equal(checkoutHref("lawyer-pro", "yearly", true, false), null, "guest");
  assert.equal(checkoutHref("lawyer-pro", "yearly", false, false), null);
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
  // ٣٠١ / §6أ: the new cycles where the revised doc prices them
  assert.deepEqual(parseCheckoutQuery("ind-ai", "semiannual"), { ok: true, itemId: "ind-ai", billing: "semiannual" });
  assert.deepEqual(parseCheckoutQuery("firm-basic", "quarterly"), { ok: true, itemId: "firm-basic", billing: "quarterly" });
  for (const [item, billing] of [
    [undefined, "monthly"],
    ["lawyer-pro", undefined],
    ["nope", "monthly"],
    ["__proto__", "monthly"],
    ["lawyer-pro", "once"],
    ["topup-100", "monthly"],
    ["lawyer-pro", "weekly"],
    // a real cycle the item is not sold in
    ["lawyer-pro", "quarterly"],
    ["ind-preventive", "semiannual"],
  ] as const) {
    assert.deepEqual(parseCheckoutQuery(item, billing), { ok: false }, `${item} ${billing}`);
  }
});

test("parseCheckoutQuery: a retired cycle (lawyer-pro monthly) is «no longer sold», not «unknown»", () => {
  for (const id of ["lawyer-pro", "consultant-independent", "firm-basic", "firm-enterprise"]) {
    assert.deepEqual(parseCheckoutQuery(id, "monthly"), { ok: false, notForSale: true }, id);
  }
  assert.deepEqual(parseCheckoutQuery("ind-ai", "monthly"), { ok: true, itemId: "ind-ai", billing: "monthly" });
});

// ── what the screen says ────────────────────────────────────────────────────

test("٢٥٨: listedVatNotice is the one exclusive sentence for every item — individuals and the library included", () => {
  for (const item of Object.values(PAYABLE_ITEMS)) {
    assert.equal(listedVatNotice(item), VAT_NOTICE.exclusive.ar, item.id);
  }
});

test("٢٥٨: quoteVatNotice is the same sentence", () => {
  assert.equal(quoteVatNotice("exclusive"), VAT_NOTICE.exclusive.ar);
});

test("billingLabelAr names every cycle in Arabic", () => {
  assert.equal(billingLabelAr("monthly"), "اشتراك شهري");
  assert.equal(billingLabelAr("quarterly"), "اشتراك ربع سنوي");
  assert.equal(billingLabelAr("semiannual"), "اشتراك نصف سنوي");
  assert.equal(billingLabelAr("yearly"), "اشتراك سنوي");
  assert.equal(billingLabelAr("once"), "دفعة واحدة");
});

test("checkoutItemNotes: ind-litigation states the main-subscriber coverage, and no family option (LIVE-F11, conflict ١٠)", () => {
  assert.equal(LITIGATION_COVERAGE_AR, "تغطية المشترك الرئيسي");
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["ind-litigation"]), [LITIGATION_COVERAGE_AR]);
});

test("checkoutItemNotes: each top-up states the validity the catalog grants; the points are in its label already", () => {
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-100"]), ["صالحة ٣ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-250"]), ["صالحة ٣ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-500"]), ["صالحة ٣ أشهر من تاريخ الشراء"]);
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["topup-1000"]), ["صالحة ٦ أشهر من تاريخ الشراء"]);
  for (const id of ["topup-2500", "topup-5000", "topup-10000"]) {
    assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS[id]), ["صالحة ١٢ شهراً من تاريخ الشراء"], id);
  }
  // every top-up label names its points, so the screen shows them once
  for (const [id, points] of [
    ["topup-100", "١٠٠ نقطة"], ["topup-250", "٢٥٠ نقطة"], ["topup-500", "٥٠٠ نقطة"], ["topup-1000", "١٬٢٥٠ نقطة"],
    ["topup-2500", "٣٬٥٠٠ نقطة"], ["topup-5000", "٨٬٥٠٠ نقطة"], ["topup-10000", "٢٥٬٠٠٠ نقطة"],
  ]) {
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
  assert.deepEqual(buyButtonAction("lawyer-pro", "yearly", off, true), { kind: "request" }, "gateway off (٢٤٦)");
  // a sellable item is not turned into a request while the status is unknown
  assert.deepEqual(buyButtonAction("lawyer-pro", "yearly", loading, true), { kind: "wait" });
  assert.deepEqual(buyButtonAction("lib-q1", "once", loading, true), { kind: "wait" });
  // items not sold online never wait on the gateway
  assert.deepEqual(buyButtonAction("provider-pro", "monthly", loading, true), { kind: "request" });
  assert.deepEqual(buyButtonAction("lib-firm-small", "monthly", on, true), { kind: "request" });
  // guests are the caller's business (register / login navigation)
  assert.deepEqual(buyButtonAction("lawyer-pro", "yearly", on, false), { kind: "request" });
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

test("moyasarInitConfig: every on_failure call asks for a new checkout — a string message or an object", async () => {
  let asked = 0;
  const cfg = moyasarInitConfig(RESPONSE, opts({ onNeedsNewCheckout: () => asked++ }));
  // Moyasar documents on_failure as receiving a STRING message
  await cfg.on_failure("Payment failed: insufficient funds");
  assert.equal(asked, 1);
  await cfg.on_failure("");
  assert.equal(asked, 2);
  // objects seen from the form: a not-fulfillable intent, a failed payment, an API error, a network error
  await cfg.on_failure({ type: "intent_not_fulfillable", message: "x", errors: null });
  assert.equal(asked, 3);
  await cfg.on_failure({ id: "pay_1", status: "failed" });
  assert.equal(asked, 4);
  await cfg.on_failure({ type: "api_error", message: "Error code: 500", errors: null });
  assert.equal(asked, 5);
  await cfg.on_failure(new TypeError("Failed to fetch"));
  assert.equal(asked, 6);
});

test("needsNewCheckout: any on_failure report, string or object, needs a new checkout", () => {
  for (const r of ["failed", "", "Payment failed", { type: "intent_not_fulfillable" }, { status: "failed" }, {}, { type: "api_error" }, new Error("x"), null, undefined]) {
    assert.equal(needsNewCheckout(r), true, String(JSON.stringify(r)));
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
    // ٢٥٨: this server never quotes inclusive
    { ...RESPONSE, quote: { ...RESPONSE.quote, vatMode: "inclusive" } },
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

// ── the coupon (P7) ─────────────────────────────────────────────────────────

test("parseCheckoutResponse: a couponed quote keeps listNet / discount / couponCode only when listNet − discount = net", () => {
  const net = RESPONSE.quote.net;
  const couponed = { ...RESPONSE, quote: { ...RESPONSE.quote, listNet: net + 5000, discount: 5000, couponCode: "NZAMY50" } };
  assert.deepEqual(parseCheckoutResponse(JSON.parse(JSON.stringify(couponed))), couponed);
  // inconsistent figures or a partial set are not this server's answer
  assert.equal(parseCheckoutResponse({ ...couponed, quote: { ...couponed.quote, listNet: net + 4000 } }), null);
  assert.equal(parseCheckoutResponse({ ...couponed, quote: { ...couponed.quote, couponCode: undefined } }), null);
  assert.equal(parseCheckoutResponse({ ...couponed, quote: { ...couponed.quote, discount: 0, listNet: net } }), null);
});

test("parseCouponPreview: the validate answer, checked (discount > 0, listNet − discount = net, net + VAT = total)", () => {
  const ok = { code: "NZAMY50", quote: { listNet: 149000, discount: 5000, net: 144000, vat: 21600, total: 165600 } };
  assert.deepEqual(parseCouponPreview(ok), { code: "NZAMY50", listNet: 149000, discount: 5000, net: 144000, vat: 21600, total: 165600 });
  assert.equal(parseCouponPreview({ ...ok, quote: { ...ok.quote, total: 165601 } }), null);
  assert.equal(parseCouponPreview({ ...ok, quote: { ...ok.quote, net: 144001 } }), null);
  assert.equal(parseCouponPreview({ error: "x" }), null);
  assert.equal(parseCouponPreview(null), null);
});

test("couponFieldShown: only once the coupon columns exist, and never for a point top-up", () => {
  assert.equal(couponFieldShown({ kind: "plan" }, true), true);
  assert.equal(couponFieldShown({ kind: "library" }, true), true);
  assert.equal(couponFieldShown({ kind: "topup" }, true), false);
  assert.equal(couponFieldShown({ kind: "plan" }, false), false);
});
