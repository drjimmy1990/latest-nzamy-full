import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_ADD_ITEMS,
  QUICK_ADD_SHORTCUT_LABEL,
  isQuickAddShortcut,
  isTypingTarget,
  quickAddEnabledFor,
  visibleQuickAddItems,
} from "./quickAddItems.ts";

const ids = (ctx: Parameters<typeof visibleQuickAddItems>[0]) => visibleQuickAddItems(ctx).map((i) => i.id);
const key = (over: Partial<Parameters<typeof isQuickAddShortcut>[0]> = {}) => ({
  code: "KeyN", key: "n", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, isComposing: false, ...over,
});

test("the item list: case, hearing, client, task, deadline, note, ledger — each id once", () => {
  assert.deepEqual(QUICK_ADD_ITEMS.map((i) => i.id), ["case", "hearing", "client", "task", "deadline", "note", "ledger"]);
  for (const item of QUICK_ADD_ITEMS) assert.ok(item.labelAr.length > 0 && item.routes.lawyer && item.routes.firm, item.id);
  assert.equal(QUICK_ADD_SHORTCUT_LABEL, "Alt+N");
});

test("an advocate on the lawyer dashboard gets every item", () => {
  assert.deepEqual(ids({ scope: "lawyer", practiceKind: "advocate" }), ["case", "hearing", "client", "task", "deadline", "note", "ledger"]);
  assert.deepEqual(ids({ scope: "lawyer" }), ["case", "hearing", "client", "task", "deadline", "note", "ledger"], "no practice kind = advocate");
});

test("a consultant (Art. 18) gets no hearing and no deadline, on either dashboard", () => {
  assert.deepEqual(ids({ scope: "lawyer", practiceKind: "consultant" }), ["case", "client", "task", "note", "ledger"]);
  assert.deepEqual(ids({ scope: "firm", practiceKind: "consultant", firmRole: "managing_partner", canAddCase: true }), ["case", "client", "task", "note", "ledger"]);
});

test("firm items follow the firm route rules of the session role", () => {
  assert.deepEqual(ids({ scope: "firm", firmRole: "managing_partner", canAddCase: true }), ["case", "hearing", "client", "task", "deadline", "note", "ledger"]);
  // legal_consultant: cases and tasks yes, hearings (Art. 18) no; this role may not add a case.
  assert.deepEqual(ids({ scope: "firm", firmRole: "legal_consultant", canAddCase: false }), ["client", "task", "note", "ledger"]);
  // a trainee may open the firm diary (hearings) and tasks, not clients — nor the
  // firm case files, so no ledger entry (it belongs to a case).
  assert.deepEqual(ids({ scope: "firm", firmRole: "trainee", canAddCase: false }), ["hearing", "task", "deadline", "note"]);
  // finance: clients, and a note — the wall is on the firm dashboard every role opens.
  assert.deepEqual(ids({ scope: "firm", firmRole: "finance_manager", canAddCase: false }), ["client", "note"]);
});

test("only lawyer and firm sessions that are signed in get quick add at all", () => {
  assert.equal(quickAddEnabledFor({ isLoggedIn: true, userType: "lawyer" }), true);
  assert.equal(quickAddEnabledFor({ isLoggedIn: true, userType: "firm" }), true);
  assert.equal(quickAddEnabledFor({ isLoggedIn: true, userType: "provider" }), false, "the lawyer layout also serves /notifications for providers");
  assert.equal(quickAddEnabledFor({ isLoggedIn: true, userType: "admin" }), false);
  assert.equal(quickAddEnabledFor({ isLoggedIn: false, userType: "lawyer" }), false);
});

test("Alt+N by physical key: works on an Arabic layout and on macOS, where Alt+N types a dead key", () => {
  assert.equal(isQuickAddShortcut(key()), true);
  assert.equal(isQuickAddShortcut(key({ key: "ى" })), true, "Arabic layout");
  assert.equal(isQuickAddShortcut(key({ key: "Dead" })), true, "macOS Option+N");
  assert.equal(isQuickAddShortcut(key({ key: "˜" })), true);
});

test("everything else is not the shortcut", () => {
  assert.equal(isQuickAddShortcut(key({ altKey: false })), false);
  assert.equal(isQuickAddShortcut(key({ ctrlKey: true })), false, "Ctrl+Alt+N (AltGr on Windows)");
  assert.equal(isQuickAddShortcut(key({ metaKey: true })), false);
  assert.equal(isQuickAddShortcut(key({ shiftKey: true })), false);
  assert.equal(isQuickAddShortcut(key({ repeat: true })), false, "a held key does not flicker the menu");
  assert.equal(isQuickAddShortcut(key({ isComposing: true })), false);
  assert.equal(isQuickAddShortcut(key({ code: "KeyM", key: "m" })), false);
});

test("typing targets swallow the shortcut", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget({ tagName: "BODY" }), false);
  assert.equal(isTypingTarget(null), false);
});
