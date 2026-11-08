/**
 * officeGraphRefresh.ts — the pure half of «خريطة قضايا المكتب» staying
 * current while it is open (owner package 2026-11-06, BUG-03).
 *
 * The map used to read GET /api/v1/lawyer/office-graph once, on mount: a case
 * added in another tab appeared only after a reload. It now reads again when
 * the tab comes back into view, on window focus, when a case is saved in this
 * tab (the existing `nzamy-workflow-updated` event) and on «تحديث». Three
 * rules keep that from shaking the picture:
 *
 *   - officeGraphSignature: an answer identical to the one on screen is
 *     dropped, so a refetch that finds nothing new changes nothing;
 *   - autoRefetchAllowed: focus and visibilitychange fire together, so an
 *     automatic read waits a minimum gap and never overlaps another;
 *   - seedsFromPrevious: when the graph did change, every node already on the
 *     map starts where it was drawn and a new node starts next to the node it
 *     is linked to, so a short relaxation settles the newcomer instead of
 *     re-laying the whole map out from the rings.
 *
 * Pure (type imports only), so `node --test` runs it (officeGraphRefresh.test.ts).
 */

import type { OfficeGraph, OfficeNode } from "./officeGraph.ts";

export interface Point {
  x: number;
  y: number;
}

/** The minimum gap between two automatic reads (focus / visibility). */
export const OFFICE_GRAPH_AUTO_REFETCH_GAP_MS = 10_000;

/** Iterations for the short relaxation after a change (a full layout runs 80–300). */
export const OFFICE_GRAPH_RELAX_ITERATIONS = 40;

/** A stable fingerprint of everything the map draws: nodes, edges and the clash list. */
export function officeGraphSignature(graph: OfficeGraph, truncated?: { cases: boolean; clients: boolean }): string {
  const nodes = graph.nodes
    .map((n) => [n.id, n.kind, n.label, n.refId ?? "", n.caseCount, n.nameClash ? 1 : 0] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const edges = graph.edges
    .map((e) => `${e.from}|${e.to}|${e.relation}`)
    .sort();
  const clashes = graph.clashes
    .map((c) => `${c.name}|${[...c.clientIn].sort().join(",")}|${[...c.opponentIn].sort().join(",")}|${[...(c.clientCardIds ?? [])].sort().join(",")}`)
    .sort();
  return JSON.stringify({ nodes, edges, clashes, truncated: truncated ?? null });
}

/**
 * May an automatic read start now? Never while one is in flight, and not
 * within the gap after the last one started. «تحديث» and a case saved in this
 * tab skip the gap (they are asked for), never the in-flight rule.
 */
export function autoRefetchAllowed(now: number, lastStartedAt: number, inFlight: boolean, gapMs = OFFICE_GRAPH_AUTO_REFETCH_GAP_MS): boolean {
  if (inFlight) return false;
  return now - lastStartedAt >= gapMs;
}

export interface LayoutSeed {
  id: string;
  w: number;
  h: number;
  pos: Point;
}

/**
 * How the map is laid out after a read:
 *   - "full"   nothing on screen yet: the seeded ring layout, as before;
 *   - "keep"   every node is already drawn: the old positions, no layout run;
 *   - "relax"  some nodes are new: seeds from the old positions, short run.
 */
export function layoutPlan(nodes: readonly OfficeNode[], previous: ReadonlyMap<string, Point>): "full" | "keep" | "relax" {
  const known = nodes.filter((n) => previous.has(n.id)).length;
  if (known === 0) return "full";
  return known === nodes.length ? "keep" : "relax";
}

/**
 * Seeds for the short relaxation: a known node where it was drawn; a new node
 * beside the first drawn node it is linked to (fanned out so two newcomers on
 * one case do not start on the same point), or beside the drawing's centre
 * when it is linked to nothing drawn.
 */
export function seedsFromPrevious(
  graph: Pick<OfficeGraph, "nodes" | "edges">,
  previous: ReadonlyMap<string, Point>,
  size: { w: number; h: number },
): LayoutSeed[] {
  const drawn = [...previous.values()];
  const centre: Point = drawn.length
    ? { x: drawn.reduce((s, p) => s + p.x, 0) / drawn.length, y: drawn.reduce((s, p) => s + p.y, 0) / drawn.length }
    : { x: 0, y: 0 };
  const radius = size.w + 60;
  let fresh = 0;
  return graph.nodes.map((n) => {
    const known = previous.get(n.id);
    if (known) return { id: n.id, w: size.w, h: size.h, pos: { x: known.x, y: known.y } };
    const neighbourId = graph.edges.find((e) => (e.from === n.id && previous.has(e.to)) || (e.to === n.id && previous.has(e.from)));
    const anchor = neighbourId ? previous.get(neighbourId.from === n.id ? neighbourId.to : neighbourId.from)! : centre;
    const angle = (fresh++ * 2 * Math.PI) / 6 + Math.PI / 6;
    return { id: n.id, w: size.w, h: size.h, pos: { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius } };
  });
}

/** The positions of the nodes still on the map (a removed node's entry is dropped). */
export function keepPositions(nodes: readonly OfficeNode[], previous: ReadonlyMap<string, Point>): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const n of nodes) {
    const p = previous.get(n.id);
    if (p) out.set(n.id, p);
  }
  return out;
}
