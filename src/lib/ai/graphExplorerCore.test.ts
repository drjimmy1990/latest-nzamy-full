/**
 * graphExplorerCore.test.ts — the pure half of the admin Legal Graph Explorer:
 * request validation, radial layout, neighbourhood merging, Arabic labels,
 * retrieval-lab helpers, and the migration / route contracts.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  EDGE_TYPE_META,
  EXPLORER_EDGE_TYPES,
  EXPLORER_NODE_TYPES,
  NODE_TYPE_META,
  buildLabGraph,
  deriveLabQueries,
  edgePhrase,
  labHop,
  labHopLabel,
  layoutExpansion,
  layoutLanes,
  layoutRadial,
  mergeNeighborhoods,
  LAB_LIMITS,
  labLimits,
  labLayer,
  labLayerCounts,
  labLinksDiff,
  describeNodeMetadata,
  edgeMetaFor,
  edgeProvenance,
  nodeMetaFor,
  normalizeEdges,
  parseExplorerRequest,
  parseExplorerStatus,
  parseLabRouting,
  syncVerdict,
  type ExplorerEdge,
  type ExplorerNode,
  type XY,
} from "./graphExplorerCore.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

function node(key: string, hop: number, type: ExplorerNode["node_type"] = "article"): ExplorerNode {
  return { node_key: key, node_type: type, title: key, hop, degree: 1, has_vector: false };
}
function edge(source: string, target: string, type: ExplorerEdge["edge_type"], hop = 1): ExplorerEdge {
  return { source, target, edge_type: type, origin: "auto_watchdog", weight: 1, evidence: null, hop };
}

// ─── Labels ───────────────────────────────────────────────────────────────────

test("every node and edge type has an Arabic label and a colour", () => {
  for (const t of EXPLORER_NODE_TYPES) {
    assert.ok(NODE_TYPE_META[t].label.length > 1, t);
    assert.match(NODE_TYPE_META[t].color, /^#[0-9a-f]{6}$/i, t);
  }
  for (const t of EXPLORER_EDGE_TYPES) {
    const m = EDGE_TYPE_META[t];
    assert.ok(m.label && m.out && m.in, t);
    assert.match(m.color, /^#[0-9a-f]{6}$/i, t);
  }
  assert.equal(EXPLORER_EDGE_TYPES.length, 17, "matches the edge_type check constraint of 20261116_10");
  assert.equal(EXPLORER_NODE_TYPES.length, 8, "matches the node_type check constraint of 20261116_10");
});

test("edgePhrase reads the link from the viewer's side (outgoing vs incoming)", () => {
  assert.equal(edgePhrase("AMENDS_ARTICLE", "out"), "يعدّل");
  assert.equal(edgePhrase("AMENDS_ARTICLE", "in"), "معدّلة بموجب");
  assert.equal(edgePhrase("EXEMPTS_FROM", "out"), "يستثني من");
  // H8 (owner decision 17): «مبدأ قضائي يستند لمادة», never «يفسّر» / «تفسير قضائي».
  assert.equal(edgePhrase("INTERPRETS_ARTICLE", "out"), "مبدأ قضائي يستند لمادة");
  assert.equal(edgePhrase("INTERPRETS_ARTICLE", "in"), "مبدأ قضائي يستند إليها");
  assert.equal(EDGE_TYPE_META.INTERPRETS_ARTICLE.label, "مبدأ قضائي يستند لمادة");
  for (const t of EXPLORER_EDGE_TYPES) {
    const m = EDGE_TYPE_META[t];
    assert.doesNotMatch(`${m.label} ${m.out} ${m.in} ${m.hint}`, /يفسّر|يفسر|تفسير|مفسَّرة|فسّرها/, t);
  }
});

// ─── Request validation ──────────────────────────────────────────────────────

test("parseExplorerRequest validates each action and clamps every number", () => {
  const p = (q: string) => parseExplorerRequest(new URLSearchParams(q));

  assert.deepEqual(p("action=overview"), { ok: true, value: { action: "overview" } });
  assert.deepEqual(p(""), { ok: true, value: { action: "overview" } }, "no action = overview");

  const s = p("action=search&q=%D9%86%D8%B8%D8%A7%D9%85+%D8%A7%D9%84%D8%B9%D9%85%D9%84&types=article,principle,bogus&limit=999");
  assert.deepEqual(s, { ok: true, value: { action: "search", q: "نظام العمل", types: ["article", "principle"], limit: 60 } });
  assert.equal(p("action=search&q=").ok, false, "an empty search is refused");

  const n = p("action=neighborhood&key=article:labor-law__art-77&depth=9&limit=1&edges=EXEMPTS_FROM,NOPE");
  assert.deepEqual(n, {
    ok: true,
    value: { action: "neighborhood", key: "article:labor-law__art-77", depth: 2, limit: 5, edges: ["EXEMPTS_FROM"] },
  });
  assert.equal(p("action=neighborhood&key=").ok, false);
  assert.equal(p("action=neighborhood&key=" + "x".repeat(300)).ok, false, "keys are at most 260 chars");
  assert.equal(p("action=node&key=bad key; drop").ok, false, "keys never contain spaces or ;");

  const r = p("action=retrieve&q=%D8%B7%D8%B1%D8%AF%D9%88%D9%86%D9%8A&keywords=%D9%81%D8%B5%D9%84,%D8%AA%D8%B9%D9%88%D9%8A%D8%B6");
  assert.deepEqual(r, {
    ok: true,
    value: { action: "retrieve", q: "طردوني", keywords: ["فصل", "تعويض"], scope: "auto", lawSlug: null, articleId: null, wide: false, links: true, size: 1 },
  });

  assert.equal(p("action=drop_table").ok, false, "unknown actions are refused");
});

// ─── Layout ──────────────────────────────────────────────────────────────────

test("layoutRadial puts the centre at 0,0, ring 1 around it, ring 2 further out, with no overlaps", () => {
  const nodes = [
    node("c", 0),
    ...Array.from({ length: 24 }, (_, i) => node(`a${i}`, 1)),
    ...Array.from({ length: 30 }, (_, i) => node(`b${i}`, 2)),
  ];
  const edges = [
    ...Array.from({ length: 12 }, (_, i) => edge(`a${i}`, "c", "CITES_ARTICLE")),
    ...Array.from({ length: 12 }, (_, i) => edge("c", `a${i + 12}`, "EXEMPTS_FROM")),
    ...Array.from({ length: 30 }, (_, i) => edge(`a${i % 24}`, `b${i}`, "CITES_ARTICLE", 2)),
  ];
  const pos = layoutRadial("c", nodes, edges);
  assert.deepEqual(pos.get("c"), { x: 0, y: 0 });

  const dist = (k: string) => Math.hypot(pos.get(k)!.x, pos.get(k)!.y);
  const ring1 = Array.from({ length: 24 }, (_, i) => dist(`a${i}`));
  const ring2 = Array.from({ length: 30 }, (_, i) => dist(`b${i}`));
  assert.ok(Math.min(...ring1) > 200, "ring 1 clears the centre card");
  assert.ok(Math.min(...ring2) > Math.max(...ring1), "ring 2 is outside ring 1");

  const all = [...pos.values()];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
      assert.ok(d >= 150, `cards ${i} and ${j} overlap (${d.toFixed(0)}px)`);
    }
  }
});

test("layoutRadial groups ring 1 by link type into contiguous sectors and is deterministic", () => {
  const nodes = [node("c", 0), node("x1", 1), node("x2", 1), node("y1", 1), node("y2", 1)];
  const edges = [
    edge("c", "x1", "EXEMPTS_FROM"),
    edge("y1", "c", "INTERPRETS_ARTICLE", 1),
    edge("c", "x2", "EXEMPTS_FROM"),
    edge("y2", "c", "INTERPRETS_ARTICLE", 1),
  ];
  const a = layoutRadial("c", nodes, edges);
  const b = layoutRadial("c", [...nodes].reverse(), [...edges].reverse());
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort(), "same input set, same picture");

  const angle = (k: string) => Math.atan2(a.get(k)!.y, a.get(k)!.x);
  const order = ["x1", "x2", "y1", "y2"].sort((p, q) => angle(p) - angle(q));
  const types = order.map((k) => k[0]);
  // the two x's sit next to each other, as do the two y's
  assert.ok(types.join("") === "xxyy" || types.join("") === "yyxx" || types.join("") === "xyyx" || types.join("") === "yxxy");
});

test("layoutExpansion fans new neighbours outward from the expanded node, never onto existing cards", () => {
  const existing = new Map([
    ["c", { x: 0, y: 0 }],
    ["a", { x: 300, y: 0 }],
  ]);
  const placed = layoutExpansion("a", ["n1", "n2", "n3", "a", "c"], existing);
  assert.equal(placed.has("a"), false, "already-placed nodes keep their spot");
  assert.equal(placed.has("c"), false);
  for (const k of ["n1", "n2", "n3"]) {
    const p = placed.get(k)!;
    assert.ok(p.x > 300, `${k} fans away from the centre`);
    assert.ok(Math.hypot(p.x - 300, p.y) >= 200, `${k} clears the expanded card`);
  }
});

// ─── Merging ─────────────────────────────────────────────────────────────────

test("mergeNeighborhoods keeps the shown nodes' hops (the centre stays the centre), adds new nodes and edges once", () => {
  const merged = mergeNeighborhoods(
    { nodes: [node("c", 0), node("a", 1)], edges: [edge("c", "a", "CITES_ARTICLE")] },
    { nodes: [node("a", 0), node("b", 1), node("c", 1)], edges: [edge("c", "a", "CITES_ARTICLE"), edge("a", "b", "AMENDS_ARTICLE")] },
  );
  assert.deepEqual(merged.nodes.map((n) => [n.node_key, n.hop]), [["c", 0], ["a", 1], ["b", 1]]);
  assert.equal(merged.edges.length, 2);
});

// ─── Retrieval lab ───────────────────────────────────────────────────────────

test("deriveLabQueries keeps explicit keywords, else picks the question's longest distinct words", () => {
  assert.deepEqual(deriveLabQueries("أي سؤال", ["فصل تعسفي", " ", "تعويض"]), ["فصل تعسفي", "تعويض"]);
  const auto = deriveLabQueries("طردوني من الشركة فجأة بدون سبب وبدون تعويض", []);
  assert.ok(auto.length >= 2 && auto.length <= 4, JSON.stringify(auto));
  assert.ok(!auto.includes("من"), "short function words are dropped");
  assert.ok(auto.includes("الشركة") || auto.includes("تعويض"));
  assert.deepEqual(deriveLabQueries("  ", []), []);
});

test("buildLabGraph centres the question, links direct hits to it and graph-hop hits to their seed", () => {
  const g = buildLabGraph("طردوني بدون سبب", [
    { node_key: "article:l__77", kind: "article", title: "نظام العمل — المادة 77", score: 0.03 },
    { node_key: "article:l__80", kind: "article", title: "نظام العمل — المادة 80", score: 0.02, via_edge_type: "EXEMPTS_FROM", via_from_title: "نظام العمل — المادة 77" },
    { node_key: "principle:p1", kind: "principle", title: "مبدأ", score: 0.01, via_edge_type: "INTERPRETS_ARTICLE", via_from_title: "عنوان غير موجود" },
  ]);
  assert.equal(g.nodes[0].node_key, "__query__");
  assert.equal(g.nodes[0].hop, 0);
  const viaSeed = g.edges.find((e) => e.target === "article:l__80" || e.source === "article:l__80");
  assert.equal(viaSeed?.edge_type, "EXEMPTS_FROM");
  assert.equal(viaSeed?.source, "article:l__77", "the hop hangs off the hit that led to it");
  const orphan = g.edges.find((e) => e.target === "principle:p1");
  assert.equal(orphan?.source, "__query__", "a hop whose seed is not on screen hangs off the question");
  assert.equal(g.ranks.get("article:l__77"), 1);
  assert.equal(g.ranks.get("article:l__80"), 2);
});

// ─── Contracts: migration and route ──────────────────────────────────────────

test("20261113_10 is read-only, service_role only, one transaction, ends with `as ok`", () => {
  const path = join(ROOT, "supabase", "migrations", "20261113_10_library_graph_explorer.sql");
  assert.ok(existsSync(path));
  const sql = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1);
  assert.match(sql, /notify pgrst, 'reload schema';/);
  assert.match(sql.slice(sql.lastIndexOf("commit;")), /\bas ok\s*;/);
  for (const fn of ["graph_rag_explore_overview", "graph_rag_explore_search", "graph_rag_explore_neighborhood", "graph_rag_explore_node"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`), fn);
  }
  // read-only: no DDL or DML against tables
  const body = sql.replace(/--.*$/gm, "");
  assert.equal(/\b(create|alter|drop)\s+(table|index|trigger|policy|schema)\b/i.test(body), false, "no DDL");
  assert.equal(/\b(insert\s+into|update\s+library|delete\s+from|truncate)\b/i.test(body), false, "no DML");
  assert.match(sql, /revoke all on function %s from public, anon, authenticated/);
  assert.match(sql, /grant execute on function %s to service_role/);
  assert.equal((sql.match(/security invoker/g) ?? []).length, 4);
  assert.equal((sql.match(/set statement_timeout/g) ?? []).length, 4);

  const verify = readFileSync(join(ROOT, "supabase", "migrations", "_verify.sql"), "utf8");
  assert.match(verify, /^-- >>> verify:library_graph_explorer\r?$/m);
  assert.match(verify, /^-- <<< verify:library_graph_explorer\r?$/m);
});

test("GET /api/v1/admin/graph-explorer is staff-read gated, private, read-only, and handles the missing migration", () => {
  const path = join(ROOT, "src", "app", "api", "v1", "admin", "graph-explorer", "route.ts");
  assert.ok(existsSync(path));
  const src = readFileSync(path, "utf8");
  assert.ok(src.includes('await requireStaff("read")'));
  assert.ok(src.includes('"Cache-Control": "private, no-store"'));
  assert.ok(src.includes("parseExplorerRequest("));
  for (const rpc of ["graph_rag_explore_overview", "graph_rag_explore_search", "graph_rag_explore_neighborhood", "graph_rag_explore_node", "graph_rag_retrieve"]) {
    assert.ok(src.includes(`"${rpc}"`), rpc);
  }
  assert.ok(src.includes("explorerSchemaMissing"), "a missing 20261113_10 answers schemaMissing, not 500");
  assert.equal(/export (?:async function|const) (POST|PUT|PATCH|DELETE)\b/.test(src), false, "GET only");
});

// ─── Column ("lanes") layout ─────────────────────────────────────────────────

function lanesFixture() {
  const types: Array<[ExplorerEdge["edge_type"], number]> = [
    ["EXEMPTS_FROM", 2], ["AMENDS_ARTICLE", 1], ["INTERPRETS_ARTICLE", 4], ["CITES_ARTICLE", 7], ["HAS_CONCEPT", 2],
  ];
  const nodes = [node("c", 0)];
  const edges: ExplorerEdge[] = [];
  for (const [t, n] of types) {
    for (let i = 0; i < n; i++) {
      const k = `${t}-${i}`;
      nodes.push(node(k, 1));
      edges.push(i % 2 ? edge(k, "c", t) : edge("c", k, t));
    }
  }
  return { nodes, edges, total: 16 };
}

/** Axis-aligned card boxes (centre card 284×116, others 232×80) must never touch. */
function assertNoOverlap(pos: Map<string, XY>, center: string) {
  const box = (k: string) => {
    const p = pos.get(k)!;
    const [w, h] = k === center ? [284, 116] : [232, 80];
    return { x1: p.x - w / 2, x2: p.x + w / 2, y1: p.y - h / 2, y2: p.y + h / 2 };
  };
  const keys = [...pos.keys()];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = box(keys[i]);
      const b = box(keys[j]);
      const overlap = a.x1 < b.x2 + 8 && b.x1 < a.x2 + 8 && a.y1 < b.y2 + 8 && b.y1 < a.y2 + 8;
      assert.equal(overlap, false, `${keys[i]} overlaps ${keys[j]}`);
    }
  }
}

