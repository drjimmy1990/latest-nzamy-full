/**
 * O5 (batch l11-sec): `X-Robots-Tag: noindex, noarchive` on /api/library/*.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isLibraryApiPath, LIBRARY_API_ROBOTS_HEADER, LIBRARY_API_ROBOTS_VALUE } from "./libraryApiRobots.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

test("O5: the library API paths, and only those", () => {
  for (const p of ["/api/library", "/api/library/laws/x", "/api/library/search", "/api/library/precedents/abc/text"]) {
    assert.equal(isLibraryApiPath(p), true, p);
  }
  for (const p of ["/laws/labor-law", "/api/librarything", "/api/v1/library/status", "/library", "/api/v1/laws"]) {
    assert.equal(isLibraryApiPath(p), false, p);
  }
  assert.equal(LIBRARY_API_ROBOTS_HEADER, "X-Robots-Tag");
  assert.equal(LIBRARY_API_ROBOTS_VALUE, "noindex, noarchive");
});

test("O5: the proxy sets it on the outermost response (handlers' and its own refusals alike)", () => {
  const proxy = readFileSync(join(ROOT, "src/proxy.ts"), "utf8");
  assert.match(
    proxy,
    /export default async function proxy\(req: NextRequest\) \{\s*return withLibraryApiNoIndex\(req, withLibrarySessionCookie\(req, withAttributionCookie\(req, await proxyRoutes\(req\)\)\)\);/,
  );
  assert.match(proxy, /response\.headers\.set\(LIBRARY_API_ROBOTS_HEADER, LIBRARY_API_ROBOTS_VALUE\)/);
  // the matcher still reaches /api/library (it excludes static files only)
  const matcher = proxy.slice(proxy.indexOf("export const config"));
  assert.doesNotMatch(matcher, /api\/library|\(\?!api/);
});
