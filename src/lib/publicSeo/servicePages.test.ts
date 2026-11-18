/**
 * Owner 18 Nov, item 4.2 (SEO audit ح2): every /services/* page has its own
 * server layout with a self canonical, and no two service pages share a title
 * or a description. The folders are walked, so a new service page without an
 * entry or a layout fails here.
 *
 * buildMetadata (src/lib/seo.ts) is loaded for real, so the canonical pinned
 * below is the one Next prints.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/publicSeo/servicePages.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetadata } from "../seo.ts";
import { SERVICE_PAGES, servicePageSeo } from "./servicePages.ts";

const SERVICES_DIR = fileURLToPath(new URL("../../app/services", import.meta.url));

/** Every /services/<…> path that has a page.tsx (the /services index itself excluded). */
function servicePagePaths(dir = SERVICES_DIR, prefix = "/services"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    const path = `${prefix}/${name}`;
    if (existsSync(join(full, "page.tsx"))) out.push(path);
    out.push(...servicePagePaths(full, path));
  }
  return out;
}

const paths = servicePagePaths();

test("the walk found the service pages", () => {
  assert.ok(paths.length >= 20, `only ${paths.length}`);
  assert.ok(paths.includes("/services/contracts"));
  assert.ok(paths.includes("/services/business/trademark"));
});

test("every service page has an entry, and every entry is a real page", () => {
  assert.deepEqual([...paths].sort(), Object.keys(SERVICE_PAGES).sort());
});

test("every service page has its own server layout that asks for its own path", () => {
  for (const path of paths) {
    const file = join(SERVICES_DIR, path.slice("/services/".length), "layout.tsx");
    assert.ok(existsSync(file), `${file} missing`);
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /^\s*["']use client["']/m, `${file} must be a server layout`);
    assert.ok(src.includes(`buildMetadata(servicePageSeo("${path}"))`), `${file} must ask for ${path}`);
  }
});

test("the canonical is the page itself — never /services", () => {
  for (const path of paths) {
    const meta = buildMetadata(servicePageSeo(path));
    assert.equal(meta.alternates?.canonical, `https://nezamy.sa${path}`, path);
    assert.equal((meta.openGraph as { url?: string } | undefined)?.url, `https://nezamy.sa${path}`, path);
  }
});

test("titles and descriptions are unique, Arabic-only titles, and not /services's own", () => {
  const titles = paths.map((p) => String(buildMetadata(servicePageSeo(p)).title));
  const descriptions = paths.map((p) => String(buildMetadata(servicePageSeo(p)).description));
  assert.equal(new Set(titles).size, titles.length, "duplicate title");
  assert.equal(new Set(descriptions).size, descriptions.length, "duplicate description");
  for (const t of titles) {
    assert.ok(!t.startsWith("الخدمات القانونية |"), t);
    assert.doesNotMatch(t.replace(/نظامي \| Nezamy$/, ""), /[A-Za-z]/, `English in ${t}`);
  }
});

test("the sign-in tool page (/services/lawyers/vault) is noindex; the public service pages are indexable", () => {
  for (const path of paths) {
    const robots = buildMetadata(servicePageSeo(path)).robots as { index?: boolean };
    assert.equal(robots.index, path !== "/services/lawyers/vault", path);
  }
});

test("an unknown path is a loud error, not a silent /services canonical", () => {
  assert.throws(() => servicePageSeo("/services/nope"), /no entry/);
});
