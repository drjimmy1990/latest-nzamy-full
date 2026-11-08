/**
 * device-cookie-cache.routes.test.ts — final review of batch 2026-11-08, item
 * 12: every library route that can mint the `nz_lib_device` cookie (it calls
 * enforceLibraryDevice, owner ٤٢٧) answers EVERY response with
 * `Cache-Control: private, no-store`. A shared cache (nginx proxy cache,
 * Cloudflare) must never keep a response that carries a Set-Cookie or a
 * subscriber's full text — the cookie is minted before the text is built, so it
 * can ride on an error answered after the device check as well.
 *
 * Source contract (the routes import next/server).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/library/device-cookie-cache.routes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

/** Every `NextResponse.json(…)` call in `src`, arguments included (balanced parentheses). */
function jsonCalls(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf("NextResponse.json(");
  while (at >= 0) {
    let depth = 0;
    let end = at + "NextResponse.json".length;
    for (; end < src.length; end += 1) {
      const c = src[end];
      if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(at, end + 1));
    at = src.indexOf("NextResponse.json(", end);
  }
  return out;
}

test("the routes that call enforceLibraryDevice are exactly these five", () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name === "route.ts" && /enforceLibraryDevice\(/.test(fs.readFileSync(p, "utf8"))) {
        found.push(path.relative(SRC, p).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(SRC, "app"));
  assert.deepEqual(found.sort(), [...ROUTES].sort());
});

const ROUTES = [
  "app/api/library/books/[slug]/route.ts",
  "app/api/library/decrees/[id]/route.ts",
  "app/api/library/laws/[slug]/route.ts",
  "app/api/library/precedents/[slug]/route.ts",
  "app/api/library/scoped-search/route.ts",
] as const;

for (const rel of ROUTES) {
  test(`${rel}: every response is private, no-store`, () => {
    const src = read(rel);
    const calls = jsonCalls(src);
    assert.ok(calls.length >= 2, "the route's responses were found");
    for (const call of calls) {
      const ok =
        /headers: \{ 'Cache-Control': TIER_SHAPED_CACHE_CONTROL \}/.test(call) ||
        // the in-document search's quota refusal builds its headers first
        (/, headers \}\)$/.test(call) && /const headers: Record<string, string> = \{ 'Cache-Control': 'private, no-store' \};/.test(src));
      assert.ok(ok, `${rel}: ${call.slice(0, 120)}…`);
    }
    assert.match(src, /import \{ [^}]*TIER_SHAPED_CACHE_CONTROL[^}]* \} from '[^']*_official-meta';/);
  });
}

test("the refusals the routes hand back as they are are private, no-store too", () => {
  assert.match(read("lib/library/deviceLimitServer.ts"), /headers: \{ "Cache-Control": "private, no-store" \}/);
  assert.match(read("lib/library/libraryDocQuota.ts"), /"Cache-Control": "private, no-store"/);
  assert.match(read("app/api/library/laws/[slug]/_official-meta.ts"), /export const TIER_SHAPED_CACHE_CONTROL = "private, no-store";/);
});
