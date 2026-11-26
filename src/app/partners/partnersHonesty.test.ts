/**
 * D-37 (owner package 25-Nov): /partners printed made-up figures («+١٢٠ ألف»
 * active users, «٥,٢٠٠+» cases, «٩٧٪» satisfaction, «+٣٤٠» partners), a
 * «guaranteed revenue» line, a partner dashboard that does not exist, a dead
 * «تعرف على المزيد» on every card, and no Navbar or Footer.
 * Source-read: a .tsx page cannot load under node --test.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/partners/partnersHonesty.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
// Comments may name what was removed; the rendered code may not.
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("no invented figure is rendered", () => {
  assert.doesNotMatch(code, /١٢٠|120K|٥,٢٠٠|5,200|٩٧٪|97%|٣٤٠|340\+/);
  assert.doesNotMatch(code, /const stats = /);
  assert.doesNotMatch(code, /آلاف المستخدمين|thousands daily/);
});

test("no guarantee and no partner dashboard is promised", () => {
  assert.doesNotMatch(code, /مضمونة|تضمن لك|Guaranteed|guarantees/);
  assert.doesNotMatch(code, /لوحة تحكم شريك|partner dashboard/i);
});

test("every card's link goes somewhere (the form), and the page has the site's Navbar and Footer", () => {
  assert.doesNotMatch(code, /تعرف على المزيد/);
  assert.match(code, /<a href="#apply" className=\{`mt-4 inline-flex/);
  assert.match(code, /<section id="apply"/);
  assert.match(code, /<Navbar \/>/);
  assert.match(code, /<Footer \/>/);
});
