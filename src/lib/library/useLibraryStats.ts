"use client";

/**
 * Client hook for the library counters. See ./libraryStats.ts for the display
 * rules and labels, and src/app/api/library/stats/route.ts for the cached read.
 */

import { useEffect, useState } from "react";
import { LIBRARY_STATS_ENDPOINT, parseLibraryStatsResponse, type LibraryStats } from "./libraryStats";

// ─── Client hook ────────────────────────────────────────────────────────────

export type LibraryStatsState =
  | { status: "loading"; stats: null }
  | { status: "ready"; stats: LibraryStats }
  | { status: "error"; stats: null };

// One request per page load, shared by every counter on the page (the home
// page mounts two). A failure is not memoised, so a later mount retries.
let sharedRequest: Promise<LibraryStats> | null = null;

function loadLibraryStats(): Promise<LibraryStats> {
  sharedRequest ??= fetch(LIBRARY_STATS_ENDPOINT, { headers: { Accept: "application/json" } })
    .then(async (res) => {
      const body: unknown = await res.json().catch(() => null);
      const stats = res.ok ? parseLibraryStatsResponse(body) : null;
      if (!stats) throw new Error(`library stats unavailable (${res.status})`);
      return stats;
    })
    .catch((err: unknown) => {
      sharedRequest = null;
      throw err;
    });
  return sharedRequest;
}

/**
 * The live library counts for a client component. "loading" → render a
 * neutral placeholder; "error" → render NO number (hide the figure); "ready"
 * → format with formatLibraryCount.
 */
export function useLibraryStats(): LibraryStatsState {
  const [state, setState] = useState<LibraryStatsState>({ status: "loading", stats: null });
  useEffect(() => {
    let alive = true;
    loadLibraryStats().then(
      (stats) => { if (alive) setState({ status: "ready", stats }); },
      () => { if (alive) setState({ status: "error", stats: null }); },
    );
    return () => { alive = false; };
  }, []);
  return state;
}
