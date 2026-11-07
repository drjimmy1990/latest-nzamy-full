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
import { existsSync, readdirSync } from "node:fs";
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
