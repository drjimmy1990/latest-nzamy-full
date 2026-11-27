"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { levelFromLockedRead, readOfficeLevel, type OfficeLevel } from "@/lib/auth/officePages";

/**
 * Owner ق٢٦-٤ / ق٢٦-٥: which office step this session's account holds — the
 * database's answer, public.my_office_plan_level() (20261209_60), falling
 * back to public.my_office_features_locked() (20261206_70) while that file is
 * not applied yet.
 *
 *   { status: "loading" }                  — not asked yet / asking
 *   { status: "ready", level }             — null = not a professional account (nothing locked)
 *   { status: "unknown" }                  — the read failed: the screens lock nothing
 *                                            (the server's write gates fail closed)
 *   { status: "off" }                      — `enabled` is false
 *
 * Asked on every mount: a plan bought a minute ago must open the page at once.
 *
 * l19 review (access N6): the last `ready` answer of the same user is kept
 * for 30 seconds in this tab and shown AT ONCE on the next mount (no blank
 * page, no empty case list for a paying lawyer between two office pages)
 * while the database is asked again; the fresh answer replaces it. Another
 * user, an older answer or a failed read starts from «loading» as before.
 */
export type OfficePlanLevelState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; level: OfficeLevel | null }
  | { status: "unknown" };

const LEVEL_MEMO_MS = 30_000;
let levelMemo: { userId: string; level: OfficeLevel | null; at: number } | null = null;

/** The last ready answer of `userId`, while it is younger than 30 s. */
export function cachedOfficeLevel(userId: string | null, now: number = Date.now()): { level: OfficeLevel | null } | null {
  if (!userId || !levelMemo || levelMemo.userId !== userId || now - levelMemo.at > LEVEL_MEMO_MS) return null;
  return { level: levelMemo.level };
}

function initialState(enabled: boolean, userId: string | null): OfficePlanLevelState {
  if (!enabled) return { status: "off" };
  const memo = cachedOfficeLevel(userId);
  return memo ? { status: "ready", level: memo.level } : { status: "loading" };
}

export function useOfficePlanLevel(enabled: boolean, userId: string | null = null): OfficePlanLevelState {
  const [state, setState] = useState<OfficePlanLevelState>(() => initialState(enabled, userId));
  useEffect(() => {
    if (!enabled) {
      setState({ status: "off" });
      return;
    }
    let alive = true;
    setState(initialState(true, userId));
    (async () => {
      try {
        const supabase = createClient();
        let read = readOfficeLevel(await supabase.rpc("my_office_plan_level"));
        if (read.state === "missing") read = levelFromLockedRead(await supabase.rpc("my_office_features_locked"));
        if (read.state === "level" && userId) levelMemo = { userId, level: read.level, at: Date.now() };
        else if (read.state !== "level") levelMemo = null;
        if (!alive) return;
        setState(read.state === "level" ? { status: "ready", level: read.level } : { status: "unknown" });
      } catch {
        levelMemo = null;
        if (alive) setState({ status: "unknown" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, userId]);
  // The render between `enabled` turning true and the effect: still loading,
  // never a stale "off" that would show a locked page for a moment.
  if (!enabled) return { status: "off" };
  return state.status === "off" ? { status: "loading" } : state;
}
