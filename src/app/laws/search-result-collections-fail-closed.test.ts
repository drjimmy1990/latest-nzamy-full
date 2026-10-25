import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const collectionMapping = pageSource.slice(
  pageSource.indexOf("const filteredCollections = isSearchActive"),
  pageSource.indexOf("// ─── Filter: Orders"),
);

test("judicial collections during active text search come strictly from API precedents collection hits (fail-closed)", () => {
  assert.match(collectionMapping, /const filteredCollections = isSearchActive\s*\? \(searchResults\?\.precedents \?\? \[\]\)/);
  assert.match(collectionMapping, /r\?\.meta\?\.kind === "collection"/);
  assert.doesNotMatch(collectionMapping, /isSearchActive && searchResults\?\.precedents/);
  assert.match(collectionMapping, /: collectionsList\.filter/);
});

test("all six displayed result-list mappings are fail-closed during active text search", () => {
  for (const name of ["Laws", "Principles", "Collections", "Orders", "FeqhBooks"]) {
    assert.match(pageSource, new RegExp(`const filtered${name} = isSearchActive\\s*\\?`));
  }
  assert.match(pageSource, /const filteredPrecedents = isSearchActive\s*\? \[\] as any\[\]/);
});
