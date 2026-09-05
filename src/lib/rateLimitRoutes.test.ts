/**
 * rateLimitRoutes.test.ts — run with: node --test src/lib/rateLimitRoutes.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  isStrictRateLimitedRoute,
  isGeneralRateLimitedApiPath,
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
