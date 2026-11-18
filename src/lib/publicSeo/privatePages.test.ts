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

test("the X-Robots-Tag rules: noindex, follow on each prefix and everything under it", () => {
  assert.equal(PRIVATE_ROBOTS_HEADER, "noindex, follow");
  assert.deepEqual({ ...PRIVATE_ROBOTS }, { index: false, follow: true });
  const rules = privateRobotsHeaderRules();
  assert.equal(rules.length, PRIVATE_PATH_PREFIXES.length * 2);
  for (const prefix of PRIVATE_PATH_PREFIXES) {
    for (const source of [prefix, `${prefix}/:path*`]) {
      const rule = rules.find((r) => r.source === source);
      assert.ok(rule, source);
      assert.deepEqual(rule.headers, [{ key: "X-Robots-Tag", value: "noindex, follow" }]);
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
  const robots = read("../../app/robots.ts");
  for (const p of ["/login", "/register", "/checkout", "/settings", "/onboarding"]) {
    assert.ok(!robots.includes(`"${p}`), p);
  }
});

/** The top-level private sections that have (or now get) a server layout printing the meta tag. */
const META_LAYOUTS = [
  "dashboard", "settings", "login", "register", "forgot-password", "reset-password", "onboarding",
  "auth", "demo-login", "invite", "group", "account-frozen", "account-suspended", "share", "review",
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
