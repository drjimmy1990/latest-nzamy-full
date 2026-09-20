import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function mappingUntilNextSection(start: string, end: string) {
  return pageSource.slice(pageSource.indexOf(start), pageSource.indexOf(end));
}

test("precedents, orders, and fiqh search rows fail closed while text-search results are absent", () => {
  const mappings = [
    ["const filteredPrinciples = isSearchActive", "// ─── Filter: Precedents", "precedents"],
    ["const filteredOrders = isSearchActive", "// ─── Filter: Fiqh Books", "orders"],
    ["const filteredFeqhBooks = isSearchActive", "const hasResults", "feqh"],
  ] as const;

  for (const [start, end, section] of mappings) {
    const source = mappingUntilNextSection(start, end);
    assert.match(source, new RegExp(`\\? \\(searchResults\\?\\.${section} \\?\\? \\[\\]\\)\\.map`));
    assert.doesNotMatch(source, new RegExp(`isSearchActive && searchResults\\?\\.${section}`));
  }
});

test("HTTP and connection search failures have Arabic and English error text", () => {
  assert.match(pageSource, /Search failed \(HTTP \$\{res\.status\}\)\. No fallback results were shown\./);
  assert.match(pageSource, /Search failed because of a connection error\. No fallback results were shown\./);
  assert.match(pageSource, /\}, \[precTrack, precSource, orderIssuer, articleStatusFilter, isRTL\]\);/);
});
