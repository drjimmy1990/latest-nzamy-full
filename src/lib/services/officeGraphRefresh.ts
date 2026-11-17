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
 *   - layoutPlan: when the graph did change, every node already on the map
 *     stays where it was drawn and only a new node is placed
 *     (officeGraphLayout.ts placeNewNodes) — never a re-layout of the whole map.
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

/** A stable fingerprint of everything the map draws: nodes, edges and the clash list. */
export function officeGraphSignature(graph: OfficeGraph, truncated?: Readonly<Record<string, boolean>>): string {
  const nodes = graph.nodes
    .map((n) => [
      n.id, n.kind, n.label, n.refId ?? "", n.caseCount, n.nameClash ? 1 : 0,
      // The side panel's fields: a moved hearing or a new payment is a change.
      (n.facts ?? []).map((f) => `${f.label}=${f.value}`).join(";"),
      n.link ? `${n.link.kind}:${n.link.id ?? ""}` : "",
    ] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const edges = graph.edges
    .map((e) => `${e.from}|${e.to}|${e.relation}`)
    .sort();
  const clashes = graph.clashes
    .map((c) => `${c.name}|${[...c.clientIn].sort().join(",")}|${[...c.opponentIn].sort().join(",")}|${[...(c.clientCardIds ?? [])].sort().join(",")}`)
    .sort();
  return JSON.stringify({ nodes, edges, clashes, unlinked: graph.unlinked ?? null, truncated: truncated ?? null });
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

/**
 * How the map is laid out after a read:
 *   - "full"   nothing on screen yet: the layered layout (officeGraphLayout.ts);
 *   - "keep"   every node is already drawn: the old positions, no layout run;
 *   - "relax"  some nodes are new: the old positions, and the new nodes placed
 *              beside what they link to (placeNewNodes).
 */
export function layoutPlan(nodes: readonly OfficeNode[], previous: ReadonlyMap<string, Point>): "full" | "keep" | "relax" {
  const known = nodes.filter((n) => previous.has(n.id)).length;
  if (known === 0) return "full";
  return known === nodes.length ? "keep" : "relax";
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