test("layoutLanes stacks neighbours in labelled columns either side of the centre, without overlaps", () => {
  const { nodes, edges } = lanesFixture();
  const { positions, lanes } = layoutLanes("c", nodes, edges);
  assert.deepEqual(positions.get("c"), { x: 0, y: 0 });
  assert.equal(positions.size, nodes.length);
  assertNoOverlap(positions, "c");

  const xs = [...positions.entries()].filter(([k]) => k !== "c").map(([, p]) => p.x);
  assert.ok(xs.some((x) => x > 0) && xs.some((x) => x < 0), "both sides of the centre are used");
  assert.ok(Math.min(...xs.map(Math.abs)) > 142 + 116, "no column overlaps the centre card");

  // landscape: wider than tall, so it fits a canvas at a readable zoom
  const ys = [...positions.values()].map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs) + 232;
  const height = Math.max(...ys) - Math.min(...ys) + 80;
  assert.ok(width > height, `width ${width} > height ${height}`);

  // one label per link type present, each above the first card of its group
  assert.deepEqual(lanes.map((l) => l.edge_type).sort(), ["AMENDS_ARTICLE", "CITES_ARTICLE", "EXEMPTS_FROM", "HAS_CONCEPT", "INTERPRETS_ARTICLE"]);
  const cites = lanes.find((l) => l.edge_type === "CITES_ARTICLE")!;
  assert.equal(cites.count, 7);
  const firstCite = positions.get("CITES_ARTICLE-0")!;
  assert.ok(cites.y < firstCite.y, "the label sits above its group");
});

