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
