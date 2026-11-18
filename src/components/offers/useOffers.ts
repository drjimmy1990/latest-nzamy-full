"use client";

import { useEffect, useState } from "react";
import { isSupabaseMode } from "@/lib/services/api";
import { offersFromApi, type OffersReply } from "@/lib/offers/offerRules";

/**
 * GET /api/v1/offers for the browser (owner item 5). The popup, the «العروض»
 * sidebar item and the cards on one page share one request: a reply is
 * reused for a few seconds, then read again (a stopped offer disappears on
 * the next page). Demo mode and a signed-out / failed read give null —
 * nothing is shown on a guess.
 */

const REUSE_MS = 5_000;
let inflight: { at: number; promise: Promise<OffersReply | null> } | null = null;

export function fetchOffers(force = false): Promise<OffersReply | null> {
  const now = Date.now();
  if (!force && inflight && now - inflight.at < REUSE_MS) return inflight.promise;
  const promise = (async () => {
    try {
      const res = await fetch("/api/v1/offers", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return null;
      return offersFromApi(await res.json());
    } catch {
      return null;
    }
  })();
  inflight = { at: now, promise };
  return promise;
}

/** Drop the shared reply (after a dismissal), so the next reader asks again. */
export function forgetOffers(): void {
  inflight = null;
}

/** Report an event; never throws, never blocks navigation (keepalive). */
export function reportOfferEvent(id: string, kind: "impression" | "dismiss" | "click"): void {
  try {
    void fetch(`/api/v1/offers/${encodeURIComponent(id)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // Reporting is best effort.
  }
}

/** undefined while loading, null when there is nothing to show. */
export function useOffers(enabled: boolean): OffersReply | null | undefined {
  const [reply, setReply] = useState<OffersReply | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !isSupabaseMode) return;
    let live = true;
    void fetchOffers().then((r) => {
      if (live) setReply(r);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled && isSupabaseMode ? reply : null;
}
