/**
 * rateLimitRoutes.test.ts — run with: node --test src/lib/rateLimitRoutes.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  isStrictRateLimitedRoute,
  isGeneralRateLimitedApiPath,
  isLibraryReadRateLimitedRoute,
  libraryReadClientKey,
  isTrackingPageRoute,
  isCouponValidateRoute,
  isTrackingUnlockRoute,
  isAttachmentsZipRoute,
  libraryBudgetBuckets,
  canonicalApiPath,
} from "./rateLimitRoutes.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── isStrictRateLimitedRoute ────────────────────────────────────────────────

test("isStrictRateLimitedRoute: matches all four listed POST actions with a real token/code in place", () => {
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/share/abc123/verify"), true);
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/library/invitations/redeem"), true);
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/invite/xyz789/accept"), true);
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/contact"), true);
});

test("isStrictRateLimitedRoute: only POST counts, not GET/PUT/etc on the same path", () => {
  assert.equal(isStrictRateLimitedRoute("GET", "/api/v1/contact"), false);
  assert.equal(isStrictRateLimitedRoute("PUT", "/api/v1/share/abc123/verify"), false);
  assert.equal(isStrictRateLimitedRoute("DELETE", "/api/v1/invite/xyz789/accept"), false);
});

test("isStrictRateLimitedRoute: the dynamic segment is a single path segment, not a multi-segment wildcard", () => {
  // A slash inside what would need to be the [token]/[code] segment must not match.
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/share/abc/def/verify"), false);
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/invite/abc/def/accept"), false);
});

test("isStrictRateLimitedRoute: a neighbouring, unrelated route does not match", () => {
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/invite/xyz789"), false); // no /accept
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/library/invitations"), false); // no /redeem
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/share/abc123/verify/extra"), false);
});

// ─── isGeneralRateLimitedApiPath ─────────────────────────────────────────────

test("isGeneralRateLimitedApiPath: true for each mutating method under /api/v1", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(isGeneralRateLimitedApiPath(method, "/api/v1/lawyer/consultations"), true, method);
  }
});

test("isGeneralRateLimitedApiPath: false for GET/HEAD/OPTIONS — read-only methods are never limited", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(isGeneralRateLimitedApiPath(method, "/api/v1/lawyer/consultations"), false, method);
  }
});

test("isGeneralRateLimitedApiPath: false for anything outside /api/v1", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v2/lawyer/consultations"), false);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/dashboard/client"), false);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1"), false); // no trailing slash, no subpath
});

test("isGeneralRateLimitedApiPath: excludes the /api/v1/cron/ subtree", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/cron/deadlines"), false);
});

test("isGeneralRateLimitedApiPath: excludes the /api/v1/n8n/ subtree", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/n8n/callback"), false);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/n8n/trigger"), false);
});

test("isGeneralRateLimitedApiPath: excludes exactly /api/v1/payments/webhook (Moyasar's retries must never be throttled)", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/webhook"), false);
  // exact path only: the rest of /api/v1/payments/ stays limited
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/checkout"), true);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/webhookx"), true);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/webhook/x"), true);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/payments/webhooks"), true);
});

test("isGeneralRateLimitedApiPath: does NOT exclude a path that merely starts with the same letters", () => {
  // /api/v1/n8n-lookalike/... must not be swept up by the /api/v1/n8n/ exclusion.
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/n8n-lookalike/foo"), true);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/crontab/foo"), true);
});

test("isGeneralRateLimitedApiPath: the four strict-bucket routes also qualify for the general bucket", () => {
  // Documented, deliberate double-counting — see src/proxy.ts's rate-limiting
  // header. A strict-matched request is checked against BOTH buckets.
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/contact"), true);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/share/abc123/verify"), true);
});

// ─── isLibraryReadRateLimitedRoute ───────────────────────────────────────────

test("isLibraryReadRateLimitedRoute: search (POST) and the two article-text GET routes match", () => {
  // search/route.ts exports only POST — a GET-only rule would never fire on it.
  assert.equal(isLibraryReadRateLimitedRoute("POST", "/api/library/search"), true);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/autocomplete"), true);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/laws/labor-law"), true);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/laws/%D9%86%D8%B8%D8%A7%D9%85"), true);
  // N2.6: the in-document search reads the server-only text as the service role too.
  assert.equal(isLibraryReadRateLimitedRoute("POST", "/api/library/scoped-search"), true);
});

test("isLibraryReadRateLimitedRoute: other methods and other library routes do not", () => {
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/search"), false);
  assert.equal(isLibraryReadRateLimitedRoute("POST", "/api/library/laws/labor-law"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/init"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/laws/a/b"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/books/x"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/searchx"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/scoped-search"), false);
  assert.equal(isLibraryReadRateLimitedRoute("POST", "/api/library/scoped-searchx"), false);
});

test("libraryReadClientKey: Cloudflare's visitor address wins; otherwise the proxy's resolved IP", () => {
  const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
  assert.equal(libraryReadClientKey(h({ "cf-connecting-ip": " 203.0.113.9 " }), "172.70.1.1"), "203.0.113.9");
  assert.equal(libraryReadClientKey(h({}), "172.70.1.1"), "172.70.1.1");
  assert.equal(libraryReadClientKey(h({ "cf-connecting-ip": "  " }), "172.70.1.1"), "172.70.1.1");
  assert.equal(libraryReadClientKey(h({ "cf-connecting-ip": "x".repeat(200) }), "f").length, 64);
});

// ─── isTrackingPageRoute (N3.6) ──────────────────────────────────────────────

test("isTrackingPageRoute: the public case tracking page, GET and HEAD, one token segment", () => {
  const token = "a".repeat(64);
  assert.equal(isTrackingPageRoute("GET", `/track/${token}`), true);
  assert.equal(isTrackingPageRoute("HEAD", `/track/${token}`), true);
  assert.equal(isTrackingPageRoute("GET", "/track/anything-a-scanner-tries"), true, "a guessing script is counted whatever it sends");
  assert.equal(isTrackingPageRoute("POST", `/track/${token}`), false);
  assert.equal(isTrackingPageRoute("GET", "/track"), false);
  assert.equal(isTrackingPageRoute("GET", `/track/${token}/x`), false);
  assert.equal(isTrackingPageRoute("GET", "/tracker"), false);
  assert.equal(isTrackingPageRoute("GET", "/ai/tracker"), false);
});

// ─── isCouponValidateRoute (P7) ─────────────────────────────────────────────

test("isCouponValidateRoute: POST /api/v1/coupons/validate only — its own bucket, not the shared strict one", () => {
  assert.equal(isCouponValidateRoute("POST", "/api/v1/coupons/validate"), true);
  assert.equal(isCouponValidateRoute("GET", "/api/v1/coupons/validate"), false);
  assert.equal(isCouponValidateRoute("POST", "/api/v1/coupons/validate/x"), false);
  assert.equal(isCouponValidateRoute("POST", "/api/v1/coupons"), false);
  // not in the strict bucket (ten coupon guesses must not lock out the contact form)
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/coupons/validate"), false);
  // still in the general bucket too
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/coupons/validate"), true);
});

test("isTrackingUnlockRoute: the tracking link's 4-digit check (D2), POST, one token segment — not the shared-IP strict bucket", () => {
  const token = "a".repeat(64);
  assert.equal(isTrackingUnlockRoute("POST", `/api/v1/track/${token}/unlock`), true);
  assert.equal(isTrackingUnlockRoute("GET", `/api/v1/track/${token}/unlock`), false);
  assert.equal(isTrackingUnlockRoute("POST", `/api/v1/track/${token}/x/unlock`), false);
  assert.equal(isTrackingUnlockRoute("POST", `/api/v1/track/${token}`), false);
  assert.equal(isTrackingUnlockRoute("POST", `/track/${token}/unlock`), false);
  assert.equal(isStrictRateLimitedRoute("POST", `/api/v1/track/${token}/unlock`), false);
  assert.equal(isGeneralRateLimitedApiPath("POST", `/api/v1/track/${token}/unlock`), true, "the general write bucket still applies");
});

test("isAttachmentsZipRoute: the ZIP download (D3), GET and HEAD, the exact path only — its own bucket, not the write bucket", () => {
  assert.equal(isAttachmentsZipRoute("GET", "/api/v1/attachments/zip"), true);
  assert.equal(isAttachmentsZipRoute("HEAD", "/api/v1/attachments/zip"), true);
  assert.equal(isAttachmentsZipRoute("POST", "/api/v1/attachments/zip"), false);
  assert.equal(isAttachmentsZipRoute("GET", "/api/v1/attachments/zip/x"), false);
  assert.equal(isAttachmentsZipRoute("GET", "/api/v1/attachments"), false);
  assert.equal(isAttachmentsZipRoute("GET", "/api/v1/attachments/zipper"), false);
  assert.equal(isGeneralRateLimitedApiPath("GET", "/api/v1/attachments/zip"), false, "reads are not in the general bucket");
});
test("isGeneralRateLimitedApiPath: n8n's AI callback is exempt, the browser's AI runs route is not", () => {
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/ai/callback"), false);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/ai/runs"), true);
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/ai/callback/x"), true);
});

// ─── libraryBudgetBuckets (owner note ١٣ C03) ────────────────────────────────

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "api");

/** Every route.ts under `dir`, as [url path with sample segments, exported methods]. */
function routesUnder(dir: string): Array<{ url: string; methods: string[] }> {
  const out: Array<{ url: string; methods: string[] }> = [];
  const walk = (abs: string) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name === "route.ts") {
        const rel = path.relative(API_DIR, path.dirname(next)).split(path.sep)
          .map((seg) => (/^\[.+\]$/.test(seg) ? "sample-1" : seg));
        const src = fs.readFileSync(next, "utf8");
        const methods = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\b/g)]
          .map((m) => m[1]);
        out.push({ url: "/api/" + rel.join("/"), methods });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

