import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OfficeGraph } from "./officeGraph.ts";
import {
  autoRefetchAllowed,
  keepPositions,
  layoutPlan,
  officeGraphSignature,
  OFFICE_GRAPH_AUTO_REFETCH_GAP_MS,
  seedsFromPrevious,
} from "./officeGraphRefresh.ts";

const graph = (extra = false): OfficeGraph => ({
  nodes: [
    { id: "case:1", kind: "case", label: "قضية أ", refId: "1", caseCount: 1 },
    { id: "client:c1", kind: "client", label: "موكّل", refId: "c1", caseCount: 1 },
    ...(extra ? [{ id: "case:2", kind: "case" as const, label: "قضية ب", refId: "2", caseCount: 1 }] : []),
  ],
  edges: [
    { from: "client:c1", to: "case:1", relation: "client" },
    ...(extra ? [{ from: "client:c1", to: "case:2", relation: "client" as const }] : []),
  ],
  clashes: [],
});

test("the signature ignores order and catches every drawn change", () => {
  const a = graph();
  const reordered: OfficeGraph = { ...a, nodes: [...a.nodes].reverse(), edges: [...a.edges].reverse() };
  assert.equal(officeGraphSignature(a), officeGraphSignature(reordered));
  assert.notEqual(officeGraphSignature(a), officeGraphSignature(graph(true)), "a new case");
  const renamed: OfficeGraph = { ...a, nodes: a.nodes.map((n) => (n.id === "case:1" ? { ...n, label: "قضية أ معدلة" } : n)) };
  assert.notEqual(officeGraphSignature(a), officeGraphSignature(renamed), "a renamed case");
  assert.notEqual(officeGraphSignature(a, { cases: false, clients: false }), officeGraphSignature(a, { cases: true, clients: false }), "the cap banner");
});

test("automatic reads never overlap and wait the gap; the first one always runs", () => {
  assert.equal(autoRefetchAllowed(1_000_000, 0, false), true);
  assert.equal(autoRefetchAllowed(1_000_000, 0, true), false, "one in flight");
  assert.equal(autoRefetchAllowed(1_000_000, 1_000_000 - OFFICE_GRAPH_AUTO_REFETCH_GAP_MS + 1, false), false, "focus + visibilitychange together");
  assert.equal(autoRefetchAllowed(1_000_000, 1_000_000 - OFFICE_GRAPH_AUTO_REFETCH_GAP_MS, false), true);
});

test("layout plan: full on first draw, keep when nothing is new, relax when a node is new", () => {
  const drawn = new Map([["case:1", { x: 40, y: 40 }], ["client:c1", { x: 300, y: 40 }]]);
  assert.equal(layoutPlan(graph().nodes, new Map()), "full");
  assert.equal(layoutPlan(graph().nodes, drawn), "keep");
  assert.equal(layoutPlan(graph(true).nodes, drawn), "relax");
  assert.equal(layoutPlan([graph().nodes[0]], drawn), "keep", "a removed node does not re-lay the map out");
  assert.deepEqual([...keepPositions([graph().nodes[0]], drawn).keys()], ["case:1"]);
});

test("seeds: drawn nodes start where they were; a new case starts beside its client", () => {
  const drawn = new Map([["case:1", { x: 40, y: 40 }], ["client:c1", { x: 300, y: 40 }]]);
  const seeds = seedsFromPrevious(graph(true), drawn, { w: 170, h: 44 });
  assert.deepEqual(seeds.find((s) => s.id === "case:1")!.pos, { x: 40, y: 40 });
  assert.deepEqual(seeds.find((s) => s.id === "client:c1")!.pos, { x: 300, y: 40 });
  const fresh = seeds.find((s) => s.id === "case:2")!.pos;
  assert.ok(Math.hypot(fresh.x - 300, fresh.y - 40) < 300, "near its client, not at the origin");
});

test("the map refreshes on focus, on visibility, on a saved case and on «تحديث», without timers", () => {
  const view = readFileSync(join(import.meta.dirname, "../../components/dashboard/officeGraph/OfficeGraphView.tsx"), "utf8");
  assert.match(view, /addEventListener\("visibilitychange"/);
  assert.match(view, /addEventListener\("focus"/);
  assert.match(view, /addEventListener\("nzamy-workflow-updated"/);
  assert.match(view, /removeEventListener\("nzamy-workflow-updated"/);
  assert.match(view, /onClick=\{refresh\}/);
  assert.match(view, /readNow\.current\?\.\("asked"\)/);
  assert.match(view, /> تحديث/);
  assert.match(view, /officeGraphSignature\(r\.graph, r\.truncated\)/, "an unchanged answer is dropped");
  assert.match(view, /layoutPlan\(graph\.nodes, previous\)/, "drawn nodes keep their place");
  assert.doesNotMatch(view, /setInterval|setTimeout/);
});
