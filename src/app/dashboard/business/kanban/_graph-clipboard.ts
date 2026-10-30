/**
 * _graph-clipboard.ts — the board's own copy / paste / group shortcuts
 * (owner's NOTE-08 item 07).
 *
 * Two defects, both fixed here:
 *   * Ctrl+C / Ctrl+V / Ctrl+G compared `e.key` with "c" / "v" / "g". On an
 *     Arabic layout those keys report «ؤ» / «ر» / «ل», so none of the three
 *     worked. They now match `e.code` (the physical key), as undo/redo in
 *     ./_graph-history.ts already did.
 *   * the clipboard held ONE card — the first of the selection. It now holds
 *     every selected card and the arrows BETWEEN them (an arrow to a card that
 *     was not copied has nothing to point at in the copy).
 *
 * The clipboard is the board's own, in memory — not the system clipboard.
 */
import type { GraphEdge, GraphNode, Point } from "./_graph-model";
import type { ShortcutEventLike } from "./_graph-history";

export type BoardShortcut = "copy" | "paste" | "group";

/** Ctrl/⌘ + C / V / G on any keyboard layout. Shift or Alt held → not ours. */
export function boardShortcut(e: ShortcutEventLike): BoardShortcut | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return null;
  switch (e.code) {
    case "KeyC": return "copy";
    case "KeyV": return "paste";
    case "KeyG": return "group";
    default: return null;
  }
}

export interface BoardClipboard {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The selected cards (board order) and only the arrows that join two of them. */
export function copySelection(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  ids: ReadonlySet<string>,
): BoardClipboard | null {
  const picked = nodes.filter((n) => ids.has(n.id));
  if (picked.length === 0) return null;
  const kept = new Set(picked.map((n) => n.id));
  return {
    nodes: structuredClone(picked),
    edges: structuredClone(edges.filter((e) => kept.has(e.from) && kept.has(e.to))),
  };
}

/**
 * Fresh copies to add to the board: new ids (arrows re-pointed at the new
 * cards), shifted by `offset`, out of any group (a group is a choice made on
 * the originals).
 */
export function pasteClipboard(
  clip: BoardClipboard,
  makeId: (kind: "node" | "edge") => string,
  offset: Point,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const idMap = new Map<string, string>();
  const nodes = clip.nodes.map((n) => {
    const id = makeId("node");
    idMap.set(n.id, id);
    const copy: GraphNode = { ...structuredClone(n), id, pos: { x: n.pos.x + offset.x, y: n.pos.y + offset.y } };
    delete copy.groupId;
    return copy;
  });
  const edges: GraphEdge[] = [];
  for (const e of clip.edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (from && to) edges.push({ ...structuredClone(e), id: makeId("edge"), from, to });
  }
  return { nodes, edges };
}