test("layoutLanes keeps each link type's cards together in reading order and is deterministic", () => {
  const { nodes, edges } = lanesFixture();
  const a = layoutLanes("c", nodes, edges);
  const b = layoutLanes("c", [...nodes].reverse(), [...edges].reverse());
  assert.deepEqual([...a.positions.entries()].sort(), [...b.positions.entries()].sort());
  // the 4 interpreting principles share one column (they fit in it) and run top to bottom
  const ip = [0, 1, 2, 3].map((i) => a.positions.get(`INTERPRETS_ARTICLE-${i}`)!);
  const sameColumn = ip.every((p) => p.x === ip[0].x);
  if (sameColumn) for (let i = 1; i < ip.length; i++) assert.ok(ip[i].y > ip[i - 1].y);
});

test("layoutLanes puts second-hop nodes in outer columns on their parent's side", () => {
  const nodes = [node("c", 0), node("r1", 1), node("r2", 1), node("o1", 2), node("o2", 2)];
  const edges = [edge("c", "r1", "EXEMPTS_FROM"), edge("r2", "c", "CITES_ARTICLE"), edge("r1", "o1", "CITES_ARTICLE", 2), edge("o2", "r2", "AMENDS_ARTICLE", 2)];
  const { positions } = layoutLanes("c", nodes, edges);
  assertNoOverlap(positions, "c");
  for (const [child, parent] of [["o1", "r1"], ["o2", "r2"]]) {
    const pc = positions.get(child)!;
    const pp = positions.get(parent)!;
    assert.equal(Math.sign(pc.x), Math.sign(pp.x), `${child} is on ${parent}'s side`);
    assert.ok(Math.abs(pc.x) > Math.abs(pp.x), `${child} is further out than ${parent}`);
  }
});

