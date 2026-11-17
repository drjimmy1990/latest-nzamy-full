/**
 * _shape.test.ts — the citation route sends titles, numbers and statuses,
 * never article text (20260929_01), whatever the graph function returns.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLiveStatuses, docNameCandidates, parseNumbers, shapeArticleLinks, shapeLawLinks, validArticleId } from "./_shape.ts";

const SECRET = "نص المادة السري الذي لا يراه الزائر";
const neighborhood = {
  found: true,
  center_key: "article:a5",
  nodes: [
    { node_key: "article:a5", node_type: "article", law_slug: "labor", title: "نظام العمل — المادة 5", article_number: 5, item_status: "active", snippet: SECRET },
    { node_key: "article:a7", node_type: "article", law_slug: "labor", title: "نظام العمل — المادة 7", article_number: 7, item_status: "amended", snippet: SECRET },
    { node_key: "article:x1", node_type: "article", law_slug: "civil", title: "نظام المعاملات — المادة 1", article_number: 1, item_status: "repealed", snippet: SECRET },
    { node_key: "law:old", node_type: "law", law_slug: "old", title: "النظام القديم", doc_status: "repealed", snippet: SECRET },
    { node_key: "principle:p1", node_type: "principle", law_slug: null, title: "مبدأ", snippet: SECRET },
  ],
  edges: [
    { source: "article:a5", target: "article:a7", edge_type: "CITES_ARTICLE", evidence: SECRET },
    { source: "article:x1", target: "article:a5", edge_type: "EXEMPTS_FROM", evidence: SECRET },
    { source: "article:a5", target: "law:old", edge_type: "SUPERSEDES_LAW", evidence: SECRET },
    { source: "principle:p1", target: "article:a5", edge_type: "INTERPRETS_ARTICLE", evidence: SECRET },
    { source: "article:a5", target: "article:a7", edge_type: "NEXT_ARTICLE", evidence: SECRET },
  ],
};

test("article links: both directions, whitelisted fields, no text", () => {
  const out = shapeArticleLinks(neighborhood, "a5", "labor");
  assert.equal(out.found, true);
  assert.deepEqual(out.outgoing.map((l) => [l.articleId, l.linkType, l.status]), [["a7", "CITES_ARTICLE", "amended"], [null, "SUPERSEDES_LAW", "repealed"]]);
  assert.deepEqual(out.incoming.map((l) => [l.articleId, l.lawSlug, l.articleNumber]), [["x1", "civil", 1]]);
  assert.ok(!JSON.stringify(out).includes(SECRET));
  for (const l of [...out.outgoing, ...out.incoming]) {
    assert.deepEqual(Object.keys(l).sort(), ["articleId", "articleNumber", "direction", "kind", "lawSlug", "linkType", "status", "title"]);
  }
});

test("article links: an article of another law, or a miss, is not found", () => {
  assert.equal(shapeArticleLinks(neighborhood, "a5", "civil").found, false);
  assert.equal(shapeArticleLinks({ found: false }, "a5", "labor").found, false);
  assert.equal(shapeArticleLinks(null, "a5", "labor").found, false);
});

test("article links: at most eight a side", () => {
  const many = {
    found: true,
    nodes: [{ node_key: "article:c", node_type: "article", law_slug: "l" }, ...Array.from({ length: 12 }, (_, i) => ({ node_key: `article:t${i}`, node_type: "article", law_slug: "l", title: `t${i}` }))],
    edges: Array.from({ length: 12 }, (_, i) => ({ source: "article:c", target: `article:t${i}`, edge_type: "CITES_ARTICLE" })),
  };
  assert.equal(shapeArticleLinks(many, "c", "l").outgoing.length, 8);
});

test("law links: malformed rows dropped, types whitelisted", () => {
  const out = shapeLawLinks({ links: [{ slug: "civil", title: "نظام المعاملات المدنية", status: "active", out: 3, in: 1, types: ["CITES_ARTICLE", "HAS_CONCEPT"], evidence: SECRET }, { title: "no slug" }], truncated: true });
  assert.deepEqual(out, { links: [{ slug: "civil", title: "نظام المعاملات المدنية", status: "active", out: 3, in: 1, types: ["CITES_ARTICLE"] }], truncated: true });
});

test("params: ids, numbers, name candidates", () => {
  assert.equal(validArticleId("art-1"), "art-1");
  assert.equal(validArticleId(""), null);
  assert.equal(validArticleId("a\u0000b"), null);
  assert.equal(validArticleId("x".repeat(151)), null);
  assert.deepEqual(parseNumbers("35,36,abc,0,35,-1"), [35, 36]);
  assert.deepEqual(docNameCandidates("نظام العمل الصادر"), ["نظام العمل الصادر", "نظام العمل"]);
  assert.deepEqual(docNameCandidates("نظام"), []);
});

test("route contract: libraryGate first, service role only for graph and articles, no text column", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = await libraryGate\(\);\s*if \(gate\) return gate;/);
  assert.match(route, /const ARTICLE_COLUMNS = 'id, number, title, status, instrument';/);
  assert.doesNotMatch(route, /select\([^)]*\btext\b/);
  assert.doesNotMatch(route, /spendLibraryDocument/);
  assert.match(route, /shapeArticleLinks\(data, id, slug\)/);
});

test("live statuses: library.* overrides the graph's «active» default; a vanished article is dropped", () => {
  const shaped = shapeArticleLinks(neighborhood, "a5", "labor");
  const out = applyLiveStatuses(
    shaped,
    [{ id: "a7", status: null }],
    [{ slug: "old", status: "repealed" }],
    (raw) => (raw == null || raw === "" ? "status_undeclared" : String(raw)),
    (raw) => String(raw ?? "status_undeclared"),
  );
  assert.deepEqual(out.outgoing.map((l) => [l.articleId, l.status]), [["a7", "status_undeclared"], [null, "repealed"]]);
  assert.equal(out.incoming.length, 0, "x1 has no library row any more");
});
