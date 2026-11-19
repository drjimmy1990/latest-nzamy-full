/**
 * A made-up address must answer HTTP 404.
 *
 * src/app/[...slug]/page.tsx, there from the first commit until 2026-11-07,
 * rendered a normal page for every path no other route matched, so Next.js
 * answered 200 for made-up pages, made-up /api/ paths and made-up files such
 * as /_next/static/chunks/x.js. Its «الصفحة غير موجودة» text told a person the
 * truth while the status told crawlers and caches the opposite, and Cloudflare
 * stored the HTML under any address ending in .js or .png.
 *
 * A status can only be read from a running build, so this file pins the cause
 * and `npm run test:smoke` (its MISSING list) pins the status itself. Run that
 * against a production build with SMOKE_BASE_URL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Every folder under src/app that is a catch-all segment and holds a page. */
function catchAllPages(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    const isCatchAll = entry.name.startsWith("[...") || entry.name.startsWith("[[...");
    if (isCatchAll && ["tsx", "ts", "jsx", "js"].some((ext) => existsSync(path.join(child, `page.${ext}`)))) {
      found.push(path.relative(APP_DIR, child));
    }
    found.push(...catchAllPages(child));
  }
  return found;
}

test("no catch-all page can answer 200 for an address that has no route", () => {
  assert.deepEqual(catchAllPages(APP_DIR), []);
});

test("an unmatched address has the site's own not-found page to land on", () => {
  assert.ok(existsSync(path.join(APP_DIR, "not-found.tsx")));
});

/* ── Dynamic routes (owner file 20 §2, file 15 row 42; batch l9) ───────────
 * A missing blog article answered 200 + index,follow + /blog's canonical: the
 * blog's loading.tsx wrapped /blog/[slug], so a 200 streamed before notFound()
 * ran. The status itself is pinned by the MISSING list of
 * scripts/smoke-routes.mjs (run against a build with a database). */

const readApp = (rel: string) => readFileSync(path.join(APP_DIR, rel), "utf8").replace(/\r\n/g, "\n");

/** loading.tsx files in the folders ABOVE a route (its own folder included). */
function loadingAbove(routeDir: string): string[] {
  const found: string[] = [];
  let dir = path.join(APP_DIR, routeDir);
  while (dir.startsWith(APP_DIR)) {
    if (existsSync(path.join(dir, "loading.tsx"))) found.push(path.relative(APP_DIR, dir) || ".");
    if (dir === APP_DIR) break;
    dir = path.dirname(dir);
  }
  return found;
}

test("no loading boundary sits above a blog article or a blog category page", () => {
  assert.deepEqual(loadingAbove("blog/[slug]"), []);
  assert.deepEqual(loadingAbove("blog/category/[slug]"), []);
  // the list keeps its shimmer, inside the (list) route group (URL unchanged: /blog)
  assert.ok(existsSync(path.join(APP_DIR, "blog", "(list)", "loading.tsx")));
  assert.ok(existsSync(path.join(APP_DIR, "blog", "(list)", "page.tsx")));
  assert.ok(!existsSync(path.join(APP_DIR, "blog", "page.tsx")));
});

test("a missing blog article is a real 404 from the metadata; a failed read is not a 404", () => {
  const page = readApp("blog/[slug]/page.tsx");
  assert.match(page, /if \(!data\) return \{ status: "not_found" \};/);
  assert.match(page, /if \(error\) \{[^}]*return \{ status: "error" \}; \}/);
  // the metadata: noindex, no canonical; the page body: the real 404 (a definite miss only)
  assert.match(page, /if \(load\.status === "not_found"\) \{\n\s*return \{ title: [^\n]*robots: \{ index: false, follow: false \}, alternates: \{ canonical: null \} \};/);
  assert.equal(page.match(/if \(load\.status === "not_found"\) notFound\(\);/g)?.length, 1);
  // /blog's canonical is the list page's, not the layout's (a 404 must not inherit it)
  assert.doesNotMatch(readApp("blog/layout.tsx"), /buildMetadata\(|canonical:|path: "\/blog"/);
  assert.match(readApp("blog/(list)/page.tsx"), /path: "\/blog",/);
  assert.match(page, /if \(load\.status === "error"\) throw new Error/);
  assert.doesNotMatch(page, /المقال غير موجود/, "no 200 «not found» page with an inherited canonical");
  const category = readApp("blog/category/[slug]/page.tsx");
  assert.match(category, /if \(!category\) notFound\(\);\n  return buildMetadata/);
});

test("library readers: a document that does not exist is a real 404 from the metadata (never on closed / error / legacy slugs)", () => {
  const seo = readFileSync(path.join(APP_DIR, "../lib/library/libraryDocumentSeo.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(seo, /return load\.status === "not_found" && !isLegacySlug\(kind, rawSlug\);/);
  for (const [layout, kind] of [["laws/[slug]/layout.tsx", "law"], ["laws/orders/[slug]/layout.tsx", "order"], ["precedents/[slug]/layout.tsx", "collection"], ["book/[slug]/layout.tsx", "book"]]) {
    const src = readApp(layout);
    assert.match(src, /export async function generateMetadata[\s\S]*libraryDocMetadata\(/, layout);
    assert.ok(src.includes(`if (isMissingLibraryDoc("${kind}", slug, load)) notFound();`), layout);
  }
});

test("the smoke run checks the three addresses the owner tried", () => {
  const smoke = readFileSync(path.join(APP_DIR, "../../scripts/smoke-routes.mjs"), "utf8");
  for (const p of ["/blog/no-such-article-xyz", "/laws/no-such-law-xyz", "/blog/category/no-such-xyz"]) {
    assert.ok(smoke.includes(`"${p}"`), p);
  }
});
