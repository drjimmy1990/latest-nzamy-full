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
} from "./rateLimitRoutes.ts";

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
});

test("isLibraryReadRateLimitedRoute: other methods and other library routes do not", () => {
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/search"), false);
  assert.equal(isLibraryReadRateLimitedRoute("POST", "/api/library/laws/labor-law"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/init"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/laws/a/b"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/books/x"), false);
  assert.equal(isLibraryReadRateLimitedRoute("GET", "/api/library/searchx"), false);
});

test("libraryReadClientKey: Cloudflare's visitor address wins; otherwise the proxy's resolved IP", () => {
  const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
  assert.equal(libraryReadClientKey(h({ "cf-connecting-ip": " 203.0.113.9 " }), "172.70.1.1"), "203.0.113.9");
  assert.equal(libraryReadClientKey(h({}), "172.70.1.1"), "172.70.1.1");
  assert.equal(libraryReadClientKey(h({ "cf-connecting-ip": "  " }), "172.70.1.1"), "172.70.1.1");
  assert.equal(libraryReadClientKey(h({ "cf-connecting-ip": "x".repeat(200) }), "f").length, 64);
});
