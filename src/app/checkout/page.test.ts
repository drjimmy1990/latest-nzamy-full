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
  // test mode: staff and test accounts only (B1 final review), the viewer rule of GET /api/v1/payments/status
  assert.match(page, /import \{ viewerGatewayState \} from "@\/lib\/payments\/testModeAccess"/);
  assert.match(
    page,
    /gatewayAllowsCheckout\(\s*await viewerGatewayState\(await getPaymentGatewayStatus\(\), \{\s*userId: async \(\) => user\.id,\s*admin: \(\) => createServiceClient\(\),\s*\}\),\s*\)/,
  );
  assert.ok(page.indexOf("viewerGatewayState(") > page.indexOf("redirect(`/login"), "the viewer is signed in first");
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
  // l16 (A-01): the sentence follows the saved VAT number
  assert.match(page, /listedVatNotice\(item, vatRegistered\)/);
  // l11 O7: the library-lock line for a holder of a gated library plan
  // l14: and the cycle, for the ERP + library bundle's lines
  assert.match(page, /checkoutItemNotes\(item, \{\s*libraryMinPoints,\s*libraryQuestionPoints: aiToolPointRange\("library-assistant"\)\[1\],\s*billing: parsed\.billing,\s*\}\)/);
  // 06 ج6 + ٩٣ (l12): a library plan's checkout reads the minimum too — l14: and the bundle's
  assert.match(page, /if \(item\.kind === "library" \|\| \(item\.kind === "plan" && item\.libraryByBilling\)\) \{\s*try \{\s*libraryMinPoints = await readLibraryMinPoints\(\);/);
  // l14 (owner ٢٠١): no lock line while a founder-invite trial runs
  assert.match(page, /GATED_LIBRARY_PLAN_REFS\.includes\(r\)\)\) \{\s*const trial = refs\.includes\(FOUNDER_INVITE_TRIAL_PLAN_REF\) && \(await hasActiveFounderInviteTrial\(user\.id\)\);\s*if \(!trial\) libraryMinPoints = await readLibraryMinPoints\(\);/);
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
  // with a coupon (P7) the code rides along; without one the body is unchanged
  // (checkoutRequestBody, checkoutView.test.ts); the founder terms consent (owner ١٦) when ticked
  // S6b: and this attempt's Turnstile token (founder membership only)
  assert.match(form, /JSON\.stringify\(checkoutRequestBody\(itemId, billing, couponCode, founderTermsVersion, turnstileToken\)\)/);
  // the refresh near its expiry sends the same coupon and the same consent, never dropping either
  assert.equal(
    form.match(/startCheckout\(itemId, billing, couponCode\.current, termsVersion\.current, (turnstileToken|spent\.token)\)/g)?.length,
    2,
  );
  assert.match(form, /onClick=\{onStart\}/);
  // a double press is ignored by an in-flight ref, set before the POST
  assert.match(form, /if \(inFlight\.current \|\| current\.current\) return;\s*inFlight\.current = true;/);
  assert.match(form, /متابعة الدفع/);
  // the quote shown is the server's
  for (const field of ["ready.quote.net", "ready.quote.vat", "ready.quote.total", "quoteVatNotice(ready.quote.vatMode, ready.quote.vat)"]) {
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
  // l16 (A-59): an attached discount code may ride along
  assert.match(cards, /requestEntitlement\(\{ \.\.\.planEntitlementRequest\(plan, \{ libraryMode \}\),/);
  // the checkout branch sits after the /contact pass-through and before the request
  const contactAt = cards.indexOf("if (!isSubscribeCta(plan.ctaHref)) return false;");
  const payAt = cards.indexOf("const action = buyButtonAction(");
  const requestAt = cards.indexOf("requestEntitlement({ ...planEntitlementRequest(");
  assert.ok(contactAt > -1 && contactAt < payAt && payAt < requestAt);

  assert.match(subscribe, /const action = buyButtonAction\(planId, "once", payments, isLoggedIn\);/);
  assert.match(subscribe, /if \(action\.kind === "wait"\) return;/);
  const libPayAt = subscribe.indexOf("const action = buyButtonAction(");
  const libRequestAt = subscribe.indexOf('requestEntitlement({ kind: "library"');
  assert.ok(libPayAt > -1 && libPayAt < libRequestAt);
});

test("owner ١٦: the founder checkout carries an UNCHECKED terms checkbox; «متابعة الدفع» waits for it", () => {
  // the page hands the current version to the form, for the founder membership only
  assert.match(page, /founderTermsVersion=\{item\.kind === "membership" \? FOUNDER_TERMS_VERSION : null\}/);
  // the checkbox: the owner's label, unchecked at first, a link to /founder-terms in a new tab
  assert.match(form, /type="checkbox"/);
  assert.match(form, /const \[termsAccepted, setTermsAccepted\] = useState\(false\);/);
  assert.match(form, /const termsVersion = useRef<string \| null>\(null\);/);
  assert.match(form, /\{FOUNDER_CONSENT_LABEL_AR\}/);
  assert.match(form, /href=\{FOUNDER_TERMS_HREF\}\s*target="_blank"\s*rel="noopener noreferrer"/);
  // the version is sent only while the box is ticked
  assert.match(form, /termsVersion\.current = checked && needsTerms \? founderTermsVersion : null/);
  // the button is disabled, and a click ignored, until it is ticked
  // (S6b adds the Turnstile token to the same condition)
  assert.match(form, /disabled=\{phase\.kind === "starting" \|\| \(needsTerms && !termsAccepted\)( \|\| !captchaReady)?\}/);
  assert.match(form, /if \(needsTerms && !termsVersion\.current\) return;/);
});

test("S6b: the founder checkout carries a Turnstile token per attempt, spends it after every POST, and a captcha 403 is retryable", () => {
  // the page turns the widget on for the founder membership only
  assert.match(page, /captchaRequired=\{item\.kind === "membership"\}/);
  assert.match(form, /useTurnstile\(\{ isAr: true, theme, action: CHECKOUT_TURNSTILE_ACTION \}\)/);
  // the widget is rendered only when captchaRequired (other items load no script)
  const widgets = form.match(/\{captchaRequired \? <TurnstileWidget control=\{captcha\} isAr \/> : null\}/g) ?? [];
  assert.equal(widgets.length, 2, "before «متابعة الدفع» and beside the Moyasar form (for the refresh)");
  assert.doesNotMatch(form.replace(/\{captchaRequired \? <TurnstileWidget[^}]*\} isAr \/> : null\}/g, ""), /<TurnstileWidget/);
  // «متابعة الدفع» waits for a token; onStart refuses without one
  assert.match(form, /const captchaReady = !captchaRequired \|\| canSubmitWithCaptcha\(captcha\.state\);/);
  assert.match(form, /disabled=\{phase\.kind === "starting" \|\| \(needsTerms && !termsAccepted\) \|\| !captchaReady\}/);
  assert.match(form, /if \(!captchaReady\) return;/);
  // one token per attempt: spent in finally (any answer) and after the refresh POST
  assert.match(form, /\} finally \{\s*if \(captchaRequired\) captcha\.spend\(\);\s*inFlight\.current = false;/);
  assert.match(form, /spent\.token\);\s*if \(captchaRequired\) spent\.spend\(\);/);
  // a captcha 403 is checked before the audience mapping, and is not final
  const captchaAt = form.indexOf("=== CHECKOUT_CAPTCHA_CODE");
  const audienceAt = form.indexOf("audience: res.status === 403");
  assert.ok(captchaAt > 0 && captchaAt < audienceAt, "captcha first");
  assert.match(form, /=== CHECKOUT_CAPTCHA_CODE\) \{\s*return \{ ok: false, message: serverCopy \?\? CHECKOUT_CAPTCHA_REFUSED_AR, audience: false \};/);
});
