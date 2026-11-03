/**
 * Owner note ٠٧ — the dashboard palette (Ctrl+K) runs the platform's one
 * search engine. Source pins (the component needs a browser and a session).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("./GlobalSearch.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the indexOf single-colour highlight is gone; <Hl> colours every term", () => {
  assert.doesNotMatch(SRC, /function Highlight\(/);
  assert.doesNotMatch(SRC, /\.indexOf\(query\.toLowerCase\(\)\)/);
  assert.match(SRC, /<Hl text=\{tool\.label\} terms=\{hlTerms\}\/>/);
  assert.match(SRC, /<Hl text=\{item\.label\} terms=\{hlTerms\}\/>/);
});

test("filter and colours share one grammar (operators, Arabic and digit folding)", () => {
  assert.match(SRC, /const matchesQuery = useMemo\(\(\) => compileQueryMatcher\(parsedQuery\), \[parsedQuery\]\);/);
  assert.match(SRC, /allTools\.filter\(t => matchesQuery\(\[t\.label, t\.labelEn\]\)\)/);
  assert.match(SRC, /personalItems\.filter\(item => matchesQuery\(\[item\.label\]\)\)\.slice\(0, PERSONAL_CONTENT_VISIBLE_LIMIT\)/);
});

test("content rows carry ?q= (click and Enter alike); tool links do not", () => {
  assert.match(SRC, /const contentHref = \(item: PersonalContentItem\) => withSearchQuery\(item\.href, query\);/);
  assert.match(SRC, /href=\{contentHref\(item\)\}/);
  assert.match(SRC, /\.\.\.matchedContent\.map\(contentHref\)/);
  assert.match(SRC, /href=\{tool\.href!\}/);
  assert.match(SRC, /matchedTools\.map\(t => t\.href!\)/);
});
