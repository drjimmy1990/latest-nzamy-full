/**
 * utmAttribution.test.ts — F13: the first-touch utm cookie (utmAttribution.ts).
 * The proxy wiring is pinned in src/proxy.attribution.test.ts; the order's
 * metadata.attribution in src/lib/payments/checkoutCore.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_S,
  attributionCookieOptions,
  attributionFromUrl,
  cleanLandingPath,
  cleanUtmValue,
  parseAttributionCookie,
  serializeAttribution,
  shouldCaptureAttribution,
} from "./utmAttribution.ts";

const NOW = new Date("2026-11-18T09:30:00.000Z");
const params = (q: string) => new URLSearchParams(q);

test("the five utm values, the landing path and the first-seen time — nothing else", () => {
  const a = attributionFromUrl(
    params("utm_source=twitter&utm_medium=social&utm_campaign=founder-launch&utm_content=video1&utm_term=lawyer&email=a@b.c&gclid=X"),
    "/founder",
    NOW,
  );
  assert.deepEqual(a, {
    utm_source: "twitter",
    utm_medium: "social",
    utm_campaign: "founder-launch",
    utm_content: "video1",
    utm_term: "lawyer",
    landing_path: "/founder",
    first_seen_at: NOW.toISOString(),
  });
});

test("a URL without any usable utm value stores nothing", () => {
  assert.equal(attributionFromUrl(params(""), "/founder", NOW), null);
  assert.equal(attributionFromUrl(params("ref=x&email=a@b.c"), "/", NOW), null);
  assert.equal(attributionFromUrl(params("utm_source=%20%20&utm_campaign="), "/", NOW), null);
});

test("one utm value is enough; the others stay absent", () => {
  assert.deepEqual(attributionFromUrl(params("utm_campaign=nov18"), "/pricing", NOW), {
    utm_campaign: "nov18",
    landing_path: "/pricing",
    first_seen_at: NOW.toISOString(),
  });
});

test("values are bounded and cleaned: controls, bidi overrides and markup characters are dropped; Arabic is kept", () => {
  assert.equal(cleanUtmValue("x".repeat(500))?.length, 64);
  assert.equal(cleanUtmValue("a\u0000b‮c<script>\"'`;\\d"), "abcscriptd");
  assert.equal(cleanUtmValue("حملة المؤسس"), "حملة المؤسس");
  assert.equal(cleanUtmValue(5), null);
  assert.equal(cleanUtmValue("   "), null);
});

test("the landing path is a path only — never the query, never another origin", () => {
  assert.equal(cleanLandingPath("/founder?email=a@b.c#x"), "/founder");
  assert.equal(cleanLandingPath("//evil.example/x"), null);
  assert.equal(cleanLandingPath("https://evil.example/"), null);
  assert.equal(cleanLandingPath("/a<b"), null);
  assert.equal(cleanLandingPath("/" + "a".repeat(400))?.length, 160);
  assert.equal(attributionFromUrl(params("utm_source=x"), "//evil", NOW)?.landing_path, "/");
});

test("the cookie round-trips, and a tampered cookie is re-validated or refused", () => {
  const a = attributionFromUrl(params("utm_source=google&utm_campaign=c1"), "/founder", NOW)!;
  assert.deepEqual(parseAttributionCookie(serializeAttribution(a)), a);

  for (const bad of [undefined, null, "", "not json", "[]", "null", JSON.stringify({ utm_source: "x" }), "x".repeat(4000)]) {
    assert.equal(parseAttributionCookie(bad as string | undefined), null, String(bad).slice(0, 30));
  }
  // no utm left after cleaning → nothing
  assert.equal(parseAttributionCookie(JSON.stringify({ utm_source: "\u0000", landing_path: "/", first_seen_at: NOW.toISOString() })), null);
  // extra keys are dropped, long values cut, a bad date refused
  const tampered = parseAttributionCookie(
    JSON.stringify({ utm_source: "y".repeat(300), user_id: "u1", email: "a@b.c", landing_path: "/x", first_seen_at: NOW.toISOString() }),
  );
  assert.deepEqual(Object.keys(tampered ?? {}).sort(), ["first_seen_at", "landing_path", "utm_source"]);
  assert.equal(tampered?.utm_source?.length, 64);
  assert.equal(parseAttributionCookie(JSON.stringify({ utm_source: "x", landing_path: "/", first_seen_at: "soon" })), null);
});

const h = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;

test("captured only on a top-level GET page load with no cookie yet", () => {
  const nav = { method: "GET", pathname: "/founder", hasCookie: false, header: h({ "sec-fetch-mode": "navigate" }) };
  assert.equal(shouldCaptureAttribution(nav), true);
  assert.equal(shouldCaptureAttribution({ ...nav, header: h({ accept: "text/html,application/xhtml+xml" }) }), true, "an old browser without sec-fetch");
  assert.equal(shouldCaptureAttribution({ ...nav, hasCookie: true }), false, "first touch: never overwritten");
  assert.equal(shouldCaptureAttribution({ ...nav, method: "POST" }), false);
  assert.equal(shouldCaptureAttribution({ ...nav, pathname: "/api/v1/payments/checkout" }), false);
  assert.equal(shouldCaptureAttribution({ ...nav, pathname: "/_next/data/x.json" }), false);
  assert.equal(shouldCaptureAttribution({ ...nav, header: h({ "sec-fetch-mode": "cors" }) }), false);
  assert.equal(shouldCaptureAttribution({ ...nav, header: h({ "sec-fetch-mode": "navigate", "next-router-prefetch": "1" }) }), false);
  assert.equal(shouldCaptureAttribution({ ...nav, header: h({ "sec-fetch-mode": "navigate", rsc: "1" }) }), false);
  assert.equal(shouldCaptureAttribution({ ...nav, header: h({ "sec-fetch-mode": "navigate", "sec-purpose": "prefetch;prerender" }) }), false);
  assert.equal(shouldCaptureAttribution({ ...nav, header: h({ accept: "*/*" }) }), false);
});

test("cookie options: httpOnly, SameSite=Lax, 30 days, Secure in production, whole site", () => {
  assert.equal(ATTRIBUTION_COOKIE, "nz_attr");
  assert.equal(ATTRIBUTION_MAX_AGE_S, 30 * 24 * 60 * 60);
  assert.deepEqual(attributionCookieOptions(true), { httpOnly: true, sameSite: "lax", secure: true, maxAge: 2592000, path: "/" });
  assert.equal(attributionCookieOptions(false).secure, false);
});