test("layoutLanes handles a lone centre and a single neighbour", () => {
  assert.deepEqual([...layoutLanes("c", [node("c", 0)], []).positions.entries()], [["c", { x: 0, y: 0 }]]);
  const one = layoutLanes("c", [node("c", 0), node("a", 1)], [edge("c", "a", "AMENDS_ARTICLE")]);
  assertNoOverlap(one.positions, "c");
  assert.equal(one.lanes.length, 1);
});

test("labHop reads the server's hop, else infers it from the link; labHopLabel names the step", () => {
  assert.equal(labHop({ hop: 2, via_edge_type: "EXEMPTS_FROM" }), 2);
  assert.equal(labHop({ hop: 0 }), 0);
  assert.equal(labHop({ via_edge_type: "CITES_ARTICLE" }), 1, "an older server sends no hop: a link means one step");
  assert.equal(labHop({}), 0);
  assert.equal(labHopLabel(0), "مباشر");
  assert.equal(labHopLabel(1), "خطوة ١");
  assert.equal(labHopLabel(2), "خطوة ٢");
});

test("the lab's scope: auto by default, section / all on request, anything else auto; routing parsed defensively", () => {
  const scopeOf = (q: string) => {
    const r = parseExplorerRequest(new URLSearchParams(`action=retrieve&q=x${q}`));
    assert.ok(r.ok && r.value.action === "retrieve");
    return r.value.scope;
  };
  assert.equal(scopeOf(""), "auto");
  assert.equal(scopeOf("&scope=section"), "section");
  assert.equal(scopeOf("&scope=all"), "all");
  assert.equal(scopeOf("&scope=drop table"), "auto");

  assert.deepEqual(parseLabRouting({ scope: "section", section: "03", confident: true, source: "law", laws: ["civ", 7], seeds: 2 }), {
    scope: "section",
    section: "03",
    section_label: "المدني والأحوال الشخصية",
    confident: true,
    source: "law",
    laws: ["civ"],
    seeds: 2,
  });
  assert.deepEqual(parseLabRouting({ section: null, confident: false, source: "none", laws: [] }), {
    scope: "auto",
    section: null,
    section_label: null,
    confident: false,
    source: "none",
    laws: [],
    seeds: 0,
  });
  assert.equal(parseLabRouting({ seeds: "3" })?.seeds, 0, "a server before 20261117_10 sends no seed count");
  assert.equal(parseLabRouting(undefined), null, "a server before 20261116_10 sends no routing");
  assert.equal(parseLabRouting([]), null);
});

