"use client";

/**
 * Client hook: does the viewer have the full library? It asks GET
 * /api/v1/library/access once per mount; see ./libraryFullAccess.ts for how the
 * answer is read.
 *
 * For pages that do not load /api/library/init (whose `viewer.hasFullAccess`
 * carries the same answer): the /laws/subscribe redeem CTA and the /laws
 * invitation banner. While `loading` is true, show neither, so a subscriber
 * never sees them flash.
 *
 * It answers about the library's texts only. The library assistant has its own
 * rule (Pro+ or an admin, owner ٢٠٧), so never show or hide it on this.
 */

import { useEffect, useState } from "react";
import { LIBRARY_ACCESS_ENDPOINT, parseLibraryAccessResponse } from "./libraryFullAccess";

export interface LibraryFullAccessState {
  hasFullAccess: boolean;
  loading: boolean;
}

export function useLibraryFullAccess(): LibraryFullAccessState {
  const [state, setState] = useState<LibraryFullAccessState>({ hasFullAccess: false, loading: true });
  useEffect(() => {
    let alive = true;
    fetch(LIBRARY_ACCESS_ENDPOINT, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (res) => parseLibraryAccessResponse(res.ok, await res.json().catch(() => null)))
      .catch(() => false)
      .then((hasFullAccess) => {
        if (alive) setState({ hasFullAccess, loading: false });
      });
    return () => { alive = false; };
  }, []);
  return state;
}
