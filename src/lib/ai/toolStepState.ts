/**
 * toolStepState.ts — P2-3 / R3b (owner file 12, batch l12): a tool keeps its
 * wizard step and the fields typed so far when the user leaves the page and
 * comes back (the browser's back button, a link out and back, a reload).
 *
 *   - Where: sessionStorage, one value per field, under
 *     `nzamy:tool-step:<user>:<tool>:<field>` with the time it was saved. This
 *     tab only, gone when the tab closes; nothing is sent anywhere. The user id
 *     is part of the key: another account signed in on the same tab never
 *     reads what the previous one typed.
 *   - How long: STEP_STATE_MAX_AGE_MS; an older value is dropped.
 *   - What: JSON values only. A File, a run's result or a charged run is never
 *     kept: a restored screen shows the form as typed and never starts a run by
 *     itself; a finished result stays reachable from «سجلّي» (/ai/runs/[id]).
 *   - Size: a value over MAX_STEP_VALUE_CHARS is not kept (the field starts
 *     empty next time rather than storage failing).
 *
 * Every storage access is wrapped: a private window or blocked storage keeps
 * nothing and the tool simply starts fresh. Pure (storage injected), so
 * `node --test` loads it. The React side is src/hooks/useSessionState.ts.
 */

export const STEP_STATE_PREFIX = "nzamy:tool-step:";
export const STEP_STATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const MAX_STEP_VALUE_CHARS = 100_000;

export type StepStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PART = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export function stepStateKey(user: string, tool: string, field: string): string | null {
  return PART.test(user) && PART.test(tool) && PART.test(field) ? `${STEP_STATE_PREFIX}${user}:${tool}:${field}` : null;
}

/** The kept value, or `undefined` when nothing usable is kept (missing, stale, broken, blocked). */
export function loadStepValue(storage: StepStorage | null | undefined, user: string, tool: string, field: string, nowMs: number): unknown {
  const key = stepStateKey(user, tool, field);
  if (!storage || !key) return undefined;
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; value?: unknown } | null;
    if (!parsed || typeof parsed.savedAt !== "number" || !("value" in parsed)) return undefined;
    if (nowMs - parsed.savedAt > STEP_STATE_MAX_AGE_MS || parsed.savedAt > nowMs + 60_000) {
      storage.removeItem(key);
      return undefined;
    }
    return parsed.value;
  } catch {
    return undefined;
  }
}

/** Keep `value`; false when it cannot be kept (not JSON, too large, blocked). */
export function saveStepValue(storage: StepStorage | null | undefined, user: string, tool: string, field: string, value: unknown, nowMs: number): boolean {
  const key = stepStateKey(user, tool, field);
  if (!storage || !key || value === undefined) return false;
  try {
    const raw = JSON.stringify({ savedAt: nowMs, value });
    if (raw.length > MAX_STEP_VALUE_CHARS) {
      storage.removeItem(key);
      return false;
    }
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

/** Forget every kept field of one tool (a «new draft» / reset). */
export function clearStepState(storage: StepStorage | null | undefined, user: string, tool: string, fields: readonly string[]): void {
  if (!storage) return;
  for (const field of fields) {
    const key = stepStateKey(user, tool, field);
    if (!key) continue;
    try {
      storage.removeItem(key);
    } catch {
      // blocked storage: nothing was kept anyway
    }
  }
}

/**
 * A restored value is used only when it has the shape of the initial one (same
 * JSON type; for a step, one of the allowed values): a value from an older
 * version of the screen never breaks it.
 */
export function sameShape(initial: unknown, restored: unknown): boolean {
  if (restored === undefined) return false;
  if (initial === null) return restored === null || typeof restored !== "object";
  if (Array.isArray(initial)) return Array.isArray(restored);
  if (typeof initial === "object") return typeof restored === "object" && restored !== null && !Array.isArray(restored);
  return typeof restored === typeof initial;
}