// ─── 20261119_10: parity with the graph batches ──────────────────────────────

test("nodeMetaFor / edgeMetaFor give an unknown type a neutral entry, never «السؤال» or «مطابقة»", () => {
  assert.equal(nodeMetaFor("article"), NODE_TYPE_META.article);
  assert.equal(edgeMetaFor("AMENDS_ARTICLE"), EDGE_TYPE_META.AMENDS_ARTICLE);
  const n = nodeMetaFor("statute_v9");
  const e = edgeMetaFor("NEW_LINK");
  assert.equal(n.label, "نوع غير معروف");
  assert.equal(e.label, "رابط غير معروف");
  assert.notEqual(e.label, "مطابقة");
  assert.match(n.color, /^#[0-9a-f]{6}$/i);
  assert.ok(e.out && e.in, "phrases for both directions");
});

test("edgeProvenance: owner links first, then the vector builder with score and method, then the library", () => {
  assert.deepEqual(edgeProvenance({ origin: "auto_watchdog", metadata: { source: "owner_links" } }), {
    kind: "owner",
    label: "من روابط المالك",
    detail: null,
  });
  const sim = edgeProvenance({ origin: "auto_similarity", metadata: { sim: 0.9123, method: "successor_law" } });
  assert.equal(sim.kind, "similarity");
  assert.equal(sim.detail, "التقارب 0.912 · من النظام الذي حلّ محله");
  assert.equal(edgeProvenance({ origin: "auto_similarity", metadata: { sim: 0.85, method: "nearest_active" } }).detail, "التقارب 0.850 · أقرب مادة سارية");
  assert.equal(edgeProvenance({ origin: "auto_similarity", metadata: null }).detail, null);
  assert.equal(edgeProvenance({ origin: "auto_watchdog" }).kind, "library", "an older server sends no metadata");
  assert.equal(edgeProvenance({ origin: "owner_curated", metadata: null }).kind, "curated");
  assert.deepEqual(edgeProvenance({ origin: "something_new", metadata: null }), { kind: "other", label: "something_new", detail: null });
});

test("normalizeEdges keeps only source / sim / method from metadata and drops malformed rows", () => {
  const out = normalizeEdges([
    { source: "a", target: "b", edge_type: "SIMILAR_TO", origin: "auto_similarity", weight: 0.9, evidence: "x", hop: 2,
      metadata: { sim: 0.9, params: "v2", noise: 1 } },
    { source: "a", target: "c", edge_type: "CITES_ARTICLE", origin: "auto_watchdog", weight: 1, evidence: null, hop: 1, metadata: {} },
    { source: "a", target: "d", edge_type: "SUPERSEDES_LAW", origin: "auto_watchdog", metadata: { source: "owner_links" } },
    { source: "a", edge_type: "X" },
    null,
    "junk",
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0].metadata, { sim: 0.9 });
  assert.equal(out[1].metadata, null);
  assert.deepEqual(out[2].metadata, { source: "owner_links" });
  assert.equal(out[2].weight, 1, "a missing weight defaults to 1");
  assert.equal(out[2].hop, 1);
  assert.deepEqual(normalizeEdges("nope"), []);
});

test("describeNodeMetadata reads a principle's routing, a law's section, a term's laws; ignores the rest", () => {
  const p = describeNodeMetadata("principle", {
    court: "ديوان المظالم",
    track: "إداري",
    track_class: "admin",
    subject_section: "08",
    committee_families: ["insurance", "unknown-family"],
    governing_laws: ["labor-law", "civil-transactions"],
    secret_key: "x",
  });
  const byLabel = Object.fromEntries(p.map((r) => [r.label, r]));
  assert.equal(byLabel["فئة المسار (للتوجيه)"].value, "القضاء الإداري");
  assert.equal(byLabel["الجهة القضائية"].value, "ديوان المظالم");
  assert.match(byLabel["قسم الموضوع"].value, /^08 · /);
  assert.equal(byLabel["اللجان"].list?.[0], "لجان الفصل في المنازعات والمخالفات التأمينية");
  assert.equal(byLabel["اللجان"].list?.[1], "unknown-family", "an unknown family shows its id");
  assert.deepEqual(byLabel["الأنظمة الحاكمة"].list, ["labor-law", "civil-transactions"]);
  assert.equal(p.some((r) => r.value === "x"), false, "unknown keys are not shown");

  const law = describeNodeMetadata("law", { section_code: "1" });
  assert.match(law[0].value, /^01 · /);

  const many = Array.from({ length: 45 }, (_, i) => `law-${i}`);
  const term = describeNodeMetadata("term", { law_count: 52, laws: many });
  assert.equal(term[0].list?.length, 30, "capped");
  assert.equal(term[0].value, "52 (يُعرض 30)");

  assert.deepEqual(describeNodeMetadata("article", null), []);
  assert.deepEqual(describeNodeMetadata("article", ["x"]), []);
  assert.deepEqual(describeNodeMetadata("article", { amendment_count: 0, has_inline_regulation: false }), []);
});

test("parseExplorerRequest: status; the lab's page law, open article and width", () => {
  assert.deepEqual(parseExplorerRequest(new URLSearchParams("action=status")), { ok: true, value: { action: "status" } });

  const plain = parseExplorerRequest(new URLSearchParams("action=retrieve&q=سؤال"));
  assert.ok(plain.ok && plain.value.action === "retrieve");
  if (plain.ok && plain.value.action === "retrieve") {
    assert.equal(plain.value.lawSlug, null);
    assert.equal(plain.value.articleId, null);
    assert.equal(plain.value.wide, false, "the AI's limits by default");
  }

  const full = parseExplorerRequest(new URLSearchParams("action=retrieve&q=المادة 77&law=labor-law&article=labor-law__art-77&wide=1"));
  assert.ok(full.ok && full.value.action === "retrieve");
  if (full.ok && full.value.action === "retrieve") {
    assert.equal(full.value.lawSlug, "labor-law");
    assert.equal(full.value.articleId, "labor-law__art-77");
    assert.equal(full.value.wide, true);
  }

  for (const bad of ["law=a b", "law=x'y", "article=a;drop", "law=a,b", "article=" + "x".repeat(201)]) {
    const r = parseExplorerRequest(new URLSearchParams(`action=retrieve&q=س&${bad}`));
    assert.equal(r.ok, false, bad);
  }
  const blank = parseExplorerRequest(new URLSearchParams("action=retrieve&q=س&law=&article=%20"));
  assert.ok(blank.ok, "empty inputs mean none");

  // A slug pasted from the address bar is still percent-encoded once the query string is parsed.
  const params = new URLSearchParams({ action: "retrieve", q: "س", law: encodeURIComponent("نظام-العمل"), article: "نظام-العمل__art-77".normalize("NFD") });
  const pasted = parseExplorerRequest(params);
  assert.ok(pasted.ok && pasted.value.action === "retrieve");
  if (pasted.ok && pasted.value.action === "retrieve") {
    assert.equal(pasted.value.lawSlug, "نظام-العمل", "decoded once");
    assert.equal(pasted.value.articleId, "نظام-العمل__art-77".normalize("NFC"), "NFC, as the library stores ids");
  }
  const broken = parseExplorerRequest(new URLSearchParams({ action: "retrieve", q: "س", law: "%E0%A4%A" }));
  assert.ok(broken.ok && broken.value.action === "retrieve" && broken.value.lawSlug === "%E0%A4%A", "a malformed escape stays as typed");
  const sneaky = parseExplorerRequest(new URLSearchParams({ action: "retrieve", q: "س", law: "a%20b" }));
  assert.equal(sneaky.ok, false, "decoding never lets a space or quote through");
});

test("lab request: links on unless links=0; size 1..3 (clamped)", () => {
  const on = parseExplorerRequest(new URLSearchParams("action=retrieve&q=سؤال"));
  assert.ok(on.ok && on.value.action === "retrieve" && on.value.links === true && on.value.size === 1);
  const off = parseExplorerRequest(new URLSearchParams("action=retrieve&q=سؤال&links=0&size=3"));
  assert.ok(off.ok && off.value.action === "retrieve" && off.value.links === false && off.value.size === 3);
  const big = parseExplorerRequest(new URLSearchParams("action=retrieve&q=سؤال&size=9"));
  assert.ok(big.ok && big.value.action === "retrieve" && big.value.size === 3);
  const junk = parseExplorerRequest(new URLSearchParams("action=retrieve&q=سؤال&size=x&links=yes"));
  assert.ok(junk.ok && junk.value.action === "retrieve" && junk.value.size === 1 && junk.value.links === true);
});

test("labLimits multiplies the AI's (or the wide) limits by the size", () => {
  assert.deepEqual(labLimits(false, 1), LAB_LIMITS.ai);
  assert.deepEqual(labLimits(false, 2), { laws: 20, principles: 8, decrees: 0, feqh: 0 });
  assert.deepEqual(labLimits(true, 3), {
    laws: LAB_LIMITS.wide.laws * 3,
    principles: LAB_LIMITS.wide.principles * 3,
    decrees: LAB_LIMITS.wide.decrees * 3,
    feqh: LAB_LIMITS.wide.feqh * 3,
  });
});

test("labLayer / labLayerCounts: direct (named articles too), first hop, second hop", () => {
  const hits = [
    { node_key: "a", hop: 0 },
    { node_key: "b", hop: 0, seed: true },
    { node_key: "c", hop: 1, via_edge_type: "EXEMPTS_FROM" },
    { node_key: "d", via_edge_type: "CITES_ARTICLE" },
    { node_key: "e", hop: 2, via_edge_type: "INTERPRETS" },
    { node_key: "f", hop: 5 },
  ];
  assert.deepEqual(hits.map(labLayer), [0, 0, 1, 1, 2, 2]);
  assert.deepEqual(labLayerCounts(hits), { 0: 2, 1: 2, 2: 2 });
  assert.deepEqual(labLayerCounts([]), { 0: 0, 1: 0, 2: 0 });
});

test("labLinksDiff: what the links added, and what they pushed out of the results", () => {
  const withLinks = [{ node_key: "a" }, { node_key: "b" }, { node_key: "x" }];
  const without = [{ node_key: "a" }, { node_key: "b" }, { node_key: "y", title: "Y" }];
  const d = labLinksDiff(withLinks, without);
  assert.deepEqual([...d.added], ["x"]);
  assert.deepEqual(d.pushedOut.map((h) => h.node_key), ["y"]);
  const same = labLinksDiff(withLinks, withLinks);
  assert.equal(same.added.size, 0);
  assert.equal(same.pushedOut.length, 0);
});

test("LAB_LIMITS: the AI's own limits by default (laws 8 + 2, principles 4, no decrees or fiqh)", () => {
  assert.deepEqual(LAB_LIMITS.ai, { laws: 10, principles: 4, decrees: 0, feqh: 0 });
  assert.ok(LAB_LIMITS.wide.decrees > 0 && LAB_LIMITS.wide.feqh > 0);
});

test("parseExplorerStatus defaults every field; syncVerdict reads the state", () => {
  const empty = parseExplorerStatus(null);
  assert.equal(empty.sync, null);
  assert.equal(empty.running_run, null);
  assert.equal(empty.owner_links_run, null);
  assert.deepEqual(empty.owner_links, { laws: 0, decrees: 0, edges: {} });
  assert.equal(empty.similarity.done, 0);
  assert.equal(syncVerdict(empty).tone, "wait");

  const s = parseExplorerStatus({
    default_model_id: "m",
    sync: { dirty: false, dirty_tables: [], last_synced_at: "2026-11-19T10:00:00Z", last_sync_status: "succeeded" },
    running_run: null,
    last_run: { status: "succeeded", edges_upserted: 5, embed_only: true },
    owner_links_run: { finished_at: "2026-11-19T09:00:00Z", stats: { links: 3, edges: 1, notFound: 2, resolved: { slug: 1, bad: "x" } } },
    owner_links: { laws: 4, decrees: 1, edges: { SUPERSEDES_LAW: 1, AMENDS_ARTICLE: "2" } },
    similarity: { with_vector: 100, done: 40, repealed_done: 3, last_computed_at: "2026-11-19T08:00:00Z" },
    replacement_pairs: 7,
  });
  assert.equal(syncVerdict(s).tone, "ok");
  assert.equal(s.last_run?.embed_only, true);
  assert.equal(s.owner_links_run?.stats.notFound, 2);
  assert.deepEqual(s.owner_links_run?.stats.resolved, { slug: 1 });
  assert.deepEqual(s.owner_links.edges, { SUPERSEDES_LAW: 1 }, "non-numbers dropped");
  assert.equal(s.replacement_pairs, 7);

  assert.equal(syncVerdict({ ...s, running_run: { id: 1, started_at: "x", trigger_source: "w" } }).tone, "busy");
  assert.equal(syncVerdict({ ...s, sync: { ...s.sync!, dirty: true } }).tone, "wait");
  assert.equal(syncVerdict({ ...s, sync: { ...s.sync!, last_sync_status: "failed" } }).tone, "error");
});

test("20261119_10 is functions-only, service_role only, keeps the neighbourhood's signature, and whitelists link metadata", () => {
  const path = join(ROOT, "supabase", "migrations", "20261119_10_library_graph_explorer_parity.sql");
  assert.ok(existsSync(path));
  const sql = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1);
  assert.match(sql, /notify pgrst, 'reload schema';/);
  assert.match(sql.slice(sql.lastIndexOf("commit;")), /\bas ok\s*;/);
  assert.ok(sql.includes("raise exception '20261119_10: apply 20261118_10_library_owner_links.sql first'"));
  const body = sql.replace(/--.*$/gm, "");
  assert.equal(/\b(create|alter|drop)\s+(table|index|trigger|policy|schema)\b/i.test(body), false, "no DDL on tables");
  assert.equal(/\b(insert\s+into|update\s+library|delete\s+from|truncate)\b/i.test(body), false, "no DML");
  assert.ok(sql.includes("create or replace function public.graph_rag_explore_neighborhood(\n  p_node_key   text,\n  p_depth      integer default 1,\n  p_edge_types text[]  default null,\n  p_limit      integer default 60\n)"));
  assert.ok(sql.includes("create or replace function public.graph_rag_explore_status()"));
  // only these three keys of the link's metadata leave the database
  assert.match(sql, /'metadata',\s+pg_catalog\.jsonb_strip_nulls\(pg_catalog\.jsonb_build_object\(\s*'source',[^)]*\),\s*'sim',[^\n]*\n\s*'method',/);
  assert.doesNotMatch(sql, /'metadata',\s+a\.metadata\b/, "never the raw jsonb");
  // the status never scans the nodes heap
  const status = sql.slice(sql.indexOf("create or replace function public.graph_rag_explore_status()"), sql.indexOf("revoke all on function public.graph_rag_explore_status()"));
  assert.doesNotMatch(status, /library_graph\.nodes\b/, "status reads no nodes");
  for (const sig of ["public.graph_rag_explore_status()", "public.graph_rag_explore_neighborhood(text, integer, text[], integer)"]) {
    assert.ok(sql.includes(`revoke all on function ${sig} from public, anon, authenticated;`), sig);
    assert.ok(sql.includes(`grant execute on function ${sig} to service_role;`), sig);
  }
  assert.equal((body.match(/security invoker/g) ?? []).length, 2);
  assert.equal((body.match(/set statement_timeout/g) ?? []).length, 2);

  const verify = readFileSync(join(ROOT, "supabase", "migrations", "_verify.sql"), "utf8");
  assert.match(verify, /^-- >>> verify:library_graph_explorer_parity\r?$/m);
  assert.match(verify, /^-- <<< verify:library_graph_explorer_parity\r?$/m);
  assert.ok(existsSync(join(ROOT, "supabase", "tests", "rls", "library_graph_explorer_parity.test.sql")));
});

