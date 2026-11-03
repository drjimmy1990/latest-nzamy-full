import test from "node:test";
import assert from "node:assert/strict";
import { boardShortcut, copySelection, pasteClipboard } from "./_graph-clipboard.ts";
import type { GraphEdge, GraphNode } from "./_graph-model";

const key = (code: string, key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  code, key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
});

const node = (id: string, x = 0, extra: Partial<GraphNode> = {}): GraphNode => ({
  id, type: "doc", title: id, desc: "", pos: { x, y: 0 }, author: { name: "", color: "", role: "" }, ...extra,
});
const edge = (id: string, from: string, to: string): GraphEdge => ({ id, from, to, type: "support", label: "" });

test("item 07: Ctrl+C / V / G work on an Arabic layout (matched on e.code)", () => {
  assert.equal(boardShortcut(key("KeyC", "ؤ", { ctrlKey: true })), "copy");
  assert.equal(boardShortcut(key("KeyV", "ر", { ctrlKey: true })), "paste");
  assert.equal(boardShortcut(key("KeyG", "ل", { ctrlKey: true })), "group");
  assert.equal(boardShortcut(key("KeyC", "c", { metaKey: true })), "copy", "⌘ on a Mac");
  assert.equal(boardShortcut(key("KeyC", "c")), null, "no modifier");
  assert.equal(boardShortcut(key("KeyC", "C", { ctrlKey: true, shiftKey: true })), null, "Ctrl+Shift+C is the browser's");
  assert.equal(boardShortcut(key("KeyV", "v", { ctrlKey: true, altKey: true })), null);
  assert.equal(boardShortcut(key("KeyZ", "ئ", { ctrlKey: true })), null, "undo stays with historyShortcut");
});

test("item 07: copying a multi-selection keeps every card and only the arrows between them", () => {
  const nodes = [node("a"), node("b", 300), node("c", 600)];
  const edges = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a")];
  const clip = copySelection(nodes, edges, new Set(["a", "b"]));
  assert.ok(clip);
  assert.deepEqual(clip.nodes.map((n) => n.id), ["a", "b"]);
  assert.deepEqual(clip.edges.map((e) => e.id), ["ab"], "an arrow to an uncopied card is left out");
  assert.equal(copySelection(nodes, edges, new Set()), null);
  assert.equal(copySelection(nodes, edges, new Set(["gone"])), null);
  // The clipboard is a snapshot: later edits to the board do not reach it.
  nodes[0].title = "changed";
  assert.equal(clip.nodes[0].title, "a");
});

test("item 07: paste gives new ids, re-points the arrows, shifts, and leaves groups behind", () => {
  const clip = copySelection(
    [node("a", 10, { groupId: "g1" }), node("b", 300, { groupId: "g1" })],
    [edge("ab", "a", "b")],
    new Set(["a", "b"]),
  )!;
  let i = 0;
  const out = pasteClipboard(clip, (k) => `${k}_${i++}`, { x: 40, y: 40 });
  assert.deepEqual(out.nodes.map((n) => n.id), ["node_0", "node_1"]);
  assert.deepEqual(out.nodes.map((n) => n.pos), [{ x: 50, y: 40 }, { x: 340, y: 40 }]);
  assert.ok(out.nodes.every((n) => !("groupId" in n)), "a paste is in no group");
  assert.deepEqual(out.edges, [{ id: "edge_2", from: "node_0", to: "node_1", type: "support", label: "" }]);
  // Pasting twice never reuses ids.
  const again = pasteClipboard(clip, (k) => `${k}_${i++}`, { x: 80, y: 80 });
  assert.notDeepEqual(again.nodes.map((n) => n.id), out.nodes.map((n) => n.id));
});
