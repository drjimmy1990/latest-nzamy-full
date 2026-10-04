import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const lawsMapping = pageSource.slice(
  pageSource.indexOf("const filteredLaws = isSearchActive"),
  pageSource.indexOf("// ─── Filter: Principles"),
);

test("a text search keeps law results empty until a successful response instead of falling back locally", () => {
  assert.match(pageSource, /const isSearchActive = search\.trim\(\)\.length >= 2/);
  assert.match(lawsMapping, /\? \(searchResults\?\.laws \?\? \[\]\)\.map/);
  assert.doesNotMatch(lawsMapping, /isSearchActive && searchResults\?\.laws/);
});

test("failed law searches clear result data and expose an error instead of a successful zero-result state", () => {
  assert.match(pageSource, /if \(!res\.ok\) \{/);
  assert.match(pageSource, /تعذر تنفيذ البحث \(HTTP \$\{res\.status\}\)\. لم تُعرض نتائج بديلة\./);
  assert.match(pageSource, /Search failed \(HTTP \$\{res\.status\}\)\. No fallback results were shown\./);
  assert.match(pageSource, /تعذر تنفيذ البحث بسبب خطأ في الاتصال\. لم تُعرض نتائج بديلة\./);
  assert.match(pageSource, /Search failed because of a connection error\. No fallback results were shown\./);
  assert.match(pageSource, /role="alert" aria-live="assertive"/);
  assert.match(pageSource, /isSearchActive && !searchLoading && !searchError/);
});
