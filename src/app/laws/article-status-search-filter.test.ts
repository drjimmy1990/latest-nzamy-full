import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const statusValues = [
  "active", "amended", "repealed", "suspended", "added", "merged", "status_undeclared",
];

test("law text search exposes exactly the API's seven article-status values plus an all option", () => {
  for (const value of statusValues) {
    assert.match(pageSource, new RegExp(`value: "${value}"`));
  }
  assert.match(pageSource, /All article statuses/);
  assert.match(pageSource, /حالة المادة/);
  assert.match(pageSource, /activeType === "laws" && search\.trim\(\)\.length >= 2/);
});

test("the article-status request filter is scoped to law searches and clears outside that scope", () => {
  assert.match(pageSource, /if \(section === 'laws' && articleStatusFilter\) filters\.status = articleStatusFilter/);
  assert.match(pageSource, /setArticleStatusFilter\(""\)/);
  assert.match(pageSource, /aria-live="polite"/);
  assert.doesNotMatch(pageSource, /filters\.status = articleStatusFilter;\s*if \(section !== 'laws'/);
});

test("search changes invalidate older requests before their responses can replace filtered results", () => {
  assert.match(pageSource, /const searchAbortRef = useRef<AbortController \| null>\(null\)/);
  assert.match(pageSource, /const searchRequestIdRef = useRef\(0\)/);
  assert.match(pageSource, /signal: controller\.signal/);
  assert.match(pageSource, /requestId === searchRequestIdRef\.current/);
  assert.match(pageSource, /const data = await res\.json\(\);\s*if \(requestId !== searchRequestIdRef\.current\) return;/);
});
