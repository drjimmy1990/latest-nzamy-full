/**
 * proxy.attribution.test.ts — F13: how src/proxy.ts sets the first-touch utm
 * cookie. The proxy imports next/server and cannot run under `node --test`,
 * so the wiring is pinned in the source; the rules themselves are executed in
 * src/lib/attribution/utmAttribution.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(import.meta.dirname, "proxy.ts"), "utf8").replace(/\r\n/g, "\n");

const wrapper = SRC.slice(SRC.indexOf("function withAttributionCookie("), SRC.indexOf("export default async function proxy("));

test("every response passes through the cookie step: the default export only wraps proxyRoutes", () => {
  assert.match(SRC, /export default async function proxy\(req: NextRequest\) \{\n  return withAttributionCookie\(req, await proxyRoutes\(req\)\);\n\}/);
  assert.equal(SRC.match(/export default/g)?.length, 1);
  assert.ok(SRC.indexOf("export default async function proxy(") < SRC.indexOf("async function proxyRoutes("));
});

test("set only when shouldCaptureAttribution says so (GET page load, no cookie yet) and the URL carries utm values", () => {
  assert.match(wrapper, /shouldCaptureAttribution\(\{\s*method: req\.method,\s*pathname: req\.nextUrl\.pathname,\s*hasCookie: req\.cookies\.has\(ATTRIBUTION_COOKIE\),/);
  assert.match(wrapper, /const attribution = attributionFromUrl\(req\.nextUrl\.searchParams, req\.nextUrl\.pathname, new Date\(\)\);\s*if \(!attribution\) return response;/);
  assert.match(
    wrapper,
    /response\.cookies\.set\(\s*ATTRIBUTION_COOKIE,\s*serializeAttribution\(attribution\),\s*attributionCookieOptions\(process\.env\.NODE_ENV === "production"\),\s*\)/,
  );
});

test("cheap and harmless: no DB, no network, no session read, and a throw never breaks the page", () => {
  for (const banned of [/createServerClient/, /\.from\(/, /\.rpc\(/, /fetch\(/, /getUser\(/, /await /]) {
    assert.doesNotMatch(wrapper, banned, String(banned));
  }
  assert.match(wrapper, /\} catch \{[\s\S]*?\}\s*return response;\s*\}/);
});
