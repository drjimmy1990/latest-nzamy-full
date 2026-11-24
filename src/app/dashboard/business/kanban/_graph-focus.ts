/**
 * _graph-focus.ts — two small aids from the case-graph reference (file 11,
 * rows 51 and 54):
 *
 *   * first-neighbour highlight: while the pointer rests on a card, that card,
 *     the cards one arrow away and the arrows between them stay full strength
 *     and the rest of the board fades — the "local graph" of the reference's
 *     Obsidian-style board (the live physics simulation itself is not built);
 *   * ready names for an arrow («يستند إلى», «يؤيد», «يناقض») offered as
 *     suggestions on the arrow's label; any other text can still be typed.
 */
import type { GraphEdge } from "./_graph-model";

/** The reference's three relation names, in its order. */
export const EDGE_LABEL_PRESETS = ["يستند إلى", "يؤيد", "يناقض"] as const;

/** The id of the <datalist> the arrow labels share. */
export const EDGE_LABEL_LIST_ID = "nz-graph-edge-labels";

/** `id` and every card joined to it by one arrow, in either direction. Null id → null (nothing focused). */
export function firstNeighbours(edges: readonly Pick<GraphEdge, "from" | "to">[], id: string | null): Set<string> | null {
  if (!id) return null;
  const out = new Set<string>([id]);
  for (const e of edges) {
    if (e.from === id) out.add(e.to);
    else if (e.to === id) out.add(e.from);
  }
  return out;
}

/** Does this arrow touch the focused card? (No focus → every arrow is "in".) */
export function edgeInFocus(edge: Pick<GraphEdge, "from" | "to">, focusId: string | null): boolean {
  return !focusId || edge.from === focusId || edge.to === focusId;
}
