import test from "node:test";
import assert from "node:assert/strict";
import { groupNodes, normalizeLoadedGroups, reconcileGroups, removeNodes } from "./_graph-groups.ts";
import { normalizeLoadedBoard } from "./_graph-sanitize.ts";
import type { GraphEdge, GraphNode, NodeGroup } from "./_graph-model";

const node = (id: string, groupId?: string): GraphNode => ({
  id, type: "doc", title: id, desc: "", pos: { x: 0, y: 0 }, author: { name: "", color: "", role: "" },
  ...(groupId ? { groupId } : {}),
});
const edge = (id: string, from: string, to: string): GraphEdge => ({ id, from, to, type: "support", label: "" });
const group = (id: string, nodeIds: string[], locked = true): NodeGroup => ({ id, label: "الوقائع", color: "#3b82f6", nodeIds, locked });

test("item 03: groups round-trip through viewport.groups — name, colour, lock and cards", () => {
  const nodes = [node("a", "g1"), node("b", "g1"), node("c")];
  const groups = [group("g1", ["a", "b"], false)];
  // What the autosave sends, through JSON (the jsonb column), and back.
  const saved = JSON.parse(JSON.stringify({ nodes, edges: [edge("ab", "a", "b")], viewport: { pan: { x: 1, y: 2 }, scale: 1, groups } }));
  const board = normalizeLoadedBoard(saved);
  assert.deepEqual(board.groups, groups, "the lock state (unlocked) survives");
  assert.deepEqual(board.nodes, nodes, "cards come back untouched");
  assert.equal(board.edges.length, 1);
});

test("item 03: a board saved without groups loads none; junk is repaired or dropped", () => {
  assert.deepEqual(normalizeLoadedBoard({ nodes: [node("a")], edges: [], viewport: { pan: { x: 0, y: 0 }, scale: 1 } }).groups, []);
  assert.deepEqual(normalizeLoadedBoard(null), { nodes: [], edges: [], groups: [] });
  const out = normalizeLoadedGroups(
    [
      { id: "g1", label: 5, color: "red;background:url(x)", nodeIds: ["a", "b", 7, "ghost"], locked: "yes" },
      { id: "", nodeIds: ["a", "b"] },
      "junk",
    ],
    [node("a", "g1"), node("b", "g1")],
  );
  assert.equal(out.groups.length, 1);
  const g = out.groups[0];
  assert.match(g.color, /^#[0-9a-f]{6}$/i, "the outline colour is always #rrggbb");
  assert.equal(typeof g.label, "string");
  assert.equal(g.locked, true);
  assert.deepEqual(g.nodeIds, ["a", "b"], "ids of cards that are not on the board are dropped");
});

test("item 03: cards grouped before groups were saved get their group back (locked, default name)", () => {
  const out = normalizeLoadedGroups(undefined, [node("a", "grp_1"), node("b", "grp_1"), node("c", "grp_lonely")]);
  assert.equal(out.groups.length, 1);
  assert.deepEqual(out.groups[0].nodeIds, ["a", "b"]);
  assert.equal(out.groups[0].locked, true);
  assert.equal(out.nodes[2].groupId, undefined, "a one-card leftover is not a group");
});

test("item 08: deleting cards removes their arrows and their group membership", () => {
  const board = {
    nodes: [node("a", "g1"), node("b", "g1"), node("c", "g1"), node("d", "g2"), node("e", "g2")],
    edges: [edge("ab", "a", "b"), edge("cd", "c", "d"), edge("de", "d", "e")],
    groups: [group("g1", ["a", "b", "c"]), group("g2", ["d", "e"])],
  };
  const out = removeNodes(board, ["c", "d"]);
  assert.deepEqual(out.nodes.map((n) => n.id), ["a", "b", "e"]);
  assert.deepEqual(out.edges.map((e) => e.id), ["ab"]);
  assert.deepEqual(out.groups.map((g) => [g.id, g.nodeIds]), [["g1", ["a", "b"]]], "g2 is left with one card → dissolved");
  assert.equal(out.nodes[2].groupId, undefined, "the survivor of a dissolved group is ungrouped");
  assert.equal(out.nodes[0], board.nodes[0], "untouched cards keep their identity");
});

test("item 08: grouping cards that are already grouped moves them, never lists them twice", () => {
  const board = { nodes: [node("a", "g1"), node("b", "g1"), node("c", "g1"), node("d")], groups: [group("g1", ["a", "b", "c"])] };
  const out = groupNodes(board, ["c", "d", "ghost"], "g2")!;
  assert.deepEqual(out.groups.map((g) => [g.id, g.nodeIds]), [["g1", ["a", "b"]], ["g2", ["c", "d"]]]);
  assert.equal(out.nodes.find((n) => n.id === "c")?.groupId, "g2");
  assert.equal(groupNodes(board, ["d", "ghost"], "g3"), null, "one real card is not a group");
});

test("reconcileGroups is a no-op on a consistent board", () => {
  const nodes = [node("a", "g1"), node("b", "g1")];
  const out = reconcileGroups(nodes, [group("g1", ["a", "b"])]);
  assert.equal(out.nodes[0], nodes[0]);
  assert.equal(out.nodes[1], nodes[1]);
});
