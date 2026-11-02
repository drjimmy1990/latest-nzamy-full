"use client";

import { useEffect, useState } from "react";
import type { PricedAiToolId } from "@/lib/ai/toolPointsDisplay";

export type PointsShortfall = { balance: number; price: number } | null;

/**
 * usePointsShortfall — the server's answer to "is this user short of points
 * for one run of `tool`?" (GET /api/v1/ai/points-standing). Null until the
 * server says short, and null on any failure, for a guest (`enabled` false)
 * or for an admin: the banner it drives never shows on a guess (LIVE-06).
 * `recheck` asks again when it changes, e.g. after a run settles.
 */
export function usePointsShortfall(tool: PricedAiToolId, enabled: boolean, recheck: unknown = null): PointsShortfall {
  const [shortfall, setShortfall] = useState<PointsShortfall>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch(`/api/v1/ai/points-standing?tool=${encodeURIComponent(tool)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (!live) return;
        const s = j as { short?: unknown; balance?: unknown; price?: unknown } | null;
        const valid = s?.short === true && Number.isSafeInteger(s.balance) && Number.isSafeInteger(s.price);
        setShortfall(valid ? { balance: s.balance as number, price: s.price as number } : null);
      })
      .catch(() => {
        if (live) setShortfall(null);
      });
    return () => {
      live = false;
    };
  }, [tool, enabled, recheck]);

  // A guest (or a sign-out) never sees an answer fetched for an earlier session.
  return enabled ? shortfall : null;
}
