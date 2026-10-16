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

const code = readFileSync(new URL("./page.tsx", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("the blog has no RSS button while the site serves no feed", () => {
  assert.doesNotMatch(code, /<Rss\b|RSS/);
  for (const feed of ["rss.xml", "feed.xml", "feed"]) {
    assert.equal(existsSync(new URL(`../${feed}/route.ts`, import.meta.url)), false, `a /${feed} route now exists: link it instead`);
  }
});

test("the blog has no newsletter sign-up that stores nothing", () => {
  assert.doesNotMatch(code, /النشرة القانونية|Newsletter|بريدك الإلكتروني/);
  assert.doesNotMatch(code, /<input[^>]*placeholder=\{isRTL \? "بريدك/);
});
