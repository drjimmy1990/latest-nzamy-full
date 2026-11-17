/**
 * N12 (fix plan 2026-10-16): /blog had a «اشترك بـ RSS» button and a
 * «اشترك في النشرة القانونية» e-mail form, and neither did anything — the site
 * serves no feed, sends no newsletter and stored no address. They are removed
 * rather than faked. Source-read (a .tsx page cannot load under node --test);
 * comments are stripped because the ones explaining the removal quote it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

// The list lives in ./BlogList.tsx (shared by /blog and the category pages
// since 4 Oct item 99); ./page.tsx only renders it. Both are read.
const code = ["./page.tsx", "./BlogList.tsx"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

// P1-39 (2026-11-18): the site now serves /blog/rss.xml. The feed is advertised
// in the <head> (./layout.tsx metadata), not as a button in the list.
test("the blog feed exists and the layout advertises it in the head", () => {
  assert.equal(existsSync(new URL("./rss.xml/route.ts", import.meta.url)), true);
  const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
  assert.ok(layout.includes('"application/rss+xml": [{ url: `${BASE_URL}/blog/rss.xml`'), "layout metadata alternates.types");
  for (const feed of ["rss.xml", "feed.xml", "feed"]) {
    assert.equal(existsSync(new URL(`../${feed}/route.ts`, import.meta.url)), false, `a second feed at /${feed}`);
  }
});

test("the blog list still has no RSS button (the feed is in the head)", () => {
  assert.doesNotMatch(code, /<Rss\b/);
});

test("the blog has no newsletter sign-up that stores nothing", () => {
  assert.doesNotMatch(code, /النشرة القانونية|Newsletter|بريدك الإلكتروني/);
  assert.doesNotMatch(code, /<input[^>]*placeholder=\{isRTL \? "بريدك/);
});
