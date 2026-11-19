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
  /** Register 14 item 8 (batch l9): the daily warning threshold (30) and whether it is reached. */
  warnAt: number | null;
  warn: boolean;
  /** Full-text opens over the last 7 Riyadh days and the cap (150); null before 20261129_40. */
  weekUsed: number | null;
  weekLimit: number | null;
  overWeekly: boolean;
  weekResetsAt: string | null;
}

/** Register 14 item 48 (batch l9): a library subscriber below the 50-point minimum. */
export interface LibraryPointsLockState {
  message: string;
  balance: number;
  minPoints: number;
  topupHref: string;
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
  /** Owner item 9 (batch l8): the library is locked for this account's type. */
  accountLock: { message: string } | null;
  /** Register 14 item 48 (batch l9): balance below library_min_points_to_browse. */
  pointsLock: LibraryPointsLockState | null;
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

function parseAccountLock(value: unknown): { message: string } | null {
  if (!value || typeof value !== "object") return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() !== "" ? { message } : null;
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function parseQuota(value: unknown): LibraryReadQuota | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.usedToday !== "number" || typeof v.dailyLimit !== "number") return null;
  return {
    usedToday: v.usedToday,
    dailyLimit: v.dailyLimit,
    resetsAt: typeof v.resetsAt === "string" ? v.resetsAt : null,
    overDaily: v.overDaily === true,
    warnAt: num(v.warnAt),
    warn: v.warn === true,
    weekUsed: num(v.weekUsed),
    weekLimit: num(v.weekLimit),
    overWeekly: v.overWeekly === true,
    weekResetsAt: typeof v.weekResetsAt === "string" ? v.weekResetsAt : null,
  };
}

function parsePointsLock(value: unknown): LibraryPointsLockState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.message !== "string" || v.message.trim() === "") return null;
  const balance = num(v.balance);
  const minPoints = num(v.minPoints);
  if (balance === null || minPoints === null) return null;
  const href = typeof v.topupHref === "string" && /^\/(?!\/)/.test(v.topupHref) ? v.topupHref : "/pricing";
  return { message: v.message, balance, minPoints, topupHref: href };
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
  accountLock: null,
  pointsLock: null,
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
            accountLock: parseAccountLock(data.accountLock),
            pointsLock: parsePointsLock(data.pointsLock),
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
