"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { loadStepValue, saveStepValue, sameShape } from "@/lib/ai/toolStepState";
import { useUser } from "@/hooks/useUser";

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
 * put back in an effect, so hydration never mismatches, and nothing is written
 * until that restore has happened (`ready`), so a double-run effect in
 * development never overwrites the kept value with `initial`. The kept value
 * belongs to the signed-in user (his id is in the key): nothing is read or kept
 * without one. A kept value of another shape — or, for a step, outside
 * `allowed` — is ignored. `enabled: false` (e.g. a page opened with its own
 * prefill) neither restores nor keeps. JSON values only: never pass a File, a
 * Set or a run's result.
 */
export function useSessionState<T>(
  tool: string,
  field: string,
  initial: T,
  opts?: { allowed?: readonly T[]; enabled?: boolean },
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const user = useUser();
  const owner = !user.loading && user.isLoggedIn && user.userId ? user.userId : null;
  const enabled = (opts?.enabled ?? true) && owner !== null;
  const allowed = opts?.allowed;

  useEffect(() => {
    if (!enabled || !owner) {
      setReady(false);
      return;
    }
    const kept = loadStepValue(session(), owner, tool, field, Date.now());
    if (sameShape(initial, kept) && (!allowed || allowed.includes(kept as T))) setValue(kept as T);
    setReady(true);
    // once per tool/field/user: the initial value of a later render must not re-restore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, field, owner, enabled]);

  useEffect(() => {
    if (!ready || !enabled || !owner) return;
    saveStepValue(session(), owner, tool, field, value, Date.now());
  }, [tool, field, value, ready, enabled, owner]);

  return [value, setValue];
}
