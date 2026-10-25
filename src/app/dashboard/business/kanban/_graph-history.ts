/**
 * _graph-history.ts — the undo/redo stack of the case canvas (N3.5).
 *
 * Pure and framework-free so it runs under `node --test`. The canvas stores a
 * whole snapshot ({nodes, edges, groups}) per step, not a diff: the boards are
 * small (tens of cards), a snapshot cannot drift out of step with the state it
 * restores, and 40 of them are cheap.
 *
 * WHEN a snapshot is taken is the canvas's business, not this file's — see
 * `_use-case-graph-state.ts`: once per gesture (pointer down → up, focus →
 * blur), never per pointermove, or a single drag would use up all 40 steps.
 */

export const HISTORY_LIMIT = 40;

export interface History<T> {
  /** Oldest first. `past[past.length - 1]` is what Ctrl+Z returns to. */
  past: T[];
  /** Most recent undo last. */
  future: T[];
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Record the state as it was BEFORE a change. Forgets the redo branch. */
export function pushHistory<T>(h: History<T>, before: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...h.past, before];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export function undoHistory<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  if (h.past.length === 0) return null;
  const state = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current] }, state };
}

export function redoHistory<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  if (h.future.length === 0) return null;
  const state = h.future[h.future.length - 1];
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1) }, state };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

export interface ShortcutEventLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Ctrl/Cmd+Z → undo; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y → redo.
 *
 * Matched on `code` (the physical key), not `key`: on an Arabic layout the Z
 * key reports «ئ», and with Shift held `key` is an upper-case "Z" — matching
 * `key === "z"` would miss both.
 */
export function historyShortcut(e: ShortcutEventLike): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.code === "KeyZ") return e.shiftKey ? "redo" : "undo";
  if (e.code === "KeyY" && !e.shiftKey) return "redo";
  return null;
}

/** A focused field keeps the browser's own text undo. */
export function isEditableTarget(
  el: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}
