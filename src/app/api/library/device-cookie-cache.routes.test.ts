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

test("the routes that call enforceLibraryDevice are exactly these (six library + three AI)", () => {
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
  assert.deepEqual(found.sort(), [...ROUTES, ...NO_STORE_ROUTES, ...EXPORT_ROUTES, ...AI_ROUTES].sort());
});

const ROUTES = [
  "app/api/library/books/[slug]/route.ts",
  "app/api/library/decrees/[id]/route.ts",
  "app/api/library/laws/[slug]/route.ts",
  "app/api/library/precedents/[slug]/route.ts",
  "app/api/library/scoped-search/route.ts",
] as const;

/**
 * Batch l6 (N06-34): the AI citation sheet reads one cited text; its responses all use its own NO_STORE.
 * Batch l8-refbox (owner item 6): the links box's text preview, likewise.
 */
const NO_STORE_ROUTES = ["app/api/v1/ai/source-preview/route.ts", "app/api/library/laws/[slug]/citations/preview/route.ts"] as const;

/**
 * Batch l12 lib-draft (owner file 03 ل2): the draft's Word download applies the
 * device rule before its one quota read, like a document route; its file and
 * refusals are private, no-store (draftExport.test.ts pins the order).
 */
const EXPORT_ROUTES = ["app/api/library/draft-export/route.ts"] as const;

/**
 * l19 review B2 (owner ٢٣٣ «المساعد الذكي، أدوات AI»): the AI run route, the
 * free-question status and the site assistant apply the account device rule,
 * so they can mint the cookie too — every response of theirs that follows the
 * check is private, no-store (the site assistant's public GET, which runs no
 * check, keeps its one-minute cache).
 */
const AI_ROUTES = ["app/api/v1/ai/runs/route.ts", "app/api/v1/ai/free-question/route.ts", "app/api/v1/chatbot/route.ts"] as const;

for (const rel of AI_ROUTES) {
  test(`${rel}: every response after the device check is private, no-store`, () => {
    const src = read(rel);
    assert.match(src, /const NO_STORE = \{ "Cache-Control": "private, no-store" \};/);
    const fromCheck = src.slice(src.indexOf("enforceLibraryDevice("));
    const calls = jsonCalls(fromCheck);
    assert.ok(calls.length >= 2, "the route's responses were found");
    for (const call of calls) assert.match(call, /headers: (NO_STORE|\{ \.\.\.NO_STORE[^}]*\})/, `${rel}: ${call.slice(0, 120)}…`);
  });
}

for (const rel of NO_STORE_ROUTES) {
  test(`${rel}: every response is private, no-store`, () => {
    const src = read(rel);
    assert.match(src, /const NO_STORE = \{ "Cache-Control": "private, no-store" \};/);
    const calls = jsonCalls(src);
    assert.ok(calls.length >= 3, "the route's responses were found");
    for (const call of calls) assert.match(call, /headers: NO_STORE \},?\s*\)$/, `${rel}: ${call.slice(0, 120)}…`);
  });
}

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
