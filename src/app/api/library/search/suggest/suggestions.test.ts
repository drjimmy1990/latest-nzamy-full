import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { suggestionsFromRows, SUGGEST_LIMIT } from "./suggestions.ts";

test("١٢-٣: rows → «هل تقصد» items with the document's own page", () => {
  const out = suggestionsFromRows([
    { section: "laws", id: "labor", title: "نظام  العمل", status: "active", score: 0.64 },
    { section: "laws", id: "labor-old", title: "نظام العمل والعمال", status: "repealed", score: 0.64 },
    { section: "precedents", id: "c 1", title: "المبادئ", status: null },
    { section: "feqh", id: "mughni", title: "المغني" },
    { section: "laws", id: "labor", title: "مكرر" },
    { section: "articles", id: "x", title: "not a catalogue title" },
    { section: "laws", id: "", title: "no id" },
    null,
  ]);
  assert.deepEqual(out.map((s) => s.href), ["/laws/labor", "/laws/labor-old", "/precedents/c%201", "/book/mughni"]);
  assert.equal(out[0].title, "نظام العمل");
  assert.equal(out[0].repealed, false);
  assert.equal(out[1].repealed, true);
  assert.deepEqual(suggestionsFromRows(null), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ section: "feqh", id: `b${i}`, title: `كتاب ${i}` }));
  assert.equal(suggestionsFromRows(many).length, SUGGEST_LIMIT);
});

test("source: the route calls the title function with the service role and degrades to []", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /\.rpc\('search_title_suggestions', \{ p_query: q, p_limit: SUGGEST_LIMIT \}\)/);
  assert.match(route, /const missing = isMissingFunctionError\(rpc\.error\);/);
  assert.match(route, /return NextResponse\.json\(\{ suggestions: \[\], available: !missing \}\);/);
  assert.match(route, /const gate = await libraryGate\(\);/);
  const sql = readFileSync(new URL("../../../../../../supabase/migrations/20261030_62_library_title_suggestions.sql", import.meta.url), "utf8");
  assert.match(sql, /grant execute on function library\.search_title_suggestions\(text, integer\) to service_role;/);
  assert.match(sql, /revoke all on function library\.search_title_suggestions\(text, integer\) from anon;/);
  assert.doesNotMatch(sql, /grant [^;]* to anon/i, "no grant is widened to anon");
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /set statement_timeout = '3s'/);
  // titles only: no article / principle / passage table, no locked column
  assert.doesNotMatch(sql, /library\.(articles|principles|feqh_blocks|decrees_circulars)\b/);
  assert.doesNotMatch(sql, /summary_brief|latest_update|issue_date|official_source_url/);
  const page = readFileSync(new URL("../../../../laws/page.tsx", import.meta.url), "utf8");
  assert.match(page, /fetch\(`\/api\/library\/search\/suggest\?q=\$\{encodeURIComponent\(search\.trim\(\)\)\}`/);
  assert.match(page, /data-testid="did-you-mean"/);
  // the hook sits above the page's `if (!mounted) return null;` (rules of hooks)
  assert.ok(page.indexOf("const searchFoundNothing =") < page.indexOf("if (!mounted) return null;"));
});
