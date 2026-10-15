/**
 * Fiqh search cards (owner package 10-06, gap analysis §4): a search hit showed
 * «نسبة التحصيل 100%» — no reading progress is tracked — and «—» for the author
 * and date, and every hit claimed «نوع المرجع: شرعي إسلامي». The mapping now
 * carries no progress, no placeholder text and no guessed type; the card leaves
 * out a line it has nothing for.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("./components/FeqhTabContent.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../api/library/search/route.ts", import.meta.url), "utf8");

function feqhSearchMapping(): string {
  const start = pageSource.indexOf("const filteredFeqhBooks = isSearchActive");
  const end = pageSource.indexOf(": booksList.filter(", start);
  assert.ok(start >= 0 && end > start, "fiqh search mapping not found");
  return pageSource.slice(start, end);
}

test("a fiqh search hit carries no made-up progress, date, author or type", () => {
  const mapping = feqhSearchMapping();
  assert.match(mapping, /progress: 0,/);
  assert.doesNotMatch(mapping, /progress: 100/);
  assert.doesNotMatch(mapping, /(?:: |\|\| |\? )\(?'—'/, "no «—» placeholder value in a search card");
  assert.doesNotMatch(mapping, /type: 'sharia'/, "the type comes from the catalogue, never a constant");
  assert.match(mapping, /lastUpdated: '',/);
});

test("the fiqh card hides author, date, category and type when there is nothing to show", () => {
  assert.match(cardSource, /hasAuthor\(book\.author\) && \(/);
  assert.match(cardSource, /hasText\(book\.lastUpdated\) && <span/);
  assert.match(cardSource, /\{book\.categoryLabel && \(/);
  assert.match(cardSource, /\{book\.type && \(/);
  // The progress bar still needs a real, positive value.
  assert.match(cardSource, /isLoggedIn && book\.progress > 0 &&/);
});

test("a fiqh passage hit carries its book's author from the columns already selected", () => {
  const start = routeSource.indexOf("const runFeqh = async");
  const end = routeSource.indexOf("const runners:", start);
  const runFeqh = routeSource.slice(start, end);
  assert.match(runFeqh, /feqh_books!inner \( id, title, author, school, type \)/);
  assert.match(runFeqh, /author: typeof book\?\.author === 'string'/);
});
