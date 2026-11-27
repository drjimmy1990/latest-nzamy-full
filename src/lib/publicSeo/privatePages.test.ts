/**
 * Owner 18 Nov, item 4.3 (SEO audit ع2): private pages are noindex and out of
 * sitemap.xml. One list (privatePages.ts) feeds the X-Robots-Tag rules of
 * next.config.ts, the <meta name="robots"> of the private sections' server
 * layouts and the sitemap filter.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/publicSeo/privatePages.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  PRIVATE_CACHE_CONTROL,
  PRIVATE_PATH_PREFIXES,
  PRIVATE_ROBOTS,
  PRIVATE_ROBOTS_HEADER,
  isPrivatePath,
  privateRobotsHeaderRules,
} from "./privatePages.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

test("isPrivatePath is segment-wise and ignores origin, query, hash and a trailing slash", () => {
  for (const p of [
    "/login", "/login/", "/login?next=/x", "https://nezamy.sa/register/provider", "/dashboard/admin/users",
    "/settings", "/ai/draft", "/ai/corp/compliance", "/academy/my-courses", "/services/lawyers/vault",
    "/checkout#pay", "/track/abc", "/laws/my",
  ]) assert.ok(isPrivatePath(p), p);
  for (const p of [
    "/", "/loginx", "/laws", "/laws/companies-law", "/laws/mystery-law", "/services/lawyers", "/ai",
    "/ai/legal-translate", "/academy", "/academy/quiz", "/blog/x", "/founder", "/pricing", "/faq",
    "/marketplace", "/registered-trademarks",
  ]) assert.ok(!isPrivatePath(p), p);
});

test("every sign-in page of src/proxy.ts's PROTECTED list is private", () => {
  const proxy = read("../../proxy.ts");
  const block = proxy.slice(proxy.indexOf("const PROTECTED = ["), proxy.indexOf("];", proxy.indexOf("const PROTECTED = [")));
  const protectedPaths = [...stripComments(block).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(protectedPaths.length > 20, `read only ${protectedPaths.length}`);
  for (const p of protectedPaths) assert.ok(isPrivatePath(p), `${p} is PROTECTED but indexable`);
});

/** The PROTECTED list of src/proxy.ts, read from the file (a new prefix is picked up by itself). */
function proxyProtectedPaths(): string[] {
  const proxy = read("../../proxy.ts");
  const at = proxy.indexOf("const PROTECTED = [");
  const block = proxy.slice(at, proxy.indexOf("];", at));
  return [...stripComments(block).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** next.config.ts's header rules as Next applies them: every matching rule in order, the later one wins per key. */
async function configHeadersFor(path: string): Promise<Map<string, string>> {
  const cfg = (await import("../../../next.config.ts")).default as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
  const rules = await cfg.headers();
  const out = new Map<string, string>();
  for (const rule of rules) {
    const re = new RegExp(
      "^" +
        rule.source
          .replace(/\./g, "[.]")
          .replace(/\/:path\*/g, "(?:/.*)?")
          .replace(/\/:[a-z]+/gi, "/[^/]+") +
        "$",
    );
    if (re.test(path)) for (const h of rule.headers) out.set(h.key.toLowerCase(), h.value);
  }
  return out;
}

test("l19 review B1: every PROTECTED page of src/proxy.ts (and everything under it) answers private, no-store", async () => {
  const protectedPaths = proxyProtectedPaths();
  assert.ok(protectedPaths.length > 20, `read only ${protectedPaths.length}`);
  for (const p of protectedPaths) {
    for (const path of [p, `${p}/x`]) {
      const cc = (await configHeadersFor(path)).get("cache-control") ?? "";
      assert.match(cc, /no-store/, `${path}: Cache-Control is «${cc}»`);
      assert.ok(cc === PRIVATE_CACHE_CONTROL || /no-store/.test(cc), path);
    }
  }
  // the prerendered sign-in pages the review found (prerender-manifest × PROTECTED)
  for (const path of ["/ai/legal-opinion", "/ai/draft", "/ai/assistant", "/ai/corp/compliance", "/notifications", "/onboarding", "/academy/my-courses", "/academy/certificates", "/marketplace/post", "/marketplace/collaborate", "/dashboard/lawyer"]) {
    assert.equal((await configHeadersFor(path)).get("cache-control"), PRIVATE_CACHE_CONTROL, path);
  }
  // the stricter rules further down still win on their own paths
  assert.equal((await configHeadersFor("/ai/wargaming")).get("cache-control"), "no-store, must-revalidate");
  assert.equal((await configHeadersFor("/track/abc")).get("cache-control"), "private, no-store, max-age=0");
});

test("l19 review B1: the public pages get no Cache-Control from the config (their SEO caching is unchanged)", async () => {
  for (const path of ["/", "/laws", "/laws/companies-law", "/pricing", "/blog/x", "/services/lawyers", "/ai", "/ai/legal-translate", "/ai/analyze", "/academy", "/marketplace", "/faq", "/founder"]) {
    assert.equal((await configHeadersFor(path)).get("cache-control"), undefined, path);
  }
});

test("the X-Robots-Tag rules: noindex, follow on each prefix and everything under it", () => {
  assert.equal(PRIVATE_ROBOTS_HEADER, "noindex, follow");
  assert.deepEqual({ ...PRIVATE_ROBOTS }, { index: false, follow: true });
  const rules = privateRobotsHeaderRules();
  assert.equal(rules.length, PRIVATE_PATH_PREFIXES.length * 2);
  for (const prefix of PRIVATE_PATH_PREFIXES) {
    for (const source of [prefix, `${prefix}/:path*`]) {
      const rule = rules.find((r) => r.source === source);
      assert.ok(rule, source);
      assert.deepEqual(rule.headers, [
        { key: "X-Robots-Tag", value: "noindex, follow" },
        { key: "Cache-Control", value: "private, no-store" },
      ]);
    }
  }
});

test("next.config.ts sends those rules, and makes metadata blocking for every user agent", () => {
  // Not comment-stripped: the file's own strings ("…/public/**") would read as a comment opener.
  const cfg = read("../../../next.config.ts");
  assert.match(cfg, /import \{ privateRobotsHeaderRules \} from "\.\/src\/lib\/publicSeo\/privatePages\.ts";/);
  assert.match(cfg, /\.\.\.privateRobotsHeaderRules\(\),/);
  // Before the stricter /track/:token rule, so that one wins.
  assert.ok(cfg.indexOf("...privateRobotsHeaderRules()") < cfg.indexOf('source: "/track/:token"'));
  // Owner item 2.7 / 4: one HTML for a crawler and a visitor — no streamed metadata for anybody.
  assert.match(cfg, /^  htmlLimitedBots: \/\.\*\/,$/m);
});

test("sitemap.xml names no private page, and filters them out anyway", () => {
  const src = stripComments(read("../../app/sitemap.ts"));
  const urls = [...src.matchAll(/\{ url: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length > 40, `read only ${urls.length}`);
  assert.deepEqual(urls.filter(isPrivatePath), []);
  for (const gone of ["/login", "/register", "/academy/my-courses", "/academy/certificates", "/services/lawyers/vault", "/ai/draft", "/ai/legal-opinion"]) {
    assert.ok(!urls.includes(gone), gone);
  }
  // Audit: public pages that were missing.
  for (const added of ["/erp", "/refund-policy"]) assert.ok(urls.includes(added), added);
  assert.match(src, /\.filter\(\(r\) => !isPrivatePath\(r\.url\)\)/);
});

test("robots.txt does not newly disallow a private page whose noindex must be read", () => {
  // Batch l9: robots.txt is built by robotsTxt.ts (a route handler).
  const robots = read("./robotsTxt.ts");
  for (const p of ["/login", "/register", "/checkout", "/settings", "/onboarding"]) {
    assert.ok(!robots.includes(`"${p}"`) && !robots.includes(`"${p}/"`), p);
  }
});

/** The top-level private sections that have (or now get) a server layout printing the meta tag. */
const META_LAYOUTS = [
  "dashboard", "settings", "login", "register", "forgot-password", "reset-password", "onboarding",
  "auth", "demo-login", "invite", "group", "account-frozen", "account-suspended", "device-limit", "share", "review",
  "cases", "academy/my-courses", "academy/certificates",
];

test("each private section's server layout prints <meta name=\"robots\" content=\"noindex, follow\">", () => {
  for (const dir of META_LAYOUTS) {
    const file = new URL(`../../app/${dir}/layout.tsx`, import.meta.url);
    assert.ok(existsSync(file), `${dir}/layout.tsx missing`);
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /^\s*["']use client["']/m, `${dir}/layout.tsx must be a server layout`);
    assert.match(src, /robots: PRIVATE_ROBOTS/, dir);
    assert.ok(isPrivatePath(`/${dir}`), dir);
  }
});
