import test from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_LIMIT,
  emptyHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
  historyShortcut,
  isEditableTarget,
} from "./_graph-history.ts";

test("pushHistory keeps at most 40 past snapshots and clears the future", () => {
  let h = emptyHistory<number>();
  for (let i = 0; i < 50; i++) h = pushHistory(h, i);
  assert.equal(HISTORY_LIMIT, 40);
  assert.equal(h.past.length, 40);
  assert.equal(h.past[0], 10, "the oldest snapshots fall off the bottom");
  assert.equal(h.past[39], 49);
  const undone = undoHistory(h, 99);
  assert.ok(undone);
  const pushed = pushHistory(undone.history, 7);
  assert.equal(pushed.future.length, 0, "a new step forgets the redo branch");
});

test("undo returns the previous snapshot and stores the current one for redo", () => {
  let h = emptyHistory<string>();
  h = pushHistory(h, "a");
  h = pushHistory(h, "b");
  const u1 = undoHistory(h, "c");
  assert.ok(u1);
  assert.equal(u1.state, "b");
  const u2 = undoHistory(u1.history, u1.state);
  assert.ok(u2);
  assert.equal(u2.state, "a");
  assert.equal(undoHistory(u2.history, u2.state), null, "nothing older than the first snapshot");
  const r1 = redoHistory(u2.history, u2.state);
  assert.ok(r1);
  assert.equal(r1.state, "b");
  const r2 = redoHistory(r1.history, r1.state);
  assert.ok(r2);
  assert.equal(r2.state, "c");
  assert.equal(redoHistory(r2.history, r2.state), null);
  assert.equal(canUndo(r2.history), true);
  assert.equal(canRedo(r2.history), false);
  assert.equal(canUndo(emptyHistory()), false);
});

const ev = (o: Partial<{ code: string; key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }>) => ({
  code: "", key: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o,
});

test("historyShortcut reads the physical key, so an Arabic layout still undoes", () => {
  assert.equal(historyShortcut(ev({ code: "KeyZ", key: "ئ", ctrlKey: true })), "undo");
  assert.equal(historyShortcut(ev({ code: "KeyZ", key: "z", metaKey: true })), "undo");
  assert.equal(historyShortcut(ev({ code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true })), "redo");
  assert.equal(historyShortcut(ev({ code: "KeyZ", key: "Z", metaKey: true, shiftKey: true })), "redo");
  assert.equal(historyShortcut(ev({ code: "KeyY", key: "y", ctrlKey: true })), "redo");
  assert.equal(historyShortcut(ev({ code: "KeyZ", key: "z" })), null, "no modifier, no shortcut");
  assert.equal(historyShortcut(ev({ code: "KeyZ", key: "z", ctrlKey: true, altKey: true })), null);
  assert.equal(historyShortcut(ev({ code: "KeyX", key: "x", ctrlKey: true })), null);
});

test("isEditableTarget: inputs, textareas, selects and contenteditable keep their own undo", () => {
  assert.equal(isEditableTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: false }), false);
  assert.equal(isEditableTarget(null), false);
});
