/**
 * _shape.test.ts — the citation route sends titles, statuses and links, never
 * article text (20260929_01), whatever the graph function returns; the links
 * box shows every legal link type, «إحالة» included (register 14 item 17), in
 * three sections (owner item 6); a missing anchor links to its document and is
 * never presented as a confirmed article; the law map is gone (item 14).
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
  documentName,
  mergeSectionRefs,
  parseNumbers,
  parseRefKey,
  refHrefs,
  refIds,
  shapeArticleRefs,
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

test("register 14 item 17: the route asks for every legal link type, «إحالة» included", () => {
  assert.deepEqual([...READER_LINK_TYPES].sort(), [
    "AMENDS_ARTICLE",
    "CITES_ARTICLE",
    "EXEMPTS_FROM",
    "IMPLEMENTED_BY",
    "INTERPRETS_ARTICLE",
    "PARENT_LAW",
    "PENALIZES",
    "REPLACED_BY",
    "SUBJECT_TO",
    "SUPERSEDES_LAW",
  ]);
});

test("sections: legislation and judicial filled, fiqh empty; computed and outline types dropped even if the function returns them", () => {
  const out = shapeArticleRefs(neighborhood, "a5", "labor");
  assert.equal(out.found, true);
  assert.deepEqual(
    out.sections.legislation.items.map((i) => [i.key, i.kind, i.linkType, i.direction, i.docKind, i.docId, i.anchorId]),
    [
      ["article:a7", "article", "CITES_ARTICLE", "out", "law", "labor", "a7"],
      ["article:x1", "article", "EXEMPTS_FROM", "in", "law", "civil", "x1"],
      ["law:old", "law", "SUPERSEDES_LAW", "in", "law", "old", null],
      ["law:parent", "law", "PARENT_LAW", "out", "law", "parent", null],
      ["decree:d1", "decree", "AMENDS_ARTICLE", "in", "order", "d1", null],
    ],
  );
  assert.equal(out.sections.legislation.items[0].relation, "تحيل إليها هذه المادة", "a5 refers to a7: a7 is listed as the article a5 refers to");
  assert.deepEqual(
    out.sections.judicial.items.map((i) => [i.key, i.docKind, i.docId, i.anchorId, i.relation]),
    [["principle:p1", "collection", "high-court", "p1", "مبدأ قضائي يستند إليها"]],
    "a principle with no collection in its url cannot be linked, so it is not listed",
  );
  assert.equal(out.sections.fiqh.items.length, 0);
  assert.ok(!JSON.stringify(out).includes(SECRET), "no snippet, no evidence");
  assert.ok(!JSON.stringify(out).includes("SIMILAR_TO") && !JSON.stringify(out).includes("NEXT_ARTICLE"), "not legal links: never in the box");
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
  const out = shapeArticleRefs(many, "c", "l", ["INTERPRETS_ARTICLE"]);
  assert.equal(out.sections.judicial.items.length, MAX_ITEMS_PER_SECTION);
  assert.equal(out.sections.judicial.total, n + 40, "from the centre's edge counts when the list was cut");
  assert.equal(out.sections.legislation.total, 0, "a type the call did not ask for never reaches a section (another group counts it)");
});

test("one query per group: 200 principles or 200 «إحالة» links never crowd out an amendment or regulation link", () => {
  assert.deepEqual(
    READER_SECTION_QUERIES.map((q) => [q.section, [...q.types].sort()]),
    [
      ["legislation", ["AMENDS_ARTICLE", "EXEMPTS_FROM", "IMPLEMENTED_BY", "PARENT_LAW", "PENALIZES", "REPLACED_BY", "SUBJECT_TO", "SUPERSEDES_LAW"]],
      ["legislation", ["CITES_ARTICLE"]],
      ["judicial", ["INTERPRETS_ARTICLE"]],
    ],
    "fiqh has no type, so it is not asked for",
  );
  const asked = READER_SECTION_QUERIES.flatMap((q) => q.types);
  assert.equal(new Set(asked).size, asked.length, "a type is asked once");
  assert.deepEqual([...asked].sort(), [...READER_LINK_TYPES].sort(), "every reader type is asked");
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
  // 200 «إحالة» links from the CITES_ARTICLE group, one of them also reached by the first group.
  const cites = {
    found: true,
    truncated: true,
    center_edge_counts: { CITES_ARTICLE: { out: 300, in: 0 }, PARENT_LAW: { out: 1, in: 0 } },
    nodes: [center, { node_key: "law:parent", node_type: "law", law_slug: "parent", title: "النظام الأصل" }, ...Array.from({ length: 200 }, (_, i) => ({ node_key: `article:z${i}`, node_type: "article", law_slug: "other", title: `z${i}` }))],
    edges: [
      { source: "article:c", target: "law:parent", edge_type: "CITES_ARTICLE" },
      ...Array.from({ length: 200 }, (_, i) => ({ source: "article:c", target: `article:z${i}`, edge_type: "CITES_ARTICLE" })),
    ],
  };
  const [g1, g2, g3] = READER_SECTION_QUERIES;
  const merged = mergeSectionRefs([
    { section: g1.section, refs: shapeArticleRefs(legislationOnly, "c", "l", g1.types) },
    { section: g2.section, refs: shapeArticleRefs(cites, "c", "l", g2.types) },
    { section: g3.section, refs: shapeArticleRefs(crowded, "c", "l", g3.types) },
  ]);
  const leg = merged.sections.legislation;
  assert.equal(leg.items[0].key, "law:parent", "the regulation link comes first");
  assert.equal(leg.items[0].linkType, "PARENT_LAW");
  assert.equal(leg.items.filter((i) => i.key === "law:parent").length, 1, "an item two groups reached is listed once");
  assert.equal(leg.items.length, MAX_ITEMS_PER_SECTION);
  assert.equal(leg.total, 1 + 300 - 1, "the groups' totals, less the repeat");
  assert.equal(merged.sections.judicial.items.length, MAX_ITEMS_PER_SECTION);
  assert.equal(merged.sections.judicial.total, 250);
  assert.equal(merged.found, true);
});

test("live rows: statuses from library.*; a missing anchor links to its document and is never a confirmed article; a missing document is dropped", () => {
  const shaped = shapeArticleRefs(
    {
      ...neighborhood,
      nodes: [...neighborhood.nodes, { node_key: "article:gone", node_type: "article", law_slug: "civil", title: "نظام المعاملات — المادة 99", url: "" }],
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
  assert.deepEqual(ids.articles.sort(), ["a7", "gone", "x1"]);
  assert.deepEqual(ids.principles, ["p1"]);
  const live = applyLiveRows(
    shaped,
    {
      articles: [{ id: "a7", status: "active" }, { id: "x1", status: "amended" }],
      laws: [{ slug: "old", status: "repealed" }, { slug: "civil", status: "active", title: "نظام المعاملات المدنية" }, { slug: "labor", status: "active" }],
      principles: [],
      collections: [{ id: "high-court", title: "مبادئ المحكمة العليا" }],
      decrees: [{ id: "d1" }],
    },
    (raw) => (raw == null || raw === "" ? "status_undeclared" : String(raw)),
    (raw) => String(raw ?? "status_undeclared"),
  );
  const leg = live.sections.legislation.items;
  assert.deepEqual(leg.map((i) => i.key), ["article:a7", "article:x1", "law:old", "decree:d1", "article:gone"], "law:parent has no library row: dropped");
  const gone = leg.find((i) => i.key === "article:gone")!;
  assert.equal(gone.anchorMissing, true);
  assert.equal(gone.title, "نظام المعاملات المدنية", "the document's name, never «المادة 99»");
  assert.equal(gone.status, null, "no article status for an unconfirmed article");
  assert.deepEqual(refHrefs(gone), { href: "/laws/civil", docHref: "/laws/civil" }, "the law, never a 404");
  assert.equal(leg.find((i) => i.key === "law:old")!.status, "repealed");
  assert.equal(leg.find((i) => i.key === "article:x1")!.status, "amended");
  const p1 = live.sections.judicial.items[0];
  assert.equal(p1.anchorMissing, true, "principle row gone");
  assert.equal(p1.title, "مبادئ المحكمة العليا");
  assert.equal(p1.status, null);
  assert.deepEqual(refHrefs(p1), { href: "/precedents/high-court", docHref: "/precedents/high-court" });
  assert.equal(live.sections.legislation.total, 5);
});

test("a missing anchor with no library title: the graph title without its anchor part, else the document id", () => {
  assert.equal(documentName(undefined, "نظام العمل — المادة 7", "labor"), "نظام العمل");
  assert.equal(documentName("", "مادة حُذفت", "labor"), "labor");
  assert.equal(documentName("نظام العمل", "x — y", "labor"), "نظام العمل");
});

test("hrefs: the exact anchor when it exists", () => {
  assert.deepEqual(refHrefs({ docKind: "law", docId: "نظام-العمل", anchorId: "a 1", anchorMissing: false }), {
    href: `/laws/${encodeURIComponent("نظام-العمل")}#a%201`,
    docHref: `/laws/${encodeURIComponent("نظام-العمل")}`,
  });
  assert.equal(refHrefs({ docKind: "collection", docId: "c", anchorId: "p", anchorMissing: false }).href, "/precedents/c#p");
  assert.equal(refHrefs({ docKind: "order", docId: "d", anchorId: null, anchorMissing: false }).href, "/laws/orders/d");
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

test("route contract: libraryGate first, service role for graph and articles, no text column, no map (register 14 item 14)", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = await libraryGate\(\);\s*if \(gate\) return gate;/);
  assert.match(route, /const ARTICLE_COLUMNS = 'id, number, title, status, instrument';/);
  assert.doesNotMatch(route, /select\([^)]*text/);
  assert.doesNotMatch(route, /spendLibraryDocument/);
  assert.match(route, /shapeArticleRefs\(answers\[i\]\.data, id, slug, q\.types\)/);
  assert.match(route, /READER_SECTION_QUERIES\.map\(\(q\) =>/, "one graph call per group");
  assert.match(route, /p_edge_types: q\.types,/);
  assert.match(route, /select\('slug, status, title'\)/, "the law's name for a missing anchor");
  assert.doesNotMatch(route, /searchParams\.get\('map'\)|library_reader_law_links/, "the law map route branch is gone");
});

// ── N02-13 (batch l11): hamza / ة / ى spellings of a law's name; decrees by number and date ──

test("N02-13: a law named with other hamza, ة/ه or ى/ي forms finds its library title", async () => {
  const { foldTitle, pickFoldedTitle, titleLikeOrFilter, titleLikePattern } = await import("./_shape.ts");
  assert.equal(foldTitle("نظام الإجراءات الجزائية"), foldTitle("نظام الاجراءات الجزائيه"));
  assert.equal(foldTitle("نظام المسؤولية"), foldTitle("نظام المسئولية"));
  assert.equal(foldTitle("نظام مكافحة الرشوة"), foldTitle("نِظامُ مكافحة الرشوه"));
  assert.notEqual(foldTitle("نظام القضاء"), foldTitle("نظام القضاء العسكري"));
  // One exact-length pattern per candidate: alef / hamza forms anywhere, ة/ه and ى/ي only at a word's end.
  assert.equal(titleLikePattern("نظام الاجراءات الجزائيه"), "نظ_م _ل_جر___ت _لجز__ي_");
  assert.equal(titleLikePattern("نظام الهيئة"), "نظ_م _لهي__", "ه and ي inside a word stay literal: selective");
  assert.equal(titleLikePattern("نظام%_ العمل*"), "نظ_م _لعمل", "no user-supplied % _ * reaches the pattern");
  assert.equal(titleLikePattern("نظام"), null, "one word names nothing");
  assert.equal(
    titleLikeOrFilter(docNameCandidates("نظام الاجراءات الجزائيه")),
    'title.like."نظ_م _ل_جر___ت _لجز__ي_",title.like."نظ_م _ل_جر___ت"',
  );
  assert.equal(titleLikeOrFilter(["نظام"]), null);
  // Among many titles of the same shape, only the folded-equal one is taken.
  const crowd = Array.from({ length: 120 }, (_, i) => ({ slug: `x${i}`, title: `نظام الإجراءات رقم${i}` }));
  assert.equal(pickFoldedTitle([...crowd, { slug: "t", title: "نظام الإجراءات" }], docNameCandidates("نظام الاجراءات"))?.slug, "t");
  const rows = [
    { slug: "a", title: "نظام الإجراءات الجزائية" },
    { slug: "b", title: "نظام الإجراءات الجزائية العسكري" },
    { slug: "c", title: "نظام الأحوال الشخصية" },
  ];
  const candidates = docNameCandidates("نظام الاجراءات الجزائيه");
  assert.equal(pickFoldedTitle(rows, candidates)?.slug, "a");
  assert.equal(pickFoldedTitle(rows, docNameCandidates("نظام المرافعات الشرعية")), null);
});

test("N02-13 route contract: the folded read runs only when the exact one finds nothing; decrees for subscribers only", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(route, /if \(!law\) \{\n\s*const filter = titleLikeOrFilter\(candidates\);/);
  assert.match(route, /\.or\(filter\)\.limit\(50\)/);
  assert.match(route, /law = pickFoldedTitle\(/);
  const decree = route.slice(route.indexOf("if (url.searchParams.has('decree'))"), route.indexOf("// ── A named law"));
  assert.ok(decree.length > 0);
  assert.match(decree, /if \(!ref \|\| !ref\.date\) return noStore\(\{ decree: null \}\);/, "no date, no lookup");
  assert.match(decree, /if \(!\(await hasFullLibraryAccess\(userId\)\)\) return noStore\(\{ decree: null \}\);/);
  assert.ok(decree.indexOf("hasFullLibraryAccess") < decree.indexOf("decrees_circulars"), "the entitlement before the read");
  assert.match(decree, /'Cache-Control': 'private, no-store'/);
  assert.match(decree, /select\('id, title, ref, date'\)/);
  // Only the id, the capped title and the link leave the route — never ref or date.
  assert.match(decree, /\{ id: String\(row\.id\), title: capTitle\(String\(row\.title \?\? ''\)\), href: `\/laws\/orders\/\$\{encodeURIComponent\(String\(row\.id\)\)\}` \}/);
});
