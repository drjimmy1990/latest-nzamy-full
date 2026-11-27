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
 * Asked on every mount (no cache): a plan bought a minute ago must open the
 * page at once.
 */
export type OfficePlanLevelState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; level: OfficeLevel | null }
  | { status: "unknown" };

export function useOfficePlanLevel(enabled: boolean): OfficePlanLevelState {
  const [state, setState] = useState<OfficePlanLevelState>(enabled ? { status: "loading" } : { status: "off" });
  useEffect(() => {
    if (!enabled) {
      setState({ status: "off" });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    (async () => {
      try {
        const supabase = createClient();
        let read = readOfficeLevel(await supabase.rpc("my_office_plan_level"));
        if (read.state === "missing") read = levelFromLockedRead(await supabase.rpc("my_office_features_locked"));
        if (!alive) return;
        setState(read.state === "level" ? { status: "ready", level: read.level } : { status: "unknown" });
      } catch {
        if (alive) setState({ status: "unknown" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);
  // The render between `enabled` turning true and the effect: still loading,
  // never a stale "off" that would show a locked page for a moment.
  if (!enabled) return { status: "off" };
  return state.status === "off" ? { status: "loading" } : state;
}
