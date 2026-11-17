"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  clockOffsetMs,
  founderPhase,
  nextReadDelayMs,
  readFounderWindow,
  type PhaseView,
  type WindowRead,
} from "@/lib/founder/founderWindow";

/**
 * One read of GET /api/v1/campaigns/active for the whole /founder page (hero
 * countdown, join button, pulse popup), plus a 1-second clock corrected by
 * the server's time (founderWindow.ts). Re-reads:
 *   - when a countdown reaches zero (a boundary was crossed);
 *   - every 10 s while waiting for the server to open the sale («opening»),
 *     every 30 s after a failed read;
 *   - every 60 s otherwise (the seat count), and when the tab comes back.
 * Nothing time-dependent renders on the server: `nowMs` is null until the
 * first client tick (the SSR cached-date trap).
 */

interface FounderWindowValue {
  view: PhaseView;
  /** Corrected server time, or null before the first read. */
  nowMs: number | null;
  read: WindowRead | undefined;
}

const LOADING: FounderWindowValue = {
  view: { phase: "loading", targetMs: null, remainingMs: null, seatsLeft: null, seatsTotal: null },
  nowMs: null,
  read: undefined,
};

const FounderWindowContext = createContext<FounderWindowValue>(LOADING);

export function useFounderWindow(): FounderWindowValue {
  return useContext(FounderWindowContext);
}

const PERIODIC_READ_MS = 60_000;

export function FounderWindowProvider({ children }: { children: React.ReactNode }) {
  const [read, setRead] = useState<WindowRead | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [deviceNow, setDeviceNow] = useState<number | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const sentAt = Date.now();
    try {
      const res = await fetch("/api/v1/campaigns/active", { cache: "no-store" });
      const receivedAt = Date.now();
      const body: unknown = res.ok ? await res.json() : null;
      const next = readFounderWindow(body, { date: res.headers.get("date"), age: res.headers.get("age") });
      if (next.kind === "window") setOffset(clockOffsetMs(next.serverNowMs, sentAt, receivedAt));
      setRead(next);
    } catch {
      setRead({ kind: "error" });
    } finally {
      inFlight.current = false;
    }
  }, []);

  // First read + the 1-second clock.
  useEffect(() => {
    // Deferred a tick: the first read and the first clock value are
    // updates from outside React (the network, the clock), not render work.
    const first = window.setTimeout(() => {
      setDeviceNow(Date.now());
      void load();
    }, 0);
    const tick = window.setInterval(() => setDeviceNow(Date.now()), 1000);
    const periodic = window.setInterval(() => void load(), PERIODIC_READ_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(tick);
      window.clearInterval(periodic);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const nowMs = deviceNow === null || read === undefined ? null : deviceNow + offset;
  const view = nowMs === null ? LOADING.view : founderPhase(read, nowMs);

  // A boundary crossed on the corrected clock → read again (the server decides).
  const lastPhase = useRef(view.phase);
  useEffect(() => {
    if (lastPhase.current !== view.phase) {
      const crossed = lastPhase.current === "pre" || lastPhase.current === "live";
      lastPhase.current = view.phase;
      if (crossed) void load();
    }
  }, [view.phase, load]);

  // Short polling while waiting for the opening or after an error.
  useEffect(() => {
    const delay = nextReadDelayMs(view.phase);
    if (delay === null) return;
    const t = window.setInterval(() => void load(), delay);
    return () => window.clearInterval(t);
  }, [view.phase, load]);

  const value = useMemo(() => ({ view, nowMs, read }), [view, nowMs, read]);
  return <FounderWindowContext.Provider value={value}>{children}</FounderWindowContext.Provider>;
}
