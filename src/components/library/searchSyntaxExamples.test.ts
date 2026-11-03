import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseSearchQuery } from "../../utils/normalizeArabic.ts";
import { SEARCH_SYNTAX_EXAMPLES } from "./searchSyntaxExamples.ts";

test("the ⓘ help lists exactly the seven examples, each one parsed by the engine", () => {
  assert.equal(SEARCH_SYNTAX_EXAMPLES.length, 7);
  for (const { query, explainAr } of SEARCH_SYNTAX_EXAMPLES) {
    assert.ok(explainAr.trim(), `${query}: has an explanation`);
    const parsed = parseSearchQuery(query);
    assert.ok(parsed.tsquery, `${query}: parses to a non-empty tsquery`);
  }
});

test("the examples say what the engine does", () => {
  const byQuery = new Map(SEARCH_SYNTAX_EXAMPLES.map((e) => [e.query, parseSearchQuery(e.query).tsquery]));
  // A fused particle is found apart and fused.
  assert.match(byQuery.get("لايكون")!, /'لا' <-> 'يكون'/);
  // A bare word is found with its article prefixes.
  for (const form of ["'القرار'", "'بالقرار'", "'للقرار'"]) {
    assert.ok(byQuery.get("قرار")!.includes(form), form);
  }
  assert.match(byQuery.get("تحكيم -دولي")!, /& !/);
  assert.match(byQuery.get("اختصاص*")!, /:\*/);
  assert.match(byQuery.get("فسخ / إنهاء")!, /\|/);
  assert.match(byQuery.get("\"غرامة تأخير\"")!, /<->/);
});

test("the ⓘ is mounted in the scoped panel and the /laws main bar, with onPick", () => {
  const panel = readFileSync(new URL("./ScopedSearchPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /<SearchSyntaxHelp[^>]*onPick=\{setQuery\}/);
  const laws = readFileSync(new URL("../../app/laws/page.tsx", import.meta.url), "utf8");
  assert.match(laws, /<SearchSyntaxHelp[^>]*onPick=\{setSearch\}/);
  const help = readFileSync(new URL("./SearchSyntaxHelp.tsx", import.meta.url), "utf8");
  assert.match(help, /aria-label="شرح معادلات البحث"/);
  assert.match(help, /"Escape"/);
  // A disclosure (review M-8): aria-expanded / aria-controls, no dialog role.
  assert.match(help, /aria-expanded=\{open\}/);
  assert.match(help, /aria-controls=/);
  assert.doesNotMatch(help, /role="dialog"/);
  assert.doesNotMatch(help, /text-gray-(?:100|200)\b/);
});
