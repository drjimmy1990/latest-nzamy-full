/**
 * 4 Oct item 99 (owner question ٩٩): one page per blog category,
 * /blog/category/<slug> — the owner's example is /blog/category/labor —
 * linked from the category pills and listed in the sitemap.
 * The .tsx files cannot load under node --test, so they are source-read
 * (comments stripped); the slug rules are the pure module.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  BLOG_CATEGORY_AR,
  BLOG_CATEGORY_PAGES,
  BLOG_CATEGORY_SLUGS,
  blogCategoryBySlug,
  blogCategorySlug,
  blogCategoryValues,
} from "./_categories.ts";

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
const read = (rel: string) => stripComments(readFileSync(new URL(rel, import.meta.url), "utf8"));

test("every category in _categories.ts has a slug: ASCII, unique, one page each", () => {
  const codes = Object.keys(BLOG_CATEGORY_AR);
  assert.equal(codes.length, 30);
  assert.deepEqual(Object.keys(BLOG_CATEGORY_SLUGS).sort(), [...codes].sort());
  const slugs = Object.values(BLOG_CATEGORY_SLUGS);
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique");
  assert.equal(BLOG_CATEGORY_PAGES.length, 30);
  // The owner's example URL.
  assert.equal(BLOG_CATEGORY_SLUGS.sec_06_labor, "labor");
});

test("a slug resolves to its category and back; an unknown slug is no category", () => {
  for (const page of BLOG_CATEGORY_PAGES) {
    assert.equal(page.label, BLOG_CATEGORY_AR[page.code]);
    assert.deepEqual(blogCategoryBySlug(page.slug), page);
    assert.equal(blogCategorySlug(page.label), page.slug);
    assert.equal(blogCategorySlug(page.code), page.slug);
  }
  for (const bad of ["", "LABOR", "sec_06_labor", "unknown", "labor/"]) {
    assert.equal(blogCategoryBySlug(bad), null, bad);
  }
});

test("a stored value from either numbering finds its page; a free label or unknown code has none", () => {
  assert.equal(blogCategorySlug("sec_07_labor"), "labor"); // blog_sections numbering
  assert.equal(blogCategorySlug("sec_05_commercial"), "commercial");
  assert.equal(blogCategorySlug("sec_08_real_estate"), "real-estate-construction");
  assert.equal(blogCategorySlug("الدفاع والأمن"), null); // free frontmatter label
  assert.equal(blogCategorySlug("sec_99_unknown"), null);
  assert.equal(blogCategorySlug(""), null);
  assert.equal(blogCategorySlug(null), null);
});

test("a category page's first request already filters: its label and its code", () => {
  const labor = blogCategoryBySlug("labor");
  assert.ok(labor);
  assert.deepEqual(blogCategoryValues(labor.label, []), [labor.label, "sec_06_labor"].sort());
  // What /api/v1/blog/categories adds (the other numbering) joins in, once each, sorted.
  assert.deepEqual(
    blogCategoryValues(labor.label, ["sec_07_labor", labor.label]),
    [labor.label, "sec_06_labor", "sec_07_labor"].sort(),
  );
  // A free label stands for itself; «الكل» filters nothing.
  assert.deepEqual(blogCategoryValues("الدفاع والأمن", []), ["الدفاع والأمن"]);
  assert.deepEqual(blogCategoryValues("all", ["x"]), []);
});

test("the category page: static params from _categories.ts, awaited params, notFound, metadata", () => {
  const file = new URL("./category/[slug]/page.tsx", import.meta.url);
  assert.ok(existsSync(file), "src/app/blog/category/[slug]/page.tsx exists");
  const code = read("./category/[slug]/page.tsx");
  assert.doesNotMatch(code, /^\s*["']use client["']/m, "a server component");
  assert.match(code, /export function generateStaticParams\(\)/);
  assert.match(code, /BLOG_CATEGORY_PAGES\.map\(/);
  assert.match(code, /export async function generateMetadata\(/);
  assert.match(code, /await params/);
  assert.match(code, /notFound\(\)/);
  assert.match(code, /export const dynamicParams = false/);
});

test("the pills link to the category pages, «الكل» to /blog", () => {
  const code = read("./BlogList.tsx");
  assert.match(code, /`\/blog\/category\/\$\{slug\}`/);
  assert.match(code, /\{ id: "all", [^}]*href: "\/blog" \}/);
  // Pills are links now, not in-page buttons.
  assert.match(code, /<Link key=\{cat\.id\} href=\{cat\.href\}/);
  assert.doesNotMatch(code, /setCategory\(/);
  // /blog keeps its route, rendering the same list.
  const page = read("./page.tsx");
  assert.match(page, /<BlogList \/>/);
});

test("the sitemap source lists /blog/category/", () => {
  const code = read("../sitemap.ts");
  assert.match(code, /\/blog\/category\//);
  assert.match(code, /blogCategorySlug\(/);
});
