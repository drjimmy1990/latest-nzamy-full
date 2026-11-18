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
} from "./officeGraphRefresh.ts";
import { layeredLayout, placeNewNodes } from "./officeGraphLayout.ts";

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

test("a refresh with a new case: drawn nodes stay put; the newcomer lands beside its client", () => {
  const drawn = new Map([["case:1", { x: 40, y: 40 }], ["client:c1", { x: 900, y: 40 }]]);
  const g = graph(true);
  const placed = placeNewNodes(g, drawn, layeredLayout(g));
  assert.deepEqual(placed.get("case:1"), { x: 40, y: 40 });
  assert.deepEqual(placed.get("client:c1"), { x: 900, y: 40 });
  const fresh = placed.get("case:2")!;
  assert.ok(Math.hypot(fresh.x - 900, fresh.y - 40) < 700, "near its client, not at the origin");
  assert.ok(fresh.x < 900, "a case sits left of its client (the page reads right to left)");
});

test("a changed fact (a moved hearing) is a change", () => {
  const a = graph();
  const b: OfficeGraph = { ...a, nodes: a.nodes.map((n) => (n.id === "case:1" ? { ...n, facts: [{ label: "الجلسة القادمة", value: "٠١/١٢/٢٠٢٦" }] } : n)) };
  assert.notEqual(officeGraphSignature(a), officeGraphSignature(b));
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
