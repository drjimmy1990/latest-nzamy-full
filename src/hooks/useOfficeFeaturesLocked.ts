"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Owner ق٢٦-١: is this session's account on the free side of «إدارة المكتب»?
 * The database's answer, public.my_office_features_locked() (20261206_70 —
 * the same function OfficePlanNotice reads). True only when the call returned
 * `true`; while loading, on any error, and with `enabled: false` it is false,
 * so a doubt never paints a paying account's menu locked. Display only: the
 * server gates (officePlanRefusal, the database caps) stay the enforcement.
 *
 * Asked again on every mount (no cache): an account that just bought a plan
 * must not keep a locked menu for the rest of the tab's life.
 */
export function useOfficeFeaturesLocked(enabled: boolean): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { data, error } = await createClient().rpc("my_office_features_locked");
        if (alive) setLocked(!error && data === true);
      } catch {
        if (alive) setLocked(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);
  return locked;
}
