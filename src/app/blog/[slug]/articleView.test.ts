/**
 * ArticleView (owner package 2026-10-22 §38). Source-read: a .tsx page cannot
 * load under node --test, so the pure parts live in ./_article-md.ts (tested
 * in ./_article-md.test.ts) and this file pins the wiring. Comments are
 * stripped, because the ones explaining a removal quote what was removed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("./ArticleView.tsx", import.meta.url), "utf8");
const code = raw
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

// ─── N1.5: the author is not a link to an outside site ───────────────────────

test("N1.5: the author header never links out (no author URL, no new tab to it)", () => {
  assert.doesNotMatch(code, /author\.url|authorUrl/);
  // The share buttons are the only links that open a new tab.
  const blankTargets = code.match(/target="_blank"/g) ?? [];
  assert.equal(blankTargets.length, 1, "only the share-target map opens a new tab");
  assert.match(code, /href=\{href\}\s+target="_blank"/);
});

test("N1.5: consultations are asked through the platform, at /book/consultation", () => {
  assert.match(code, /href="\/book\/consultation"/);
  assert.match(code, /اطلب استشارة قانونية عبر منصة نظامي/);
  assert.match(code, /href="\/services\/consultations"/);
  assert.doesNotMatch(code, /href="\/contact"/);
});

// ─── N1.6: the TOC lights up gold, by IntersectionObserver ───────────────────

test("N1.6: scroll-spy is an IntersectionObserver, with no scroll listener or layout reads", () => {
  assert.match(code, /new IntersectionObserver\(/);
  assert.match(code, /nextActiveTocId\(order, visible, prev\)/);
  assert.match(code, /io\.disconnect\(\)/);
  assert.doesNotMatch(code, /addEventListener\(\s*["']scroll/);
  assert.doesNotMatch(code, /getBoundingClientRect|offsetTop|scrollY/);
});

test("N1.6: the observer's hooks run above the mounted early return", () => {
  const io = code.indexOf("new IntersectionObserver(");
  const early = code.indexOf("if (!mounted) return null;");
  assert.ok(io > -1 && early > -1 && io < early);
});

test("N1.6: both TOCs use gold for hover and the active entry, in light and dark", () => {
  const from = code.indexOf("toc.items.map((t, i) =>");
  assert.ok(from > -1);
  const sidebar = code.slice(from, code.indexOf("related.map(", from));
  assert.doesNotMatch(sidebar, /group-hover:text-\[#0B3D2E\]/, "the desktop hover was green in light mode");
  assert.match(sidebar, /group-hover:text-\[#C8A762\]/);
  assert.match(sidebar, /active \? `\$\{TOC_GOLD\} font-bold`/);
  assert.match(code, /const TOC_GOLD = "text-\[#C8A762\]";/);
  assert.match(code, /if \(active\) return `\$\{TOC_GOLD\} font-bold`;/);
  assert.match(code, /return `hover:text-\[#C8A762\] \$\{isDark/);
  assert.equal((code.match(/aria-current=\{/g) ?? []).length, 2, "both lists mark the active entry");
});
