/**
 * Owner ٢٧٧ (أ): browsing = the latest official amendment, then the latest
 * official issue (the instrument's date, never the date a file was loaded);
 * search = relevance. This file pins what the code does today, so a change
 * to either order is a deliberate one. The SQL side is proven in Docker by
 * supabase/tests/rls/law_sort_key.test.sql (T3 / T3b).
 *
 * How it differs from the owner's wording (reported, not changed):
 *   1. Merged-regulation laws come first (owner README «٤٧» part ٥, N2.5).
 *   2. ONE date per law — the later of its latest amendment and its issue —
 *      not "every amended law by amendment date, then the unamended by issue".
 *      So an unamended law issued in 1447 sits above a law last amended in
 *      1420 (Docker T3b).
 *   3. Only the laws are date-ordered; decrees list by id, books and
 *      judicial collections by title.
 *   4. Search: the section=all preview ranks law articles (ts_rank_cd +
 *      title, page 1); a single-section search and later pages list matches
 *      by primary key after the title hits.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rankedLawOrderApplies } from "../search/searchPlan.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

test("٢٧٧ browse: the key is built from official dates only — the amendment's and the issue's", () => {
  const sql = read("supabase/migrations/20261025_40_law_sort_key.sql");
  const gen = /generated always as \(greatest\(([\s\S]*?)\)\) stored;/.exec(sql)?.[1] ?? "";
  assert.match(gen, /library\.hijri_date_sort_key\(latest_update ->> 'date_hijri'\)/);
  assert.match(gen, /library\.hijri_date_sort_key\(issue_date_hijri\)/);
  for (const notOfficial of ["created_at", "updated_at", "processing_date", "last_updated"]) {
    assert.ok(!gen.includes(notOfficial), `${notOfficial} must not order the catalogue`);
  }
});

test("٢٧٧ browse: /api/library/init orders laws merged → newest official date → title → slug", () => {
  const init = read("src/app/api/library/init/route.ts");
  assert.match(init, /\.order\("has_merged_regulation", DESC_NULLS_LAST\)\s*\.order\(LAW_SORT_KEY, DESC_NULLS_LAST\)\s*\.order\("title"\)\s*\.order\("slug"\)/);
  assert.match(init, /const LAW_SORT_KEY = "catalogue_recency_key";/);
  // The other sections are not date-ordered (difference 3 above).
  assert.match(init, /fetchSection\("decrees_circulars", DECREE_LIST_COLUMNS, "decrees", \(q\) => q\.order\("id"\)\)/);
});

test("٢٧٧ search: relevance ranking applies to the section=all preview only", () => {
  assert.equal(rankedLawOrderApplies("all"), true);
  assert.equal(rankedLawOrderApplies("laws"), false);
  const rpc = read("supabase/migrations/20260925_01_library_search_law_articles_ranked.sql");
  assert.match(rpc, /ts_rank_cd\(a\.fts, q\.tsq\)/);
  assert.match(rpc, /order by rank desc, a\.id/);
});
