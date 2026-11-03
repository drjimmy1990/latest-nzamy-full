/**
 * modalDismissPolicy.ts — one rule for every way out of a lawyer-dashboard
 * modal (CODE-F34, CODE-F35, LIVE-F29).
 *
 * Before: AddCase/AddHearing/AddStage/ContractForm/QuickTools let × or a
 * backdrop click close the form while its save was still in flight, some
 * modals ignored Escape, and none asked before throwing a typed draft away.
 *
 * Now every exit — the × button, the backdrop, Escape — asks this function:
 *   • while a save is in flight → stay open (the answer is on its way);
 *   • a changed, unsaved draft → ask first;
 *   • otherwise → close.
 *
 * Pure, so `node --test` covers it.
 */

export type DismissVia = "close_button" | "backdrop" | "escape";

export type DismissDecision = "close" | "confirm" | "block";

export function decideDismiss(state: { busy: boolean; dirty: boolean }): DismissDecision {
  if (state.busy) return "block";
  if (state.dirty) return "confirm";
  return "close";
}

export const DISCARD_DRAFT_PROMPT_AR = "لديك تغييرات لم تُحفظ. هل تريد إغلاق النافذة وتجاهلها؟";

/** Selector for the elements a Tab key may land on inside a dialog. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Where Tab should go from `index` in a list of `count` focusables:
 * wraps at both ends, so focus never leaves the dialog (a focus trap).
 * `index` -1 means focus is not on any of them yet.
 */
export function nextFocusIndex(index: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (index < 0) return backwards ? count - 1 : 0;
  if (backwards) return index === 0 ? count - 1 : index - 1;
  return index === count - 1 ? 0 : index + 1;
}
