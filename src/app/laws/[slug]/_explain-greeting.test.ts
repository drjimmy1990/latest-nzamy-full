import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { explainGreeting, explainSubtitle } from "./_explain-greeting.ts";

test("N02-5: an untitled article is named by its law — never an empty pair of quotes", () => {
  const text = explainGreeting({ num: "المادة الثمانون", articleTitle: "", lawName: "نظام العمل", isRTL: true });
  assert.match(text, /أشرح لك المادة الثمانون من «نظام العمل» أم لديك/);
  assert.doesNotMatch(text, /""|«»/);
});

test("a titled article keeps its title", () => {
  const text = explainGreeting({ num: "المادة الأولى", articleTitle: " التعريفات ", lawName: "نظام العمل", isRTL: true });
  assert.match(text, /المادة الأولى المتضمنة لـ «التعريفات» أم/);
});

test("no title and no law name → the article number alone", () => {
  const text = explainGreeting({ num: "المادة ٥", articleTitle: null, lawName: undefined, isRTL: true });
  assert.match(text, /أشرح لك المادة ٥ أم لديك/);
  assert.doesNotMatch(text, /""|«»|المتضمنة/);
  const en = explainGreeting({ num: "Article 5", articleTitle: "", lawName: "", isRTL: false });
  assert.match(en, /explanation of Article 5, or/);
  assert.doesNotMatch(en, /\(\)/);
});

test("the subtitle falls back the same way", () => {
  assert.equal(explainSubtitle("", "نظام العمل"), "نظام العمل");
  assert.equal(explainSubtitle("التعريفات", "نظام العمل"), "التعريفات");
  assert.equal(explainSubtitle("  ", null), "");
});

test("the modal uses the greeting and the reader passes the law's title", () => {
  const modal = readFileSync(join(import.meta.dirname, "_ai-components.tsx"), "utf8");
  assert.match(modal, /explainGreeting\(\{ num: article\.num, articleTitle: article\.title, lawName, isRTL \}\)/);
  assert.doesNotMatch(modal, /المتضمنة لـ "\$\{article\.title\}"/);
  const page = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");
  assert.match(page, /<ArticleExplainModal\s+article=\{explainArticle\}\s+lawName=\{law\?\.title\}/);
});
