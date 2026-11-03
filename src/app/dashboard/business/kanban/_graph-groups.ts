/**
 * _graph-groups.ts — card groups and their locks (owner's NOTE-08 items 03, 08).
 *
 * A group lived in two places that nothing kept in step: `node.groupId` (saved
 * with the cards) and `groups[].nodeIds` (React state only — never saved, so
 * every reload kept the cards' groupId and lost the group, its name, colour
 * and lock). Deleting a card left its id in `nodeIds`; grouping cards that
 * were already in a group left them listed in both.
 *
 * Now the groups are saved inside the board's `viewport` jsonb
 * (`viewport.groups` — no new column, no SQL), and every change that can
 * break membership goes through `reconcileGroups`:
 *   * a card is in at most one group, the one its `groupId` names;
 *   * `nodeIds` lists exactly those cards, in board order;
 *   * a group left with fewer than two cards is dissolved;
 *   * a `groupId` with no saved group (every board grouped before this fix)
 *     is rebuilt as a locked group with a default name and colour, so the
 *     grouping the lawyer made is not silently thrown away.
 *
 * Pure, type-only imports: loaded by `node --test`.
 */
import type { GraphEdge, GraphNode, NodeGroup } from "./_graph-model";

export const GROUP_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#C8A762"] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function defaultGroup(id: string, index: number): NodeGroup {
  return {
    id,
    label: `مجموعة ${index + 1}`,
    color: GROUP_COLORS[index % GROUP_COLORS.length],
    nodeIds: [],
    locked: true,
  };
}

/** Make `node.groupId` and `groups[].nodeIds` agree. Unchanged cards keep their identity. */
export function reconcileGroups(
  nodes: readonly GraphNode[],
  groups: readonly NodeGroup[],
): { nodes: GraphNode[]; groups: NodeGroup[] } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const known = new Map<string, NodeGroup>();
  for (const g of groups) if (!known.has(g.id)) known.set(g.id, g);

  // A card's own groupId wins; a group may also claim a card that has none
  // (or whose groupId names nothing).
  const assigned = new Map<string, string>();
  for (const n of nodes) if (n.groupId && known.has(n.groupId)) assigned.set(n.id, n.groupId);
  for (const g of known.values()) {
    for (const id of g.nodeIds) if (nodeIds.has(id) && !assigned.has(id)) assigned.set(id, g.id);
  }
  // groupIds with no saved group: rebuilt (see the header).
  const rebuilt: NodeGroup[] = [];
  for (const n of nodes) {
    if (!n.groupId || known.has(n.groupId) || assigned.has(n.id)) continue;
    if (!rebuilt.some((g) => g.id === n.groupId)) rebuilt.push(defaultGroup(n.groupId, known.size + rebuilt.length));
    assigned.set(n.id, n.groupId);
  }
  for (const g of rebuilt) known.set(g.id, g);

  const count = new Map<string, number>();
  for (const gid of assigned.values()) count.set(gid, (count.get(gid) ?? 0) + 1);
  for (const [nid, gid] of assigned) if ((count.get(gid) ?? 0) < 2) assigned.delete(nid);

  const outNodes = nodes.map((n) => {
    const gid = assigned.get(n.id);
    if (gid === n.groupId) return n as GraphNode;
    const copy = { ...n };
    if (gid) copy.groupId = gid; else delete copy.groupId;
    return copy;
  });
  const outGroups: NodeGroup[] = [];
  for (const g of known.values()) {
    const members = outNodes.filter((n) => assigned.get(n.id) === g.id).map((n) => n.id);
    if (members.length >= 2) outGroups.push({ ...g, nodeIds: members });
  }
  return { nodes: outNodes, groups: outGroups };
}

/**
 * `viewport.groups` as read back from the server: anything malformed is
 * dropped or repaired (the outline is drawn with `${color}50`, so a colour
 * must be #rrggbb), then reconciled against the cards that were loaded.
 */
export function normalizeLoadedGroups(
  raw: unknown,
  nodes: readonly GraphNode[],
): { nodes: GraphNode[]; groups: NodeGroup[] } {
  const groups: NodeGroup[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id) continue;
      const fallback = defaultGroup(item.id, groups.length);
      groups.push({
        id: item.id,
        label: typeof item.label === "string" && item.label.trim() ? item.label : fallback.label,
        color: typeof item.color === "string" && HEX_COLOR.test(item.color) ? item.color : fallback.color,
        nodeIds: Array.isArray(item.nodeIds) ? item.nodeIds.filter((v): v is string => typeof v === "string") : [],
        locked: typeof item.locked === "boolean" ? item.locked : true,
      });
    }
  }
  return reconcileGroups(nodes, groups);
}

/** A new group from the cards in `ids` that still exist (at least two), moved out of any earlier group. */
export function groupNodes(
  board: { nodes: readonly GraphNode[]; groups: readonly NodeGroup[] },
  ids: Iterable<string>,
  gid: string,
): { nodes: GraphNode[]; groups: NodeGroup[] } | null {
  const wanted = new Set(ids);
  const members = board.nodes.filter((n) => wanted.has(n.id)).map((n) => n.id);
  if (members.length < 2) return null;
  const memberSet = new Set(members);
  const base = defaultGroup(gid, board.groups.length);
  const nodes = board.nodes.map((n) => (memberSet.has(n.id) ? { ...n, groupId: gid } : n));
  const groups = [...board.groups, { ...base, nodeIds: members }];
  return reconcileGroups(nodes, groups);
}

/**
 * Delete cards: their arrows go with them, and they leave their group (which
 * is dissolved if fewer than two cards remain). Item 08: the ids used to stay
 * in `groups[].nodeIds` for good.
 */
export function removeNodes(
  board: { nodes: readonly GraphNode[]; edges: readonly GraphEdge[]; groups: readonly NodeGroup[] },
  ids: Iterable<string>,
): { nodes: GraphNode[]; edges: GraphEdge[]; groups: NodeGroup[] } {
  const gone = new Set(ids);
  const kept = board.nodes.filter((n) => !gone.has(n.id));
  const edges = board.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
  const groups = board.groups.map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !gone.has(id)) }));
  return { ...reconcileGroups(kept, groups), edges };
}
