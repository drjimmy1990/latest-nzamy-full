import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../api/library/search/route.ts", import.meta.url), "utf8");
const searchLawMapping = pageSource.slice(
  pageSource.indexOf("const filteredLaws = isSearchActive"),
  pageSource.indexOf("// ─── Filter: Principles"),
);

test("the search API is the source of a law-result lock", () => {
  assert.match(routeSource, /locked:\s*!isFree/);
});

test("a locked law search result remains non-free in its card row", () => {
  assert.match(searchLawMapping, /free:\s*!r\.locked/);
  assert.doesNotMatch(searchLawMapping, /free:\s*true/);

  const freeFromSearchLock = (locked: boolean) => !locked;
  assert.equal(freeFromSearchLock(true), false, "locked API result cannot receive a FREE card state");
  assert.equal(freeFromSearchLock(false), true, "unlocked API result stays available");
});
