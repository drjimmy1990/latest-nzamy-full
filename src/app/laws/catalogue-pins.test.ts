import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("١٢-ب: the principles tab lists 12 a page", () => {
  const tab = read("./components/PrecedentsTabContent.tsx");
  assert.match(tab, /export const PRINCIPLES_PER_PAGE = 12;/);
  assert.match(tab, /const itemsPerPage = PRINCIPLES_PER_PAGE;/);
});

test("١٢-ج: the instant box counts the fiqh section beside the other three", () => {
  const page = read("./page.tsx");
  for (const k of ["precedents", "laws", "orders", "feqh"]) {
    assert.match(page, new RegExp(`autocompleteBadge\\("${k}"`), `badge for ${k}`);
  }
  assert.match(page, /الفقه والمراجع \(\{autocompleteBadge\("feqh"/);
});
