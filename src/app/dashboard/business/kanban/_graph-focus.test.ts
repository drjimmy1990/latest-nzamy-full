import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EDGE_LABEL_PRESETS, edgeInFocus, firstNeighbours } from "./_graph-focus.ts";
import { boardShortcut } from "./_graph-clipboard.ts";

const e = (from: string, to: string) => ({ from, to });

test("row 51: the focused card and its first neighbours, both directions, nothing further", () => {
  const edges = [e("a", "b"), e("c", "a"), e("b", "d")];
  assert.deepEqual([...firstNeighbours(edges, "a")!].sort(), ["a", "b", "c"]);
  assert.deepEqual([...firstNeighbours(edges, "z")!], ["z"], "a lone card is its own focus");
  assert.equal(firstNeighbours(edges, null), null);
  assert.equal(edgeInFocus(e("a", "b"), "a"), true);
  assert.equal(edgeInFocus(e("b", "d"), "a"), false);
  assert.equal(edgeInFocus(e("b", "d"), null), true);
});

test("row 54: the reference's three relation names are offered on every arrow label", () => {
  assert.deepEqual([...EDGE_LABEL_PRESETS], ["يستند إلى", "يؤيد", "يناقض"]);
  const view = readFileSync(new URL("./CaseGraphView.tsx", import.meta.url), "utf8");
  assert.match(view, /list=\{EDGE_LABEL_LIST_ID\}/);
  assert.match(view, /<datalist id=\{EDGE_LABEL_LIST_ID\}>/);
});

test("row 56: Ctrl/⌘+A selects every card on any layout; the board ignores it inside a field", () => {
  const k = (code: string, key: string, m: Record<string, boolean> = {}) =>
    ({ code, key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...m });
  assert.equal(boardShortcut(k("KeyA", "ش", { ctrlKey: true })), "selectAll");
  assert.equal(boardShortcut(k("KeyA", "a", { metaKey: true })), "selectAll");
  assert.equal(boardShortcut(k("KeyA", "a")), null);
  const hook = readFileSync(new URL("./_use-case-graph-state.ts", import.meta.url), "utf8");
  assert.match(hook, /action === "selectAll"[\s\S]{0,120}setSelectedNodeIds\(new Set\(snapshotRef\.current\.nodes\.map/);
  // The field check runs before any board shortcut.
  assert.ok(hook.indexOf("isEditableTarget(document.activeElement") < hook.indexOf('action === "selectAll"'));
});

test("row 51: the view fades cards and arrows outside the hovered card's neighbourhood", () => {
  const view = readFileSync(new URL("./CaseGraphView.tsx", import.meta.url), "utf8");
  assert.match(view, /const focusNodeId = drawingEdgeFrom \? null : hoveredNodeId;/);
  assert.match(view, /firstNeighbours\(edges, focusNodeId\)/);
  assert.match(view, /edgeInFocus\(edge, focusNodeId\)/);
  assert.match(view, /opacity: focusIds && !focusIds\.has\(node\.id\) \? 0\.35 : 1/);
});
