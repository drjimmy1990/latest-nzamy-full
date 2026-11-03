import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { matchArticleJump, type JumpArticle } from "./articleJump.ts";

const arts: JumpArticle[] = [
  { id: "a8", num: "المادة الثامنة", number: 8, numberText: "الثامنة", title: "" },
  { id: "a12", num: "المادة الثانية عشرة", number: 12, numberText: "الثانية عشرة", title: "تعريفات" },
  { id: "a112", num: "المادة 112", number: 112, numberText: null, title: "" },
  { id: "x5", num: "المادة ٥", number: null, numberText: null, title: "الغرامة" },
];

test("a number jumps to that article only, in either digit script", () => {
  assert.deepEqual(matchArticleJump("١٢", arts), ["a12"]);
  assert.deepEqual(matchArticleJump("12", arts), ["a12"]);
  assert.deepEqual(matchArticleJump(" 112 ", arts), ["a112"]);
  // No `number`: the whole number inside the locator.
  assert.deepEqual(matchArticleJump("5", arts), ["x5"]);
  assert.deepEqual(matchArticleJump("", arts), []);
});

test("a locator or a title jumps through the library grammar", () => {
  assert.deepEqual(matchArticleJump("الثامنة", arts), ["a8"]);
  assert.deepEqual(matchArticleJump("تعريفات", arts), ["a12"]);
  assert.deepEqual(matchArticleJump("الغرامه", arts), ["x5"]);
});

test("the article text is never searched", () => {
  const withText = [{ id: "t1", num: "المادة الأولى", number: 1, numberText: "الأولى", title: "", text: "غرامة" }];
  assert.deepEqual(matchArticleJump("غرامة", withText as unknown as JumpArticle[]), []);
});

test("source contract: the readers and the catalogue filter with no literal includes", () => {
  for (const rel of ["./page.tsx", "./_sidebar.tsx", "../page.tsx", "../../book/[slug]/page.tsx", "../../book/[slug]/_sidebar.tsx"]) {
    const src = readFileSync(new URL(rel.replace("[slug]", "%5Bslug%5D"), import.meta.url), "utf8");
    assert.doesNotMatch(src, /\.includes\(nq\)/, `${rel}: .includes(nq)`);
    assert.doesNotMatch(src, /normalize\w*\([^)]*\)\.includes\(/, `${rel}: normalize(...).includes(`);
  }
});
