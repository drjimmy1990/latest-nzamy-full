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
  layoutExpansion,
  layoutLanes,
  layoutRadial,
  mergeNeighborhoods,
  parseExplorerRequest,
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
  assert.equal(EXPLORER_EDGE_TYPES.length, 9, "matches the edge_type check constraint of 20261110_10");
});

test("edgePhrase reads the link from the viewer's side (outgoing vs incoming)", () => {
  assert.equal(edgePhrase("AMENDS_ARTICLE", "out"), "يعدّل");
  assert.equal(edgePhrase("AMENDS_ARTICLE", "in"), "معدّلة بموجب");
  assert.equal(edgePhrase("EXEMPTS_FROM", "out"), "يستثني من");
  assert.equal(edgePhrase("INTERPRETS_ARTICLE", "in"), "مفسَّرة في");
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
  assert.deepEqual(r, { ok: true, value: { action: "retrieve", q: "طردوني", keywords: ["فصل", "تعويض"] } });

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
