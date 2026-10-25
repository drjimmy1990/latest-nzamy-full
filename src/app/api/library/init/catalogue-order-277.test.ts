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
 *   4. Search (changed by 20261026_52): every section, on every page, lists
 *      its matches by relevance — ts_rank_cd(fts, q, 1) desc, then the
 *      primary key — after the title hits of page 1. A query matching more
 *      than 5,000 rows of a section (one very common word) keeps the id order
 *      on every page of it, and so does a section while its function is
 *      missing; the response's `order` names which one each section used.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("٢٧٧ search: every section ranks by relevance on every page (20261026_52)", () => {
  const sql = read("supabase/migrations/20261026_52_library_search_relevance.sql");
  for (const [fn, alias] of [
    ["search_law_articles_relevance", "a"],
    ["search_principles_relevance", "p"],
    ["search_feqh_relevance", "b"],
    ["search_decrees_relevance", "d"],
  ]) {
    const start = sql.indexOf(`create or replace function library.${fn}(`);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    assert.ok(start > -1, fn);
    // normalization 1 (rank / (1 + log length)) is pinned: 0 favours long scanned pages
    assert.ok(body.includes(`pg_catalog.ts_rank_cd(${alias}.fts, (select pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)), 1) as rank`), `${fn}: ts_rank_cd(fts, q, 1)`);
    assert.ok(body.includes("order by o.rank desc nulls last, o.id"), `${fn}: relevance, then the primary key`);
    assert.ok(body.includes("where (select t.n from total t) <= 5000"), `${fn}: the ranking cap`);
    assert.ok(body.includes("'ranked', (select t.n <= 5000 from total t)"), `${fn}: says whether it ranked`);
  }
  const route = read("src/app/api/library/search/route.ts");
  assert.ok(!route.includes("rankedLawOrderApplies"), "no preview-only ranking any more");
  assert.match(route, /const RELEVANCE_RPC: Record<SearchSectionName, string> = \{/);
});
