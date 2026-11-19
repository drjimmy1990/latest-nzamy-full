/**
 * _shape.test.ts — the citation route sends titles, statuses and links, never
 * article text (20260929_01), whatever the graph function returns; the links
 * box shows only the link types matching the owner's file (decision ٦٠), in
 * three sections (owner item 6), and a missing anchor links to its document.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_ITEMS_PER_SECTION,
  READER_LINK_TYPES,
  READER_SECTION_QUERIES,
  applyLiveRows,
  docNameCandidates,
  mergeSectionRefs,
  parseNumbers,
  parseRefKey,
  refHrefs,
  refIds,
  shapeArticleRefs,
  shapeLawLinks,
  validArticleId,
} from "./_shape.ts";

const SECRET = "نص المادة السري الذي لا يراه الزائر";
const neighborhood = {
  found: true,
  center_key: "article:a5",
  nodes: [
    { node_key: "article:a5", node_type: "article", law_slug: "labor", title: "نظام العمل — المادة 5", item_status: "active", snippet: SECRET },
    { node_key: "article:a7", node_type: "article", law_slug: "labor", title: "نظام العمل — المادة 7", item_status: "amended", url: "/laws/labor#a7", snippet: SECRET },
    { node_key: "article:x1", node_type: "article", law_slug: "civil", title: "نظام المعاملات — المادة 1", item_status: "repealed", snippet: SECRET },
    { node_key: "law:old", node_type: "law", law_slug: "old", title: "النظام القديم", doc_status: "repealed", snippet: SECRET },
    { node_key: "law:parent", node_type: "law", law_slug: "parent", title: "النظام الأصل", doc_status: "active", snippet: SECRET },
    { node_key: "decree:d1", node_type: "decree", law_slug: null, title: "مرسوم ملكي رقم م/1", doc_status: "active", url: "/laws/orders/d1", snippet: SECRET },
    { node_key: "principle:p1", node_type: "principle", law_slug: null, title: "مبادئ المحكمة العليا — المبدأ رقم 3", url: "/precedents/high-court#p1", snippet: SECRET },
    { node_key: "principle:p2", node_type: "principle", law_slug: null, title: "مبدأ بلا مجموعة", url: "", snippet: SECRET },
  ],
  edges: [
    { source: "article:a5", target: "article:a7", edge_type: "CITES_ARTICLE", evidence: SECRET },
    { source: "article:x1", target: "article:a5", edge_type: "EXEMPTS_FROM", evidence: SECRET },
    { source: "article:a5", target: "article:x1", edge_type: "SIMILAR_TO", evidence: SECRET },
    { source: "law:old", target: "article:a5", edge_type: "SUPERSEDES_LAW", evidence: SECRET },
    { source: "article:a5", target: "law:parent", edge_type: "PARENT_LAW", evidence: SECRET },
    { source: "decree:d1", target: "article:a5", edge_type: "AMENDS_ARTICLE", evidence: SECRET },
    { source: "principle:p1", target: "article:a5", edge_type: "INTERPRETS_ARTICLE", evidence: SECRET },
    { source: "principle:p2", target: "article:a5", edge_type: "INTERPRETS_ARTICLE", evidence: SECRET },
    { source: "article:a5", target: "article:a7", edge_type: "NEXT_ARTICLE", evidence: SECRET },
  ],
};

test("٦٠: the route asks only for the types matching the owner's file", () => {
  assert.deepEqual([...READER_LINK_TYPES].sort(), ["AMENDS_ARTICLE", "INTERPRETS_ARTICLE", "PARENT_LAW", "SUPERSEDES_LAW"]);
});

test("sections: legislation and judicial filled, fiqh empty; hidden types dropped even if the function returns them", () => {
  const out = shapeArticleRefs(neighborhood, "a5", "labor");
  assert.equal(out.found, true);
  assert.deepEqual(
    out.sections.legislation.items.map((i) => [i.key, i.kind, i.linkType, i.direction, i.docKind, i.docId, i.anchorId]),
    [
      ["law:old", "law", "SUPERSEDES_LAW", "in", "law", "old", null],
      ["law:parent", "law", "PARENT_LAW", "out", "law", "parent", null],
      ["decree:d1", "decree", "AMENDS_ARTICLE", "in", "order", "d1", null],
    ],
  );
  assert.deepEqual(
    out.sections.judicial.items.map((i) => [i.key, i.docKind, i.docId, i.anchorId, i.relation]),
    [["principle:p1", "collection", "high-court", "p1", "مبدأ قضائي يستند إليها"]],
    "a principle with no collection in its url cannot be linked, so it is not listed",
  );
  assert.equal(out.sections.fiqh.items.length, 0);
  assert.ok(!JSON.stringify(out).includes(SECRET), "no snippet, no evidence");
  assert.ok(!JSON.stringify(out).includes("CITES_ARTICLE") && !JSON.stringify(out).includes("EXEMPTS_FROM") && !JSON.stringify(out).includes("SIMILAR_TO"));
  for (const s of ["legislation", "judicial", "fiqh"] as const) {
    for (const i of out.sections[s].items) {
      assert.deepEqual(
        Object.keys(i).sort(),
        ["anchorId", "anchorMissing", "direction", "docId", "docKind", "key", "kind", "linkType", "relation", "section", "status", "title"],
      );
    }
  }
});

test("not found: an article of another law, a miss, garbage", () => {
  assert.equal(shapeArticleRefs(neighborhood, "a5", "civil").found, false);
  assert.equal(shapeArticleRefs({ found: false }, "a5", "labor").found, false);
  assert.equal(shapeArticleRefs(null, "a5", "labor").found, false);
});

test("a section lists at most MAX_ITEMS_PER_SECTION, and its total says how many there are", () => {
  const n = MAX_ITEMS_PER_SECTION + 15;
  const many = {
    found: true,
    truncated: true,
    center_edge_counts: { INTERPRETS_ARTICLE: { out: 0, in: n + 40 }, CITES_ARTICLE: { out: 999, in: 0 } },
    nodes: [
      { node_key: "article:c", node_type: "article", law_slug: "l" },
      ...Array.from({ length: n }, (_, i) => ({ node_key: `principle:p${i}`, node_type: "principle", title: `p${i}`, url: `/precedents/coll#p${i}` })),
    ],
    edges: Array.from({ length: n }, (_, i) => ({ source: `principle:p${i}`, target: "article:c", edge_type: "INTERPRETS_ARTICLE" })),
  };
  const out = shapeArticleRefs(many, "c", "l");
  assert.equal(out.sections.judicial.items.length, MAX_ITEMS_PER_SECTION);
  assert.equal(out.sections.judicial.total, n + 40, "from the centre's edge counts when the list was cut");
  assert.equal(out.sections.legislation.total, 0, "a hidden type's count never reaches a section");
});

test("one query per section: 200 principles never crowd out a legislation link", () => {
  assert.deepEqual(
    READER_SECTION_QUERIES.map((q) => [q.section, [...q.types].sort()]),
    [
      ["legislation", ["AMENDS_ARTICLE", "PARENT_LAW", "SUPERSEDES_LAW"]],
      ["judicial", ["INTERPRETS_ARTICLE"]],
    ],
    "fiqh has no shown type, so it is not asked for",
  );
  const center = { node_key: "article:c", node_type: "article", law_slug: "l" };
  // What the function returns when asked for everything at once: 200 principles fill the limit.
  const crowded = {
    found: true,
    truncated: true,
    center_edge_counts: { INTERPRETS_ARTICLE: { out: 0, in: 250 }, PARENT_LAW: { out: 1, in: 0 } },
    nodes: [center, ...Array.from({ length: 200 }, (_, i) => ({ node_key: `principle:p${i}`, node_type: "principle", title: `p${i}`, url: `/precedents/k#p${i}` }))],
    edges: Array.from({ length: 200 }, (_, i) => ({ source: `principle:p${i}`, target: "article:c", edge_type: "INTERPRETS_ARTICLE" })),
  };
  const legislationOnly = {
    found: true,
    nodes: [center, { node_key: "law:parent", node_type: "law", law_slug: "parent", title: "النظام الأصل" }],
    edges: [{ source: "article:c", target: "law:parent", edge_type: "PARENT_LAW" }],
  };
  const merged = mergeSectionRefs([
    { section: "legislation", refs: shapeArticleRefs(legislationOnly, "c", "l") },
    { section: "judicial", refs: shapeArticleRefs(crowded, "c", "l") },
  ]);
  assert.deepEqual(merged.sections.legislation.items.map((i) => i.key), ["law:parent"]);
  assert.equal(merged.sections.legislation.total, 1);
  assert.equal(merged.sections.judicial.items.length, MAX_ITEMS_PER_SECTION);
  assert.equal(merged.sections.judicial.total, 250);
  assert.equal(merged.found, true);
});

test("live rows: statuses from library.*; a missing anchor links to its document; a missing document is dropped", () => {
  const shaped = shapeArticleRefs(
    {
      ...neighborhood,
      nodes: [...neighborhood.nodes, { node_key: "article:gone", node_type: "article", law_slug: "civil", title: "مادة حُذفت", url: "" }],
      edges: [
        ...neighborhood.edges,
        { source: "article:a5", target: "article:gone", edge_type: "PARENT_LAW" },
        { source: "principle:p1", target: "article:a5", edge_type: "INTERPRETS_ARTICLE" },
      ],
    },
    "a5",
    "labor",
  );
  const ids = refIds(shaped);
  assert.deepEqual(ids.articles, ["gone"]);
  assert.deepEqual(ids.principles, ["p1"]);
  const live = applyLiveRows(
    shaped,
    {
      articles: [],
      laws: [{ slug: "old", status: "repealed" }, { slug: "civil", status: "active" }],
      principles: [],
      collections: [{ id: "high-court" }],
      decrees: [{ id: "d1" }],
    },
    (raw) => (raw == null || raw === "" ? "status_undeclared" : String(raw)),
    (raw) => String(raw ?? "status_undeclared"),
  );
  const leg = live.sections.legislation.items;
  assert.deepEqual(leg.map((i) => i.key), ["law:old", "decree:d1", "article:gone"], "law:parent has no library row: dropped");
  const gone = leg.find((i) => i.key === "article:gone")!;
  assert.equal(gone.anchorMissing, true);
  assert.deepEqual(refHrefs(gone), { href: "/laws/civil", docHref: "/laws/civil" }, "the law, never a 404");
  assert.equal(leg[0].status, "repealed");
  const p1 = live.sections.judicial.items[0];
  assert.equal(p1.anchorMissing, true, "principle row gone");
  assert.deepEqual(refHrefs(p1), { href: "/precedents/high-court", docHref: "/precedents/high-court" });
  assert.equal(live.sections.legislation.total, 3);
});

test("hrefs: the exact anchor when it exists", () => {
  assert.deepEqual(refHrefs({ docKind: "law", docId: "نظام-العمل", anchorId: "a 1", anchorMissing: false }), {
    href: `/laws/${encodeURIComponent("نظام-العمل")}#a%201`,
    docHref: `/laws/${encodeURIComponent("نظام-العمل")}`,
  });
  assert.equal(refHrefs({ docKind: "collection", docId: "c", anchorId: "p", anchorMissing: false }).href, "/precedents/c#p");
  assert.equal(refHrefs({ docKind: "order", docId: "d", anchorId: null, anchorMissing: false }).href, "/laws/orders/d");
});

test("law links (map): only shown types; a law linked by hidden types only is dropped", () => {
  const out = shapeLawLinks({
    links: [
      { slug: "civil", title: "نظام المعاملات المدنية", status: "active", out: 3, in: 1, types: ["PARENT_LAW", "CITES_ARTICLE"], evidence: SECRET },
      { slug: "penal", title: "نظام العقوبات", status: "active", out: 2, in: 0, types: ["PENALIZES"] },
      { title: "no slug" },
    ],
    truncated: true,
  });
  assert.deepEqual(out, { links: [{ slug: "civil", title: "نظام المعاملات المدنية", status: "active", out: 3, in: 1, types: ["PARENT_LAW"] }], truncated: true });
});

test("params: ids, numbers, name candidates, preview keys", () => {
  assert.equal(validArticleId("art-1"), "art-1");
  assert.equal(validArticleId(""), null);
  assert.equal(validArticleId("a\u0000b"), null);
  assert.equal(validArticleId("x".repeat(151)), null);
  assert.deepEqual(parseNumbers("35,36,abc,0,35,-1"), [35, 36]);
  assert.deepEqual(docNameCandidates("نظام العمل الصادر"), ["نظام العمل الصادر", "نظام العمل"]);
  assert.deepEqual(docNameCandidates("نظام"), []);
  assert.deepEqual(parseRefKey("principle:abc"), { kind: "principle", id: "abc" });
  assert.deepEqual(parseRefKey("article:a:b"), { kind: "article", id: "a:b" });
  assert.equal(parseRefKey("concept:x"), null);
  assert.equal(parseRefKey("chapter:x"), null);
  assert.equal(parseRefKey("article:"), null);
  assert.equal(parseRefKey("article:a\u0000"), null);
});

test("route contract: libraryGate first, service role for graph and articles, no text column, typed map", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = await libraryGate\(\);\s*if \(gate\) return gate;/);
  assert.match(route, /const ARTICLE_COLUMNS = 'id, number, title, status, instrument';/);
  assert.doesNotMatch(route, /select\([^)]*\btext\b/);
  assert.doesNotMatch(route, /spendLibraryDocument/);
  assert.match(route, /shapeArticleRefs\(answers\[i\]\.data, id, slug\)/);
  assert.match(route, /READER_SECTION_QUERIES\.map\(\(q\) =>/, "one graph call per section");
  assert.match(route, /p_edge_types: q\.types,/);
  assert.match(route, /p_types: \[\.\.\.READER_LINK_TYPES\]/, "the map passes the same allow-list");
  assert.match(route, /rpc\('library_reader_law_links_typed'/);
  assert.doesNotMatch(route, /rpc\('library_reader_law_links'/, "the untyped map counts hidden types");
});
