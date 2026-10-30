/**
 * robots.txt (owner note ١٤ §٢ item ١٠): the build's static files open, the
 * API and the other /_next/ paths closed, the library sitemaps listed, and the
 * noindex judgment page left crawlable so its tag can be read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "./robots.ts";

const r = robots();
const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules) as { allow?: string | string[]; disallow?: string | string[] };
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const allow = list(rule.allow);
const disallow = list(rule.disallow);

/** Google's rule: the longest matching path wins; on a tie, allow. */
function allowed(path: string): boolean {
  const best = (paths: string[]) => Math.max(-1, ...paths.filter((p) => path.startsWith(p)).map((p) => p.length));
  return best(allow) >= best(disallow);
}

test("Googlebot may load /_next/static/ and /_next/image, not the rest of /_next/ or /api/", () => {
  assert.ok(allowed("/_next/static/chunks/app/laws/page.js"));
  assert.ok(allowed("/_next/static/css/app.css"));
  assert.ok(allowed("/_next/image?url=%2Fog-image.png&w=640&q=75"));
  assert.ok(!allowed("/_next/data/build/laws.json"));
  assert.ok(!allowed("/api/library/laws/x"));
  assert.ok(!allowed("/api/v1/library/status"));
});

test("the other disallows are kept", () => {
  for (const p of ["/dashboard/", "/api/", "/ai/settings", "/ai/vault", "/ai/share-history", "/track/", "/_next/"]) {
    assert.ok(disallow.includes(p), p);
  }
});

test("library pages are crawlable — the judgment page too (its noindex must be readable)", () => {
  for (const p of ["/laws/x", "/laws/orders/x", "/precedents/x", "/precedents/judgment/x", "/book/x"]) assert.ok(allowed(p), p);
});

test("robots lists the site map and the four library document maps", () => {
  assert.deepEqual(r.sitemap, [
    "https://nezamy.sa/sitemap.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/laws.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/orders.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/collections.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/books.xml",
  ]);
});
