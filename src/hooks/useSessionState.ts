"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { loadStepValue, saveStepValue, sameShape } from "@/lib/ai/toolStepState";

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * useSessionState — useState that a tool's wizard keeps for this tab (P2-3 /
 * R3b, src/lib/ai/toolStepState.ts): the step and the fields typed so far come
 * back when the user leaves the page and returns.
 *
 * The first render is always `initial` (as on the server); the kept value is
 * put back in an effect, so hydration never mismatches. A kept value of another
 * shape — or, for a step, outside `allowed` — is ignored. `enabled: false`
 * (e.g. a page opened with its own prefill) neither restores nor keeps.
 * JSON values only: never pass a File, a Set or a run's result.
 */
export function useSessionState<T>(
  tool: string,
  field: string,
  initial: T,
  opts?: { allowed?: readonly T[]; enabled?: boolean },
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const restored = useRef(false);
  const enabled = opts?.enabled ?? true;
  const allowed = opts?.allowed;

  useEffect(() => {
    if (enabled) {
      const kept = loadStepValue(session(), tool, field, Date.now());
      if (sameShape(initial, kept) && (!allowed || allowed.includes(kept as T))) setValue(kept as T);
    }
    restored.current = true;
    // once per tool/field: the initial value of a later render must not re-restore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, field]);

  useEffect(() => {
    if (!enabled || !restored.current) return;
    saveStepValue(session(), tool, field, value, Date.now());
  }, [tool, field, value, enabled]);

  return [value, setValue];
}
