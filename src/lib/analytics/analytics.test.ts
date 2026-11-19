/**
 * analytics.test.ts — the rules of visitor analytics (analytics.ts): OFF
 * without ids, public routes only, consent cookie, the GA client id copied
 * only with consent, and the server purchase event.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ANALYTICS_EVENTS,
  analyticsIds,
  buildPurchasePayload,
  cleanPageLocation,
  CONSENT_COOKIE,
  consentCookieString,
  consentFromCookieHeader,
  gaSessionCookieName,
  isAnalyticsCookieName,
  isAnalyticsRoute,
  isFullMaskRoute,
  orderAnalyticsFromCookies,
  orderAnalyticsFromMetadata,
  parseGaClientId,
  parseGaSessionId,
  sendPurchaseEvent,
  validClarityId,
  validGa4Id,
  type PurchaseInput,
} from "./analytics.ts";

const SRC = join(import.meta.dirname, "../..");

test("everything is off without ids; ids are validated before they reach a URL", () => {
  assert.deepEqual(analyticsIds(undefined, undefined), { ga4Id: null, clarityId: null, enabled: false });
  assert.deepEqual(analyticsIds("", "  "), { ga4Id: null, clarityId: null, enabled: false });
  assert.equal(analyticsIds("G-ABC1234", undefined).enabled, true);
  assert.equal(analyticsIds(undefined, "k3x9a2b1c0").enabled, true);
  assert.equal(validGa4Id("g-abc1234"), "G-ABC1234");
  assert.equal(validGa4Id("G-ABC\"><script>"), null);
  assert.equal(validGa4Id("UA-12345-1"), null);
  assert.equal(validClarityId("abc/../x"), null);
  assert.equal(validClarityId("K3X9A2B1C0"), "k3x9a2b1c0");
});

test("public routes only: home, /founder, /pricing, /register/*, checkout and the payment result", () => {
  for (const ok of ["/", "/founder", "/founder/", "/pricing", "/register", "/register/provider", "/register/provider/verify", "/register/client", "/checkout", "/payments/result"]) {
    assert.equal(isAnalyticsRoute(ok), true, ok);
  }
  for (const no of [
    "/founder-terms", "/registerx", "/pricingx", "/checkouts", "/payments", "/payments/other",
    "/dashboard", "/dashboard/lawyer", "/dashboard/firm/cases", "/dashboard/client", "/dashboard/admin", "/dashboard/admin/subscriptions",
    "/ai", "/ai/draft", "/ai/assistant", "/laws", "/login", "/privacy", "/settings", "/blog/x", "//evil.example/founder", "", null, undefined,
  ]) {
    assert.equal(isAnalyticsRoute(no as string), false, String(no));
  }
});

test("the signup, verification and payment pages are masked whole", () => {
  assert.equal(isFullMaskRoute("/checkout"), true);
  assert.equal(isFullMaskRoute("/payments/result"), true);
  assert.equal(isFullMaskRoute("/register/provider"), true, "the registry lookup shows the licence as text");
  assert.equal(isFullMaskRoute("/register/provider/verify"), true);
  assert.equal(isFullMaskRoute("/register/client"), true);
  assert.equal(isFullMaskRoute("/founder"), false);
  assert.equal(isFullMaskRoute("/pricing"), false);
});

test("the consent cookie: two answers, remembered 180 days, first-party Lax", () => {
  assert.equal(CONSENT_COOKIE, "nz_consent");
  assert.equal(consentFromCookieHeader("a=1; nz_consent=granted; b=2"), "granted");
  assert.equal(consentFromCookieHeader("nz_consent=denied"), "denied");
  assert.equal(consentFromCookieHeader("nz_consent=yes"), null);
  assert.equal(consentFromCookieHeader(""), null);
  assert.equal(consentCookieString("denied", true), "nz_consent=denied; Max-Age=15552000; Path=/; SameSite=Lax; Secure");
  assert.equal(consentCookieString("granted", false), "nz_consent=granted; Max-Age=15552000; Path=/; SameSite=Lax");
});

test("withdrawing clears the GA and Clarity cookies, never ours", () => {
  for (const n of ["_ga", "_ga_ABC123", "_gid", "_clck", "_clsk"]) assert.equal(isAnalyticsCookieName(n), true, n);
  for (const n of ["nz_attr", "nz_consent", "sb-access-token", "nezamy-theme", "_gac"]) assert.equal(isAnalyticsCookieName(n), false, n);
});

test("the GA client id and session id are parsed from GA's own cookies", () => {
  assert.equal(parseGaClientId("GA1.1.1234567890.1731900000"), "1234567890.1731900000");
  assert.equal(parseGaClientId("GA1.2.55.66"), "55.66");
  assert.equal(parseGaClientId("GA1.1.abc.1"), null);
  assert.equal(parseGaClientId(""), null);
  assert.equal(parseGaSessionId("GS1.1.1731900000.3.1.1731900100.0.0.0"), "1731900000");
  assert.equal(parseGaSessionId("GS2.1.s1731900000$o3$g1$t1731900100$j0$l0$h0"), "1731900000");
  assert.equal(parseGaSessionId("junk"), null);
  assert.equal(gaSessionCookieName("G-ABC1234"), "_ga_ABC1234");
});

test("checkout copies the GA ids ONLY with consent and a GA4 id — never invents one", () => {
  const jar = (c: Record<string, string>) => (n: string) => c[n];
  const consented = { nz_consent: "granted", _ga: "GA1.1.111.222", _ga_ABC1234: "GS1.1.1731900000.1.0.1731900000.0.0.0" };
  assert.deepEqual(orderAnalyticsFromCookies(jar(consented), "G-ABC1234"), { ga_client_id: "111.222", ga_session_id: "1731900000" });
  assert.equal(orderAnalyticsFromCookies(jar({ ...consented, nz_consent: "denied" }), "G-ABC1234"), null);
  assert.equal(orderAnalyticsFromCookies(jar({ _ga: "GA1.1.111.222" }), "G-ABC1234"), null, "no answer = no");
  assert.equal(orderAnalyticsFromCookies(jar(consented), undefined), null, "GA4 off");
  assert.equal(orderAnalyticsFromCookies(jar({ nz_consent: "granted" }), "G-ABC1234"), null, "no _ga cookie");
  assert.deepEqual(orderAnalyticsFromCookies(jar({ nz_consent: "granted", _ga: "GA1.1.1.2" }), "G-ABC1234"), { ga_client_id: "1.2" });
});

test("page_location keeps origin, path and utm values only", () => {
  assert.equal(
    cleanPageLocation("https://nezamy.sa", "/payments/result", "?id=pay_123&status=paid&utm_source=x"),
    "https://nezamy.sa/payments/result?utm_source=x",
  );
  assert.equal(cleanPageLocation("https://nezamy.sa", "/register/provider", "?email=a@b.c"), "https://nezamy.sa/register/provider");
});

const ORDER: PurchaseInput = {
  orderId: "0f8e1c3a-0000-4000-8000-000000000001",
  itemId: "lawyer-founder-2026",
  itemName: "باقة المؤسس",
  kind: "membership",
  totalHalalas: 114885,
  currency: "SAR",
  metadata: { user_email: "a@b.c", analytics: { ga_client_id: "111.222", ga_session_id: "1731900000" } },
};

test("the purchase payload: the order id, the total incl. VAT in SAR, no personal data", () => {
  const p = buildPurchasePayload(ORDER)!;
  assert.equal(p.client_id, "111.222");
  const ev = (p.events as { name: string; params: Record<string, unknown> }[])[0];
  assert.equal(ev.name, ANALYTICS_EVENTS.purchase);
  assert.equal(ev.params.transaction_id, ORDER.orderId);
  assert.equal(ev.params.value, 1148.85);
  assert.equal(ev.params.currency, "SAR");
  assert.equal(ev.params.session_id, "1731900000");
  assert.doesNotMatch(JSON.stringify(p), /a@b\.c|user_email/);
  assert.equal(buildPurchasePayload({ ...ORDER, metadata: { user_email: "a@b.c" } }), null, "no consented id → nothing");
  assert.equal(orderAnalyticsFromMetadata({ analytics: { ga_client_id: "x<y" } }), null);
});

test("sendPurchaseEvent is off without the id or the secret, skips without consent, never throws", async () => {
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  assert.equal(await sendPurchaseEvent({ ga4Id: undefined, apiSecret: "s", fetchImpl }, ORDER), "off");
  assert.equal(await sendPurchaseEvent({ ga4Id: "G-ABC1234", apiSecret: "", fetchImpl }, ORDER), "off");
  assert.equal(await sendPurchaseEvent({ ga4Id: "G-ABC1234", apiSecret: "s", fetchImpl }, { ...ORDER, metadata: null }), "skipped");
  assert.equal(calls.length, 0);
  assert.equal(await sendPurchaseEvent({ ga4Id: "G-ABC1234", apiSecret: "s3cr3t", fetchImpl }, ORDER), "sent");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/www\.google-analytics\.com\/mp\/collect\?measurement_id=G-ABC1234&api_secret=s3cr3t$/);
  const throwing = (async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  assert.equal(await sendPurchaseEvent({ ga4Id: "G-ABC1234", apiSecret: "s", fetchImpl: throwing }, ORDER), "failed");
  const bad = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
  assert.equal(await sendPurchaseEvent({ ga4Id: "G-ABC1234", apiSecret: "s", fetchImpl: bad }, ORDER), "failed");
});

// ── wiring, read from the source ─────────────────────────────────────────────

const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the banner names only the configured tools", async () => {
  // the component module reads process.env at import: check the pure helper by its source contract
  const c = read("components/analytics/AnalyticsConsent.tsx");
  assert.match(c, /\{bannerToolsAr\(ANALYTICS\)\}/);
  assert.match(c, /if \(ids\.ga4Id && ids\.clarityId\) return "نستخدم أداتي قياس الزيارات Google Analytics وMicrosoft Clarity"/);
  assert.match(c, /if \(ids\.ga4Id\) return "نستخدم أداة قياس الزيارات Google Analytics"/);
  assert.match(c, /return "نستخدم أداة قياس الزيارات Microsoft Clarity"/);
});

test("the root layout mounts the banner; the scripts are loaded only from AnalyticsConsent", () => {
  assert.match(read("app/layout.tsx"), /<AnalyticsConsent \/>/);
  const c = read("components/analytics/AnalyticsConsent.tsx");
  assert.match(c, /process\.env\.NEXT_PUBLIC_GA4_ID/);
  assert.match(c, /process\.env\.NEXT_PUBLIC_CLARITY_ID/);
  assert.match(c, /googletagmanager\.com\/gtag\/js/);
  assert.match(c, /clarity\.ms\/tag\//);
  assert.match(c, /send_page_view: false/);
  assert.match(c, /allow_google_signals: false/);
  assert.match(c, /data-clarity-mask/);
  assert.match(c, /MASK_VALUE = "True"/, "Microsoft's documented value");
  // leaving the routes masks the page synchronously inside history, GA4 or not
  // (batch l9: and Clarity stops at sign-up / payment, so leaving its pages masks too)
  assert.match(c, /if \(leaving \|\| \(w\.__nzAnalyticsLoaded\?\.clarity && !isClarityRoute\(nextPath\)\)\) \{\s*document\.body\.setAttribute\(MASK_ATTR, MASK_VALUE\);/);
  assert.doesNotMatch(c, /__nzHistoryPatched \|\| !ANALYTICS\.ga4Id/);
  // «أوافق» and «لا أوافق» share one class
  assert.match(c, /onClick=\{\(\) => saveConsent\("granted"\)\} className=\{BUTTON\}/);
  assert.match(c, /onClick=\{\(\) => saveConsent\("denied"\)\} className=\{BUTTON\}/);
});

test("the owner's client events are wired where they happen", () => {
  assert.match(read("app/founder/page.tsx"), /data-analytics-event="reserve_seat_click"/);
  assert.match(read("app/founder/_components/PulsePopup.tsx"), /data-analytics-event="reserve_seat_click"/);
  assert.match(read("app/register/provider/page.tsx"), /trackEventOnce\("sign_up_start"/);
  assert.match(read("app/register/client/page.tsx"), /trackEventOnce\("sign_up_start"/);
  assert.match(read("app/register/provider/components/LawyerRegistryLookup.tsx"), /trackEvent\("licence_verified"/);
  const pay = read("components/payments/MoyasarCheckout.tsx");
  assert.match(pay, /trackEvent\("founder_consent_ticked"/);
  assert.match(pay, /trackEvent\("begin_checkout"/);
});

test("the server purchase event: copied at checkout, sent once after the fulfilment stamp", () => {
  assert.match(read("app/api/v1/payments/checkout/route.ts"), /orderAnalyticsFromCookies\(/);
  assert.match(read("lib/payments/checkoutCore.ts"), /analytics: input\.analytics/);
  assert.match(read("lib/payments/fulfillOrder.ts"), /GA4_API_SECRET/);
  assert.match(read("lib/payments/fulfillCore.ts"), /deps\.reportPurchase && order\.live === true && !granted\.alreadyEntitled/);
});

test("batch l9 (owner message 12 §10.7 / ك6): Clarity on public pages only — never sign-up or payment; GA4 keeps them", async () => {
  const m = await import("./analytics.ts");
  for (const p of ["/", "/founder", "/pricing", "/pricing/"]) assert.equal(m.isClarityRoute(p), true, p);
  for (const p of ["/register", "/register/provider/verify", "/checkout", "/payments/result", "/dashboard/lawyer", "/ai/draft", "/founder-terms", "/laws/x"]) {
    assert.equal(m.isClarityRoute(p), false, p);
  }
  // every Clarity page is an analytics page; sign-up and payment stay GA4 pages
  for (const r of m.CLARITY_ROUTES) assert.equal(m.isAnalyticsRoute(r), true, r);
  for (const p of ["/register", "/checkout", "/payments/result"]) assert.equal(m.isAnalyticsRoute(p), true, p);

  const c = read("components/analytics/AnalyticsConsent.tsx");
  // Clarity is injected only when the page is a Clarity page
  assert.match(c, /if \(clarityId && withClarity && !loaded\?\.clarity\) \{/);
  assert.match(c, /loadScripts\(w, clarityHere\);/);
  // Clarity loaded and now on sign-up / payment: masked, then a fresh load without it
  assert.match(c, /if \(loaded\?\.clarity && !clarityHere\) \{[\s\S]*?window\.location\.reload\(\);/);
  // a link from a Clarity page to sign-up / payment is a full page load
  assert.match(c, /if \(isAnalyticsRoute\(next\.pathname\) && \(!clarityOn \|\| isClarityRoute\(next\.pathname\)\)\) return;/);
  // the privacy page says so
  const privacy = read("app/privacy/page.tsx");
  assert.match(privacy, /وتعمل Microsoft Clarity في الصفحة الرئيسية وصفحة عضوية المؤسس وصفحة الأسعار فقط/);
  assert.match(privacy, /Microsoft Clarity runs only on the home page, the founder membership page and the pricing page/);
});
