/**
 * proxy.libraryQuota.test.ts — owner note ١٣ C03 / C07 / C09 in src/proxy.ts.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/proxy.libraryQuota.test.ts
 *
 * A source-contract test (proxy.ts imports next/server and cannot be run in
 * node:test — see proxy.membership.test.ts). The WHICH-PATHS half is executed
 * in src/lib/rateLimitRoutes.test.ts and src/lib/library/readQuota.test.ts;
 * this file pins the HOW: where the step sits, who the user is, and that it
 * fails open.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fs
  .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "proxy.ts"), "utf8")
  .replace(/\r\n/g, "\n");

const fnBody = (() => {
  const start = SRC.indexOf("async function applyLibraryReadQuota(");
  assert.ok(start > 0, "applyLibraryReadQuota is defined");
  const end = SRC.indexOf("\n}\n", start);
  return SRC.slice(start, end);
})();

test("the quota step runs right after the rate limiter, before redirects and every auth gate", () => {
  const body = SRC.slice(SRC.indexOf("export default async function proxy("));
  const rl = body.indexOf("applyRateLimit(req, pathname)");
  const quota = body.indexOf("await applyLibraryReadQuota(req, pathname)");
  const redirects = body.indexOf("REDIRECTS[pathname]");
  assert.ok(rl > 0 && quota > rl && redirects > quota, "rate limit → quota → redirects");
});

test("the user comes from a verified getUser(), never from decoding the cookie", () => {
  assert.match(fnBody, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(fnBody, /atob|Buffer\.from|jwt|decode/i);
  // Guests (no session cookie and no bearer token) skip the auth round trip.
  assert.match(fnBody, /if \(!bearerToken && !hasSupabaseAuthCookie\(/);
});

test("a native-app bearer token is counted too (server.ts serves it as a session)", () => {
  assert.match(fnBody, /req\.headers\.get\("authorization"\)/);
  assert.match(fnBody, /supabase\.auth\.getUser\(bearerToken\)/);
});

test("a token refresh during getUser() reaches the route and the browser (branch 1b's cookie pattern)", () => {
  assert.match(fnBody, /req\.cookies\.set\(name, value\)/);
  assert.match(fnBody, /response\.cookies\.set\(name, value, options\)/);
  assert.match(fnBody, /const response = NextResponse\.next\(\{ request: req \}\)/);
  // A refusal carries those cookies too.
  assert.match(fnBody, /response\.cookies\.getAll\(\)\.forEach\(\(c\) => refused\.cookies\.set\(c\)\)/);
});

test("it fails open: no user, no answer, or a throw lets the request through", () => {
  assert.match(fnBody, /if \(error \|\| !user\) return response;/);
  assert.match(fnBody, /if \(!refusal\) return response;/);
  assert.match(fnBody, /\} catch \{\n    return null;\n  \}/);
});

test("every note-١٣ bucket is checked per visitor AND per proxy-resolved IP", () => {
  assert.match(SRC, /const libraryBuckets = libraryBudgetBuckets\(method, pathname\);/);
  assert.match(SRC, /rateLimiter\.check\(`\$\{bucket\}-ip`, ip, policy\.ip\)/);
  assert.match(SRC, /rateLimiter\.check\(bucket, key, policy\.visitor\)/);
  for (const bucket of ["library-any", "library-doc", "library-init", "library-ai"]) {
    assert.match(SRC, new RegExp(`"${bucket}": \\{ visitor: \\{`), bucket);
  }
});
