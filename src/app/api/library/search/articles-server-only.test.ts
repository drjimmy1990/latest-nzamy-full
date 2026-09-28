/**
 * T28-21 / T28-22 source contract for POST /api/library/search. The route
 * imports next/server and "@/…" aliases, so (like route-fail-closed.test.ts)
 * this reads its source.
 *
 * After migration 20260929_01 library.articles is server-only: the anon key
 * holds no privilege on it. Every articles read must use the service-role
 * client, and the only article text a caller receives is the capped snippet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("every library.articles read (page, head count, ranked RPC, by-id refetch) uses the service-role client", () => {
  assert.match(routeSource, /import \{ createClient, createServiceClient \} from '@\/lib\/supabase\/server';/);
  assert.match(routeSource, /const serverOnly = await createServiceClient\(\);/);
  const fromArticles = [...routeSource.matchAll(/(\w+)\s*\.schema\('library'\)\s*\.from\('articles'\)/g)].map((m) => m[1]);
  assert.deepEqual(fromArticles, ["serverOnly", "serverOnly"], "the lawQuery builder and the by-id refetch");
  assert.match(routeSource, /await serverOnly\s*\.schema\('library'\)\s*\.rpc\(RANKED_RPC,/);
  // The head-count fallback goes through the same builder, so it moves with it.
  assert.match(routeSource, /lawQuery\(false, true\)\.abortSignal\(signal\)/);
  // The other sections stay on the request client.
  for (const table of ["principles", "decrees_circulars", "feqh_blocks"]) {
    assert.match(routeSource, new RegExp(String.raw`supabase\s*\.schema\('library'\)\s*\.from\('${table}'\)`));
  }
});

test("no article text leaves the route except as a capped snippet", () => {
  // The article mapping emits a snippet through truncateWithHighlight and the
  // tier's length, never the `text` / `original_text` columns themselves.
  const start = routeSource.indexOf("const articleItems: SearchResultItem[] = articleRows.map(");
  const end = routeSource.indexOf("// section=laws: page 1 lists the hits");
  assert.ok(start > -1 && end > start);
  const block = routeSource.slice(start, end);
  // A locked hit is centred on nothing (`[]` terms → the article's opening),
  // so a query cannot slide the window across a paid article.
  assert.match(block, /snippet: truncateWithHighlight\(\s*\(r\.text as string\) \|\| \(r\.original_text as string\) \|\| '',\s*isFree \? parsed\.plainTerms : \[\],\s*snippetLen\(isFree\),\s*\)/);
  assert.doesNotMatch(block, /^\s*text:/m);
  assert.doesNotMatch(block, /originalText|original_text:/);
  assert.match(routeSource, /const snippetLen = \(isFree: boolean\) => \(isFree \? 200 : 100\);/);
});

test("article result titles use the shared display label, never raw number_text", () => {
  assert.match(routeSource, /import \{ articleDisplayLabel \} from '\.\.\/laws\/\[slug\]\/_article-label';/);
  assert.match(routeSource, /const articleLabel = articleDisplayLabel\(r\.number_text as string \| null, r\.number as number \| null\);/);
  assert.doesNotMatch(routeSource, /r\.number_text \|\| `المادة \$\{r\.number\}`/);
});

test("autocomplete counts library.articles with the service role and never selects article rows", () => {
  const auto = readFileSync(new URL("../autocomplete/route.ts", import.meta.url), "utf8");
  assert.match(auto, /const serverOnly = await createServiceClient\(\);/);
  assert.match(auto, /count\('articles', serverOnly\),/);
  // The count helper is head-only: a number, never a row.
  assert.match(auto, /\.select\('id', \{ count: 'estimated', head: true \}\)/);
  // No other articles read in autocomplete.
  assert.equal((auto.match(/'articles'/g) ?? []).length, 1);
  // The other three counts stay on the request client (default argument).
  for (const t of ["principles", "decrees_circulars", "feqh_blocks"]) {
    assert.match(auto, new RegExp(String.raw`count\('${t}'\),`));
  }
});

test("the tier-shaped 200 is private, no-store", () => {
  assert.match(
    routeSource,
    /\{ \.\.\.combined\.body, lawTitleHits: lawsOk \? lawTitleHitCount : 0 \},\s*\{ headers: \{ 'Cache-Control': TIER_SHAPED_CACHE_CONTROL \} \},/,
  );
});