test("the explorer route: a status action, the lab's page context, the open article as the first seed, the AI's limits", () => {
  const src = readFileSync(join(ROOT, "src", "app", "api", "v1", "admin", "graph-explorer", "route.ts"), "utf8");
  assert.ok(src.includes('admin.rpc("graph_rag_explore_status")'));
  assert.ok(src.includes("missing(STATUS_MIGRATION)"), "a missing 20261119_10 answers schemaMissing for the status tab only");
  assert.ok(src.includes("questionRefLookups(admin, req.q, req.lawSlug ?? undefined, true, lookup.signal)"));
  assert.ok(src.includes("graphSeedKeys([pinned, ...directRows])"), "the open article leads the seeds, as retrieval.ts does");
  assert.ok(src.includes("labLimits(req.wide, req.size)"));
  assert.ok(src.includes("p_enable_graph_hop: req.links"), "the lab's «بدون روابط» turns the graph links off on the server");
  assert.ok(src.includes('error.code === "57014"'), "a timeout gets its own message");
  assert.doesNotMatch(src, /p_limit_decrees: 2/, "no fixed lab limits left");
});

test("the explorer client asks for meaning links by naming every type, and never crashes on an unknown type", () => {
  const dir = join(ROOT, "src", "components", "admin", "graphExplorer");
  const api = readFileSync(join(dir, "explorerApi.ts"), "utf8");
  assert.ok(api.includes('edges: edges.join(",")'));
  assert.ok(api.includes("normalizeEdges(n.edges)"));
  const ge = readFileSync(join(dir, "GraphExplorer.tsx"), "utf8");
  assert.ok(ge.includes("named ? EXPLORER_SHOWN_EDGE_TYPES : []"), "named types are the shown ones only (decision ٦٠)");
  for (const f of ["GraphExplorer.tsx", "NodeInspector.tsx", "ExplorerSidebar.tsx", "canvasElements.tsx"]) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(src, /NODE_TYPE_META\[(?:node\.node_type|r\.node_type|h\.kind|n\.node_type)\]/, `${f}: node meta through nodeMetaFor`);
  }
  // «السؤال» is the lab question's own label; any other type goes through nodeMetaFor.
  assert.ok(readFileSync(join(dir, "canvasElements.tsx"), "utf8").includes('node.node_type === "query" ? null : nodeMetaFor(node.node_type)'));
});

