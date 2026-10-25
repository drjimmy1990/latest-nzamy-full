/**
 * Review of ecf0b357: autocomplete sends its tsquery to service-role queries
 * that have no statement_timeout. These pin the route to the positive-only
 * builder, the timed principles function, and the kept words for the title
 * lookups (normalizeArabic.test.ts proves the builder itself).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auto = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("autocomplete builds its tsquery with parseAutocompleteQuery only — never the operator parser", () => {
  assert.match(auto, /parseAutocompleteQuery\(query\)/);
  assert.doesNotMatch(auto, /parseSearchQuery/);
  assert.doesNotMatch(auto, /type: 'plain'|type: 'websearch'/);
});

test("autocomplete's principles count and top two go through a timed principles window", () => {
  // relevance window first (20261026_52: one GIN scan), then the id window (20261017_20)
  assert.match(auto, /const PRINCIPLES_RPCS = \['search_principles_relevance', 'search_principles_page'\] as const;/);
  assert.match(auto, /for \(const fn of PRINCIPLES_RPCS\) \{/);
  assert.match(auto, /\.rpc\(fn, \{ p_tsquery: ftsQuery, p_offset: 0, p_fetch: 2 \}\)/);
  // The inline pair runs only after both answered missing-function.
  const rpcAt = auto.indexOf(".rpc(fn,");
  const missingAt = auto.indexOf("principlesRpcMissingUntil[fn] = Date.now() + PRINCIPLES_RPC_RETRY_MS;");
  const inlineAt = auto.indexOf(".from('principles')");
  assert.ok(rpcAt > 0 && rpcAt < missingAt && missingAt < inlineAt, "RPCs first, inline only after PGRST202 / 42883");
  assert.match(auto, /if \(!isMissingFunctionError\(rpc\.error\)\) \{/);
});

test("title lookups get the kept words, so a negated word reaches no title", () => {
  assert.match(auto, /const titleQuery = plainTerms\.join\(' '\);/);
  assert.match(auto, /rawQuery: titleQuery,/);
  assert.match(auto, /fetchBookTitleHits\(supabase, titleQuery, 2, signal\)/);
  assert.match(auto, /fetchCollectionTitleHits\(supabase, titleQuery, \{ max: 2, signal \}\)/);
  assert.doesNotMatch(auto, /rawQuery: query\b/);
});

test("the false claim that anon's timeout bounds the service-role counts is gone", () => {
  assert.doesNotMatch(auto, /the anon statement_timeout \(~3s\) normally fires first/);
  assert.match(auto, /NOT the articles\s+\* and fiqh counts, which run as the service role with no statement_timeout/);
});
