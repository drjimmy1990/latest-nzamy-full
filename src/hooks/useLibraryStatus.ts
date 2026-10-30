"use client";

import { useEffect, useState } from "react";

export type LibraryStatus = "open" | "closed";

/** Owner note ١٣ C09: this caller's library-only lock (not an account freeze). */
export interface LibrarySecurityLock {
  reference: string | null;
  lockedUntil: string | null;
  message: string;
  support: string;
}

/** Owner note ١٣ C07: distinct documents this caller opened today. */
export interface LibraryReadQuota {
  usedToday: number;
  dailyLimit: number;
  resetsAt: string | null;
  overDaily: boolean;
}

export interface LibraryStatusState {
  status: LibraryStatus;
  closed: boolean;
  message: string | null;
  isAdmin: boolean;
  /** What this caller actually experiences, after the admin bypass. */
  effectiveStatus: LibraryStatus;
  securityLock: LibrarySecurityLock | null;
  readQuota: LibraryReadQuota | null;
}

function parseLock(value: unknown): LibrarySecurityLock | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.message !== "string" || v.message.trim() === "") return null;
  return {
    reference: typeof v.reference === "string" ? v.reference : null,
    lockedUntil: typeof v.lockedUntil === "string" ? v.lockedUntil : null,
    message: v.message,
    support: typeof v.support === "string" && v.support.startsWith("/") ? v.support : "/contact",
  };
}

function parseQuota(value: unknown): LibraryReadQuota | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.usedToday !== "number" || typeof v.dailyLimit !== "number") return null;
  return {
    usedToday: v.usedToday,
    dailyLimit: v.dailyLimit,
    resetsAt: typeof v.resetsAt === "string" ? v.resetsAt : null,
    overDaily: v.overDaily === true,
  };
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
  securityLock: null,
  readQuota: null,
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
        const data = (await res.json()) as Partial<Record<keyof LibraryStatusState, unknown>>;
        if (!cancelled) {
          const status: LibraryStatus = data.status === "closed" ? "closed" : "open";
          const effectiveStatus: LibraryStatus =
            data.effectiveStatus === "closed" ? "closed" : "open";
          setState({
            status,
            closed: typeof data.closed === "boolean" ? data.closed : status === "closed",
            message: typeof data.message === "string" ? data.message : null,
            isAdmin: data.isAdmin === true,
            effectiveStatus,
            securityLock: parseLock(data.securityLock),
            readQuota: parseQuota(data.readQuota),
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