test("note ١٣ C03: EVERY route under /api/library, /api/v1/library and /api/ai has a budget, for every method it exports", () => {
  const routes = [
    ...routesUnder(path.join(API_DIR, "library")),
    ...routesUnder(path.join(API_DIR, "v1", "library")),
    ...routesUnder(path.join(API_DIR, "ai")),
  ];
  assert.ok(routes.length >= 20, `only ${routes.length} routes found — is the walk looking in the right place?`);
  for (const { url, methods } of routes) {
    assert.ok(methods.length > 0, `${url}: no exported handler found`);
    for (const method of methods) {
      assert.ok(libraryBudgetBuckets(method, url).length > 0, `${method} ${url} has no budget`);
    }
  }
});

test("libraryBudgetBuckets: documents, catalogue and AI get their own tighter bucket as well", () => {
  for (const p of ["/api/library/laws/x", "/api/library/books/x", "/api/library/precedents/x", "/api/library/decrees/x"]) {
    assert.deepEqual(libraryBudgetBuckets("GET", p), ["library-any", "library-doc"], p);
  }
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/library/init"), ["library-any", "library-init"]);
  assert.deepEqual(libraryBudgetBuckets("POST", "/api/ai/library-chat"), ["library-ai"]);
  assert.deepEqual(libraryBudgetBuckets("POST", "/api/ai/explain-article"), ["library-ai"]);
  // Routes that only exist on the open library branch are covered already.
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/library/search/suggest"), ["library-any"]);
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/v1/library/my-grant"), ["library-any"]);
  // Invitations: the redeem keeps the strict bucket AND the library catch-all.
  assert.deepEqual(libraryBudgetBuckets("POST", "/api/v1/library/invitations/redeem"), ["library-any"]);
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/library/invitations/redeem"), true);
});

