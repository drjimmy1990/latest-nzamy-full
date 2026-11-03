/**
 * homeBookingButton.wiring.test.ts — owner q358 / review M7: the client home
 * has ONE «اطلب استشارة» button and it opens the booking wizard, because the
 * label promises a consultation. «كل الخدمات» still leads to the catalogue.
 *
 * The page imports Next and the `@/` alias, which node:test cannot load, so
 * this file reads its source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("the client home has one «اطلب استشارة» button and it goes to /dashboard/client/consultation/new", () => {
  const src = read("./page.tsx");
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  const labels = code.match(/اطلب استشارة/g) ?? [];
  assert.equal(labels.length, 1, "expected exactly one «اطلب استشارة» in the rendered markup");
  const at = code.indexOf("اطلب استشارة");
  const linkStart = code.lastIndexOf("<Link", at);
  const link = code.slice(linkStart, at);
  assert.match(link, /<Link href="\/dashboard\/client\/consultation\/new">/);
  assert.ok(!/<\/Link>/.test(link), "the label is not inside the nearest <Link>");
  assert.match(code, /<Link href="\/dashboard\/client\/services"[^>]*>[\s\S]{0,400}?كل الخدمات/, "«كل الخدمات» keeps the catalogue link");
});
