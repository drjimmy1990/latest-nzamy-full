/**
 * page.test.ts — source contract for /checkout, the MoyasarCheckout form and
 * the buy buttons that lead there (Moyasar payments B1, Task 7). The page is a
 * server component and the form a client component importing the Moyasar
 * package, so neither loads under `node --test`; what they compute is
 * executed in src/lib/payments/checkoutView.test.ts, and the wiring is pinned
 * here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const read = (rel: string) => readFileSync(join(import.meta.dirname, rel), "utf8");
const pageSource = read("page.tsx");
const page = codeOnly(pageSource);
const form = codeOnly(read("../../components/payments/MoyasarCheckout.tsx"));
const view = codeOnly(read("../../lib/payments/checkoutView.ts"));
const cards = codeOnly(read("../../components/pricing/PricingCards.tsx"));
const subscribe = codeOnly(read("../laws/subscribe/page.tsx"));
const pkg = JSON.parse(read("../../../package.json")) as { dependencies: Record<string, string> };

test("moyasar-payment-form is pinned to exactly 2.3.0 (intents need ≥ 2.3.0)", () => {
  assert.equal(pkg.dependencies["moyasar-payment-form"], "2.3.0");
});

test("/checkout is a server component, per request, not indexed", () => {
  assert.doesNotMatch(pageSource, /^["']use client["']/m);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

test("/checkout: a guest goes to /login?next=<this page>; the gateway and the audience are checked first", () => {
  assert.match(page, /auth\.getUser\(\)/);
  assert.match(page, /redirect\(`\/login\?next=\$\{encodeURIComponent\(selfHref\)\}`\)/);
  assert.match(page, /gatewayAllowsCheckout\(await getPaymentGatewayStatus\(\)\)/);
  assert.match(page, /<Notice title=\{MOYASAR_DISABLED_MESSAGE_AR\} \/>/);
  assert.match(page, /!buyerAllowed\(item, userType\)\) return <Notice title=\{AUDIENCE_REFUSED_AR\} \/>/);
  assert.match(page, /href="\/pricing"/);
  // the form is rendered only after every refusal
  const formAt = page.indexOf("<MoyasarCheckout");
  for (const gate of ["redirect(`/login", "MOYASAR_DISABLED_MESSAGE_AR} />", "AUDIENCE_REFUSED_AR} />"]) {
    const at = page.indexOf(gate);
    assert.ok(at > -1 && at < formAt, gate);
  }
});

test("/checkout shows the listed price, the VAT sentence and the catalog notes", () => {
  assert.match(page, /formatHalalas\(listed\)/);
  assert.match(page, /listedVatNotice\(item, userType\)/);
  assert.match(page, /checkoutItemNotes\(item\)/);
  assert.doesNotMatch(page, /مقعد|مقاعد/);
});

test("/checkout: one consent line under the form, linking the terms and the refund policy, no checkbox", () => {
  const text = page.replace(/<Link[^>]*>|<\/Link>|\{" "\}/g, " ").replace(/\s+/g, " ");
  assert.ok(text.includes("بإتمام الدفع فإنك توافق على الشروط والأحكام و سياسة الاسترداد"), "the consent sentence");
  assert.match(page, /<Link href="\/terms"[^>]*>\s*الشروط والأحكام\s*<\/Link>/);
  assert.match(page, /<Link href="\/refund-policy"[^>]*>\s*سياسة الاسترداد\s*<\/Link>/);
  assert.doesNotMatch(page, /type="checkbox"/);
  assert.ok(page.indexOf("<MoyasarCheckout") < page.indexOf("بإتمام الدفع"), "under the form");
  for (const route of ["../terms/page.tsx", "../refund-policy/page.tsx"]) assert.ok(read(route).length > 0, route);
});

test("MoyasarCheckout POSTs the checkout from the click, never from an effect", () => {
  assert.match(form, /^"use client";/);
  assert.match(form, /fetch\("\/api\/v1\/payments\/checkout", \{\s*method: "POST"/);
  assert.match(form, /JSON\.stringify\(\{ itemId, billing \}\)/);
  assert.match(form, /onClick=\{onStart\}/);
  // a double press is ignored by an in-flight ref, set before the POST
  assert.match(form, /if \(inFlight\.current \|\| current\.current\) return;\s*inFlight\.current = true;/);
  assert.match(form, /متابعة الدفع/);
  // the quote shown is the server's
  for (const field of ["ready.quote.net", "ready.quote.vat", "ready.quote.total", "quoteVatNotice(ready.quote.vatMode)"]) {
    assert.ok(form.includes(field), field);
  }
  // a 403 shows the server's copy with the way back to /pricing
  assert.match(form, /audience: res\.status === 403/);
  assert.match(form, /href="\/pricing"/);
});

test("MoyasarCheckout imports the package and its CSS dynamically and initialises once", () => {
  assert.doesNotMatch(form, /^import[^;]*from "moyasar-payment-form"/m);
  assert.match(form, /import\("moyasar-payment-form"\)/);
  assert.match(form, /import\("moyasar-payment-form\/dist\/moyasar\.css"\)/);
  assert.match(form, /Moyasar\.init\(\s*moyasarInitConfig\(/);
  assert.match(form, /element: "\.mysr-form"/);
  assert.match(form, /className="mysr-form"/);
  assert.match(form, /initialised\.current = true/);
  // the server's callback URL, not the browser's origin
  assert.doesNotMatch(form, /window\.location\.origin/);
  // a used-up intent (decline, not fulfillable) drops the held checkout
  assert.match(form, /onNeedsNewCheckout: needNewCheckout/);
  assert.match(form, /function needNewCheckout\(\) \{\s*current\.current = null;\s*initialised\.current = false;\s*setPhase\(\{ kind: "idle" \}\);/);
  // a refreshed intent with another total stops for the payer to confirm
  assert.match(form, /refreshDecision\(held\.resp, fresh\.resp\) === "confirm"\) \{[\s\S]*?setPhase\(\{ kind: "ready", resp: fresh\.resp \}\);[\s\S]*?return null;/);
  // NEXT_PUBLIC_ is inlined at build time only when referenced literally
  assert.match(form, /applePayFlag: process\.env\.NEXT_PUBLIC_APPLE_PAY_ENABLED/);
});

test("the Moyasar config carries the pinned values and the order id as metadata", () => {
  assert.match(view, /language: "ar"/);
  assert.match(view, /use_payment_intent: true/);
  assert.match(view, /supported_networks: \["mada", "visa", "mastercard"\]/);
  assert.match(view, /currency: "SAR"/);
  assert.match(view, /metadata: \{ order_id: resp\.orderId \}/);
  assert.match(view, /callback_url: resp\.callbackUrl/);
  assert.match(view, /on_failure: async/);
  assert.match(view, /payment_intent: \{ id: resp\.intentId, client_secret: resp\.clientSecret \}/);
  assert.match(view, /credit_card: \{ save_card: resp\.saveCard \}/);
  assert.match(view, /validate_merchant_url: "https:\/\/api\.moyasar\.com\/v1\/applepay\/initiate"/);
  assert.match(view, /applePayFlag === "true" \? \["creditcard", "applepay"\] : \["creditcard"\]/);
});

test("the buy buttons go to /checkout only through buyButtonAction, wait while the status loads, and keep the request flow otherwise (٢٤٦)", () => {
  assert.match(cards, /const action = buyButtonAction\(plan\.id, billing, payments, isLoggedIn\);/);
  assert.match(cards, /if \(action\.kind === "wait"\) return true;/);
  assert.match(cards, /requestEntitlement\(planEntitlementRequest\(plan, \{ libraryMode \}\)\)/);
  // the checkout branch sits after the /contact pass-through and before the request
  const contactAt = cards.indexOf("if (!isSubscribeCta(plan.ctaHref)) return false;");
  const payAt = cards.indexOf("const action = buyButtonAction(");
  const requestAt = cards.indexOf("requestEntitlement(planEntitlementRequest(");
  assert.ok(contactAt > -1 && contactAt < payAt && payAt < requestAt);

  assert.match(subscribe, /const action = buyButtonAction\(planId, "once", payments, isLoggedIn\);/);
  assert.match(subscribe, /if \(action\.kind === "wait"\) return;/);
  const libPayAt = subscribe.indexOf("const action = buyButtonAction(");
  const libRequestAt = subscribe.indexOf('requestEntitlement({ kind: "library"');
  assert.ok(libPayAt > -1 && libPayAt < libRequestAt);
});
