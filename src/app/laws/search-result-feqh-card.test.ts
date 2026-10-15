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

test("the «all» view's fiqh cards (LawsTabContent) hide the same empty fields", () => {
  const allView = readFileSync(new URL("./components/LawsTabContent.tsx", import.meta.url), "utf8");
  const start = allView.indexOf("filteredFeqhBooks.slice(0, 3).map(");
  assert.ok(start >= 0, "all-view fiqh cards not found");
  const feqhCards = allView.slice(start);
  assert.equal((feqhCards.match(/\{book\.categoryLabel && \(/g) || []).length, 2, "pill hidden without a label, both layouts");
  assert.equal((feqhCards.match(/\{book\.author && book\.author !== "—" && \(/g) || []).length, 2);
  assert.equal((feqhCards.match(/\{book\.type && \(/g) || []).length, 2, "no «وضعي» for an unknown type");
  assert.equal((feqhCards.match(/\{book\.lastUpdated && book\.lastUpdated !== "—" && <span/g) || []).length, 2);
  assert.doesNotMatch(feqhCards.slice(0, feqhCards.indexOf("filteredFeqhBooks.length > 3")), /text-gray-200/, "gray-200 is a dark-mode surface, not text");
});

test("a fiqh passage hit carries its book's author from the columns already selected", () => {
  const start = routeSource.indexOf("const runFeqh = async");
  const end = routeSource.indexOf("const runners:", start);
  const runFeqh = routeSource.slice(start, end);
  assert.match(runFeqh, /feqh_books!inner \( id, title, author, school, type \)/);
  assert.match(runFeqh, /author: typeof book\?\.author === 'string'/);
});
