"use client";

import { useEffect, useState } from "react";

export type LibraryStatus = "open" | "closed";

export interface LibraryStatusState {
  status: LibraryStatus;
  closed: boolean;
  message: string | null;
  isAdmin: boolean;
  /** What this caller actually experiences, after the admin bypass. */
  effectiveStatus: LibraryStatus;
}

// Fail OPEN on a fetch error, mirroring the server's getLibraryStatus(). A
// transient network blip must not black out the library — and it cannot leak
// paid content either, because every content route enforces the gate itself.
const DEFAULT_STATUS: LibraryStatusState = {
  status: "open",
  closed: false,
  message: null,
  isAdmin: false,
  effectiveStatus: "open",
};

/**
 * useLibraryStatus — reads the admin-controlled legal-library open/close flag.
 *
 * When `effectiveStatus === "closed"`, library pages must render the closure
 * notice instead of content. ALWAYS branch on `loading` first and render a
 * placeholder — rendering content before the status resolves flashes real
 * statutory text to visitors while the library is supposed to be closed.
 *
 * Re-fetches periodically so an admin toggle takes effect without a reload.
 */
export function useLibraryStatus(intervalMs = 60_000) {
  const [state, setState] = useState<LibraryStatusState>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/v1/library/status", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState(DEFAULT_STATUS);
          return;
        }
        const data = (await res.json()) as Partial<LibraryStatusState>;
        if (!cancelled) {
          const status: LibraryStatus = data.status === "closed" ? "closed" : "open";
          const effectiveStatus: LibraryStatus =
            data.effectiveStatus === "closed" ? "closed" : "open";
          setState({
            status,
            closed: data.closed ?? status === "closed",
            message: data.message ?? null,
            isAdmin: data.isAdmin ?? false,
            effectiveStatus,
          });
        }
      } catch {
        if (!cancelled) setState(DEFAULT_STATUS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStatus();
    const id = setInterval(fetchStatus, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { ...state, loading };
}