// ─── Owner decision ٦٠: only the link types matching his graph file ─────────

test("٦٠: the explorer hides the unreviewed link types on the server and in its lists", async () => {
  const core = await import("./graphExplorerCore.ts");
  const shown = core.EXPLORER_SHOWN_EDGE_TYPES;
  for (const t of ["EXEMPTS_FROM", "SUBJECT_TO", "PENALIZES", "CITES_ARTICLE", "IMPLEMENTED_BY", "REPLACED_BY", "SIMILAR_TO"]) {
    assert.ok(!shown.includes(t as never), `${t} hidden`);
    assert.equal(core.edgeMetaFor(t).label, "رابط قيد المراجعة", `${t} is never named`);
  }
  for (const t of ["INTERPRETS_ARTICLE", "AMENDS_ARTICLE", "SUPERSEDES_LAW", "PARENT_LAW", "PART_OF", "NEXT_ARTICLE", "HAS_CONCEPT"]) {
    assert.ok(shown.includes(t as never), `${t} shown`);
  }
  assert.equal(core.edgeMetaFor("NEW_LINK").label, "رابط غير معروف");

  assert.equal(core.explorerEdgeFilter([]), null, "no names: every type, filtered after");
  assert.deepEqual(core.explorerEdgeFilter(["CITES_ARTICLE", "PARENT_LAW"]), ["PARENT_LAW"]);
  assert.deepEqual(core.explorerEdgeFilter(["CITES_ARTICLE"]), [...shown], "only hidden names: the shown types, never all");

  const n = core.hideUnreviewedLinks({
    found: true,
    center_key: "article:a",
    total_center_edges: 4,
    center_edge_counts: { CITES_ARTICLE: { out: 2, in: 0 }, PARENT_LAW: { out: 1, in: 0 }, PART_OF: { out: 1, in: 0 } },
    nodes: [{ node_key: "article:a" }, { node_key: "article:b" }, { node_key: "law:p" }, { node_key: "chapter:c" }],
    edges: [
      { source: "article:a", target: "article:b", edge_type: "CITES_ARTICLE" },
      { source: "article:a", target: "law:p", edge_type: "PARENT_LAW" },
      { source: "article:a", target: "chapter:c", edge_type: "PART_OF" },
    ],
  }) as { nodes: Array<{ node_key: string }>; edges: Array<{ edge_type: string }>; center_edge_counts: Record<string, unknown>; total_center_edges: number };
  assert.deepEqual(n.edges.map((e) => e.edge_type), ["PARENT_LAW", "PART_OF"]);
  assert.deepEqual(n.nodes.map((x) => x.node_key), ["article:a", "law:p", "chapter:c"], "a node only a hidden link reached goes");
  assert.deepEqual(Object.keys(n.center_edge_counts).sort(), ["PARENT_LAW", "PART_OF"]);
  assert.equal(n.total_center_edges, 2);
  assert.deepEqual(core.hideUnreviewedLinks({ found: false }), { found: false });
  assert.deepEqual(core.shownEdgeCounts({ CITES_ARTICLE: 9, AMENDS_ARTICLE: 3 }), { AMENDS_ARTICLE: 3 });

  const route = readFileSync(join(ROOT, "src", "app", "api", "v1", "admin", "graph-explorer", "route.ts"), "utf8");
  assert.ok(route.includes("p_edge_types: explorerEdgeFilter(req.edges)"));
  assert.ok(route.includes("neighborhood: hideUnreviewedLinks(data)"));
  assert.ok(route.includes("overview: withShownEdgeCounts(data)"));
  assert.ok(route.includes("node: withShownEdgeCounts(data)"));
});
