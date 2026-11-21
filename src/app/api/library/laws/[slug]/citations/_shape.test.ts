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
  BULK_PER_TYPE,
  LAW_LINKS_ID,
  MAX_ITEMS_PER_SECTION,
  centerKeyOf,
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
  expandLawLinks,
  groupsOfRefs,
  shapeLawLinks,
  withAutoTags,
  withHrefs,
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
    "SIMILAR_TO",
    "SUBJECT_TO",
    "SUPERSEDES_LAW",
  ], "Q133 (batch l12): SIMILAR_TO in its own section, behind the admin switch the route reads");
});

test("sections: legislation and judicial filled, fiqh empty; outline types dropped even if the function returns them; similarity in its own section", () => {
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
  assert.ok(!JSON.stringify(out).includes("NEXT_ARTICLE"), "the outline: never in the box");
  assert.deepEqual(out.sections.similar.items.map((i) => [i.key, i.linkType, i.relation]), [["article:x1", "SIMILAR_TO", "متقاربة في المعنى (ربط آلي)"]]);
  assert.equal(shapeArticleRefs(neighborhood, "a5", "labor", READER_LINK_TYPES.filter((t) => t !== "SIMILAR_TO")).sections.similar.total, 0, "switch off: not shown");
  for (const s of ["legislation", "judicial", "fiqh", "similar"] as const) {
    for (const i of out.sections[s].items) {
      assert.deepEqual(
        Object.keys(i).sort(),
        ["anchorId", "anchorMissing", "auto", "direction", "docId", "docKind", "key", "kind", "linkType", "relation", "section", "status", "title"],
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
      ["similar", ["SIMILAR_TO"]],
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
  assert.match(route, /const queries = READER_SECTION_QUERIES\s*\.map\(/, "one graph call per group");
  assert.match(route, /queries\.map\(\(q\) =>\s*serverOnly\.rpc\('graph_rag_explore_neighborhood'/);
  assert.match(route, /p_edge_types: q\.types,/);
  assert.match(route, /select\('slug, status, title'\)/, "the law's name for a missing anchor");
  assert.doesNotMatch(route, /searchParams\.get\('map'\)|library_reader_law_links/, "the law map route branch is gone");
});

// ── N02-13 (batch l11): hamza / ة / ى spellings of a law's name; decrees by number and date ──

test("N02-13: a law named with other hamza, ة/ه or ى/ي forms finds its library title", async () => {
  const { foldTitle, pickFoldedTitle, titleLikePattern, titleLikePatterns } = await import("./_shape.ts");
  assert.equal(foldTitle("نظام الإجراءات الجزائية"), foldTitle("نظام الاجراءات الجزائيه"));
  assert.equal(foldTitle("نظام المسؤولية"), foldTitle("نظام المسئولية"));
  assert.equal(foldTitle("نظام مكافحة الرشوة"), foldTitle("نِظامُ مكافحة الرشوه"));
  assert.notEqual(foldTitle("نظام القضاء"), foldTitle("نظام القضاء العسكري"));
  // One exact-length pattern per candidate: alef / hamza forms anywhere, ة/ه and ى/ي only at a word's end.
  assert.equal(titleLikePattern("نظام الاجراءات الجزائيه"), "نظ_م _ل_جر___ت _لجز__ي_");
  assert.equal(titleLikePattern("نظام الهيئة"), "نظ_م _لهي__", "ه and ي inside a word stay literal: selective");
  assert.equal(titleLikePattern("نظام%_ العمل*"), "نظ_م _لعمل", "no user-supplied % _ * reaches the pattern");
  assert.equal(titleLikePattern("نظام"), null, "one word names nothing");
  assert.deepEqual(titleLikePatterns(docNameCandidates("نظام الاجراءات الجزائيه")), ['"نظ_م _ل_جر___ت _لجز__ي_"', '"نظ_م _ل_جر___ت"']);
  assert.deepEqual(titleLikePatterns(["نظام"]), []);
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
  assert.match(route, /if \(!law\) \{\n\s*const patterns = titleLikePatterns\(candidates\);/);
  // A literal column (the column-lock scanner reads it): title is on the anon allow-list.
  assert.match(route, /\.likeAnyOf\('title', patterns\)\.limit\(50\)/);
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

// ── Batch l12 (owner L1, Q132, Q133, library-Q4): the whole law at once ──────

const bulkRaw = {
  found: true,
  law_slug: "labor",
  per_type: 3,
  nodes: [
    { node_key: "article:b1", node_type: "article", law_slug: "civil", title: "نظام المعاملات — المادة 1", item_status: "active", snippet: SECRET, lib: { anchor: true, status: "amended", doc: true, doc_status: "active", doc_title: "نظام المعاملات المدنية" } },
    { node_key: "article:gone", node_type: "article", law_slug: "civil", title: "نظام المعاملات — المادة 99", item_status: "active", lib: { anchor: false, doc: true, doc_status: "active", doc_title: "نظام المعاملات المدنية" } },
    { node_key: "article:lawgone", node_type: "article", law_slug: "deleted-law", title: "نظام محذوف — المادة 2", lib: { anchor: false, doc: false } },
    { node_key: "principle:p9", node_type: "principle", title: "مبدأ 9", url: "/precedents/high#p9", lib: { anchor: true, doc: true, doc_title: "مبادئ المحكمة العليا" } },
    { node_key: "law:labor", node_type: "law", law_slug: "labor", title: "نظام العمل", doc_status: "active", lib: { doc: true, doc_status: "active", doc_title: "نظام العمل" } },
    { node_key: "article:s1", node_type: "article", law_slug: "civil", title: "نظام المعاملات — المادة 7", lib: { anchor: true, status: "active", doc: true, doc_status: "active", doc_title: "نظام المعاملات المدنية" } },
  ],
  articles: [
    {
      id: "a5",
      links: [
        { t: "INTERPRETS_ARTICLE", d: "in", n: 40, items: [{ k: "principle:p9", o: "owner_curated", s: "owner_edges" }] },
        { t: "CITES_ARTICLE", d: "out", n: 2, items: [{ k: "article:b1", o: "auto_watchdog", s: null }, { k: "article:gone", o: "owner_curated", s: "owner_edges" }] },
        { t: "SIMILAR_TO", d: "out", n: 1, items: [{ k: "article:s1", o: "auto_similarity" }] },
        { t: "NEXT_ARTICLE", d: "out", n: 1, items: [{ k: "article:b1" }] },
      ],
    },
    { id: "a6", links: [{ t: "CITES_ARTICLE", d: "out", n: 1, items: [{ k: "article:lawgone", o: "auto_watchdog" }] }] },
    { id: "", links: [] },
  ],
};

test("L1 bulk: one compact answer for the law — each node once, groups with true totals, no text, ordered like the box", () => {
  const out = shapeLawLinks(bulkRaw, "labor", READER_LINK_TYPES, (s) => `art:${String(s)}`, (s) => `law:${String(s)}`, true);
  assert.equal(out.found, true);
  assert.equal(out.perType, BULK_PER_TYPE);
  assert.ok(!JSON.stringify(out).includes(SECRET), "no snippet");
  assert.deepEqual(Object.keys(out.articles), ["a5"], "a6's only link points into a law that is gone: nothing to draw");
  assert.deepEqual(
    out.articles.a5.map(([t, d, n, keys]) => [t, d, n, keys]),
    [
      ["CITES_ARTICLE", "out", 2, [["article:b1", 1], ["article:gone", 0]]],
      ["INTERPRETS_ARTICLE", "in", 40, [["principle:p9", 0]]],
      ["SIMILAR_TO", "out", 1, [["article:s1", 0]]],
    ],
    "legislation before judicial before similar; the outline dropped; «رابط آلي» only on the unreviewed automatic «إحالة»",
  );
  assert.equal(out.items["article:b1"].status, "art:amended", "status from library.*, not the graph's copy");
  assert.equal(out.items["article:b1"].href, "/laws/civil#b1");
  // Q132: an anchor that is gone is an ordinary link to its document, under the document's name.
  assert.equal(out.items["article:gone"].anchorMissing, true);
  assert.equal(out.items["article:gone"].title, "نظام المعاملات المدنية");
  assert.equal(out.items["article:gone"].href, "/laws/civil");
  assert.equal(out.items["article:lawgone"], undefined, "a document that is gone is dropped");
  assert.equal(out.items["law:labor"], undefined, "a node no article lists is not sent");
  assert.equal(out.items["principle:p9"].docHref, "/precedents/high");
});

test("L1 bulk: switches and guards — tag off, similar off, another law, garbage", () => {
  const noTag = shapeLawLinks(bulkRaw, "labor", READER_LINK_TYPES, String, String, false);
  assert.ok(noTag.articles.a5.every(([, , , keys]) => keys.every(([, a]) => a === 0)), "library_auto_link_tag off: no tag");
  const noSimilar = shapeLawLinks(bulkRaw, "labor", READER_LINK_TYPES.filter((t) => t !== "SIMILAR_TO"), String, String, true);
  assert.ok(!noSimilar.articles.a5.some(([t]) => t === "SIMILAR_TO"), "library_similar_links off: the section is never sent");
  assert.equal(shapeLawLinks(bulkRaw, "civil", READER_LINK_TYPES, String, String, true).found, false, "the URL's law is the authority");
  assert.equal(shapeLawLinks(null, "labor", READER_LINK_TYPES, String, String, true).found, false);
  assert.equal(shapeLawLinks({ found: false }, "labor", READER_LINK_TYPES, String, String, true).found, false);
  const many = {
    ...bulkRaw,
    articles: [{ id: "a5", links: [{ t: "CITES_ARTICLE", d: "out", n: 1, items: ["article:b1", "article:s1", "article:gone", "article:b1", "article:s1"].map((k) => ({ k })) }] }],
  };
  const capped = shapeLawLinks(many, "labor", READER_LINK_TYPES, String, String, true);
  assert.deepEqual(capped.articles.a5[0][3].map(([k]) => k), ["article:b1", "article:s1", "article:gone"], "at most BULK_PER_TYPE, each once");
  assert.equal(capped.articles.a5[0][2], 3, "a total below the items listed is raised to them");
});

test("L1 expand: one article's box data from the bulk answer — sections, groups, «عرض الكل» knows it is partial", () => {
  const bulk = shapeLawLinks(bulkRaw, "labor", READER_LINK_TYPES, String, String, true);
  const a5 = expandLawLinks(bulk, "a5");
  assert.equal(a5.found, true);
  assert.equal(a5.partial, true);
  assert.deepEqual(a5.groups.map((g) => [g.section, g.relation, g.total, g.keys.length]), [
    ["legislation", "تحيل إليها هذه المادة", 2, 2],
    ["judicial", "مبدأ قضائي يستند إليها", 40, 1],
    ["similar", "متقاربة في المعنى (ربط آلي)", 1, 1],
  ]);
  assert.equal(a5.sections.judicial.total, 40);
  assert.equal(a5.sections.legislation.items[0].auto, true);
  assert.equal(a5.sections.legislation.items[1].anchorMissing, true);
  assert.equal(a5.sections.fiqh.items.length, 0);
  const none = expandLawLinks(bulk, "a-without-links");
  assert.equal(none.found, false, "an article with no link: nothing under it");
  assert.equal(none.groups.length, 0);
});

test("groups of a full list (?article=) and the tag switch on one article's answer", () => {
  const live = applyLiveRows(
    shapeArticleRefs(neighborhood, "a5", "labor"),
    { articles: [{ id: "a7", status: "active" }, { id: "x1", status: "active" }], laws: ["labor", "civil", "old", "parent"].map((slug) => ({ slug, status: "active" })), principles: [{ id: "p1" }], collections: [{ id: "high-court" }], decrees: [{ id: "d1" }] },
    String,
    String,
  );
  const groups = groupsOfRefs(withHrefs(live));
  assert.equal(groups[0].linkType, "AMENDS_ARTICLE", "amendment first, as in the bulk order");
  assert.ok(groups.some((g) => g.linkType === "SIMILAR_TO" && g.section === "similar"));
  const tagged = { ...live, sections: { ...live.sections, legislation: { ...live.sections.legislation, items: live.sections.legislation.items.map((i) => ({ ...i, auto: true })) } } };
  assert.ok(withAutoTags(tagged, false).sections.legislation.items.every((i) => i.auto === false));
  assert.ok(withAutoTags(tagged, true).sections.legislation.items.every((i) => i.auto === true));
});

test("CITES_ARTICLE from the graph carries «رابط آلي» only when automatic and not from his files", () => {
  const n = {
    found: true,
    nodes: [
      { node_key: "article:c", node_type: "article", law_slug: "l" },
      { node_key: "article:d", node_type: "article", law_slug: "l" },
      { node_key: "article:e", node_type: "article", law_slug: "l" },
    ],
    edges: [
      { source: "article:c", target: "article:d", edge_type: "CITES_ARTICLE", origin: "auto_watchdog", metadata: {} },
      { source: "article:c", target: "article:e", edge_type: "CITES_ARTICLE", origin: "auto_watchdog", metadata: { source: "owner_links" } },
    ],
  };
  const out = shapeArticleRefs(n, "c", "l");
  assert.deepEqual(out.sections.legislation.items.map((i) => [i.key, i.auto]), [["article:d", true], ["article:e", false]]);
});

test("route contract (l12): ?bulk=1 reads the two switches and calls the law function once", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /url\.searchParams\.get\('bulk'\) === '1'/);
  assert.match(route, /serverOnly\.rpc\('graph_rag_law_article_links', \{\s*p_law_slug: slug,\s*p_per_type: BULK_PER_TYPE,\s*p_types: types,/);
  assert.match(route, /const types = readerLinkTypes\(flags\?\.library_similar_links \?\? false\);/);
  assert.match(route, /withHrefs\(withAutoTags\(live, autoTagOn\)\)/);
  assert.match(route, /if \(graphFunctionMissing\(error\.code\)\) return json\(\{ available: false \}\);/, "before 20261202_30: the reader falls back to one article at a time");
});

test("Q132: the law's own node ('@law') answers like an article — links on the whole law", () => {
  assert.equal(centerKeyOf(LAW_LINKS_ID, "labor"), "law:labor");
  assert.equal(centerKeyOf("a5", "labor"), "article:a5");
  const raw = {
    found: true,
    nodes: [
      { node_key: "law:labor", node_type: "law", law_slug: "labor", title: "نظام العمل" },
      { node_key: "principle:p1", node_type: "principle", title: "مبدأ", url: "/precedents/high#p1" },
    ],
    edges: [{ source: "principle:p1", target: "law:labor", edge_type: "INTERPRETS_ARTICLE", origin: "owner_curated", metadata: { source: "owner_edges" } }],
  };
  const out = shapeArticleRefs(raw, LAW_LINKS_ID, "labor");
  assert.equal(out.found, true);
  assert.deepEqual(out.sections.judicial.items.map((i) => [i.key, i.auto]), [["principle:p1", false]], "his link: no tag");
  assert.equal(shapeArticleRefs(raw, LAW_LINKS_ID, "civil").found, false);
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /p_node_key: centerKeyOf\(id, slug\),/);
});

test("Q101 (l12 integration): a non-subscriber's links never carry a decree's number in its title", async () => {
  const { maskDecreeTitlesForViewer } = await import("./_shape.ts");
  const answer = {
    items: [
      { key: "decree:d1", kind: "decree", docKind: "order", docId: "d1", title: "مرسوم ملكي رقم م/115 وتاريخ 1439/12/05هـ" },
      { key: "law:labor", kind: "law", docKind: "law", docId: "labor", title: "نظام العمل" },
    ],
    articles: { a1: { legislation: { items: [{ key: "decree:d1", docKind: "order", title: "مرسوم ملكي رقم م/115 وتاريخ 1439/12/05هـ" }] } } },
  };
  const masked = maskDecreeTitlesForViewer(answer, false);
  for (const t of [masked.items[0].title, masked.articles.a1.legislation.items[0].title]) {
    assert.doesNotMatch(t, /115|1439/);
    assert.ok(t.trim().length > 0, "never empty");
  }
  assert.equal(masked.items[1].title, "نظام العمل", "a law keeps its title");
  assert.equal(maskDecreeTitlesForViewer(answer, true), answer, "a subscriber reads the stored title");
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.equal((route.match(/maskDecreeTitlesForViewer\(/g) ?? []).length, 2, "bulk and per-article answers");
  assert.match(route, /tierJson\(\{ available: true, \.\.\.maskDecreeTitlesForViewer\(shapedLaw, await viewerIsSubscriber\(\)\) \}\)/);
  assert.match(route, /'Cache-Control': TIER_SHAPED_CACHE_CONTROL/);
  const preview = readFileSync(new URL("./preview/route.ts", import.meta.url), "utf8");
  assert.match(preview, /decreeTitleForViewer\(\{ title: decree\.title, type: decree\.type \}, isSubscriber\)/);
});