test("libraryBudgetBuckets: percent-encoding a static segment does not dodge a bucket", () => {
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/librar%79/laws/x"), ["library-any", "library-doc"]);
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/library/law%73/x"), ["library-any", "library-doc"]);
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/library/ini%74"), ["library-any", "library-init"]);
  assert.deepEqual(libraryBudgetBuckets("POST", "/api/a%69/library-chat"), ["library-ai"]);
  assert.equal(canonicalApiPath("/api/library/laws%2Fx"), "/api/library/laws%2Fx");
  assert.equal(canonicalApiPath("/api/library/%E0%A4%A"), "/api/library/%E0%A4%A");
});

test("libraryBudgetBuckets: neighbours are not swept in", () => {
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/librarything"), []);
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/v1/libraryx/status"), []);
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/aim"), []);
  assert.deepEqual(libraryBudgetBuckets("GET", "/laws/labor-law"), []);
  assert.deepEqual(libraryBudgetBuckets("POST", "/api/v1/ai/runs"), []);
  // A document sub-path or a write is not a document read.
  assert.deepEqual(libraryBudgetBuckets("GET", "/api/library/laws/x/y"), ["library-any"]);
  assert.deepEqual(libraryBudgetBuckets("POST", "/api/library/laws/x"), ["library-any"]);
});
