"use client";

import { useCallback, useEffect, useState } from "react";
import { parseBillingResponse, type BillingData } from "@/lib/payments/billingView";

/**
 * useBillingData — the signed-in member's own billing rows for the settings
 * tabs, from GET /api/v1/billing (the same route and RLS read the billing
 * page uses; the browser never holds a service key or a card token).
 *
 * "error" is any failure — no network, a non-2xx answer, a body that does not
 * parse (parseBillingResponse). The caller shows nothing, or its own error
 * state, for it: never a 0 balance or an empty list it did not read.
 * reload() reads again (after a card is deleted) and keeps the rows on screen
 * until the new answer arrives.
 */
export type BillingState = { status: "loading" } | { status: "error" } | { status: "ready"; data: BillingData };

export function useBillingData(): { state: BillingState; reload: () => void } {
  const [state, setState] = useState<BillingState>({ status: "loading" });
  const [round, setRound] = useState(0);
  const reload = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: BillingState = { status: "error" };
      try {
        const res = await fetch("/api/v1/billing", { cache: "no-store" });
        const data = res.ok ? parseBillingResponse(await res.json()) : null;
        if (data) next = { status: "ready", data };
      } catch {
        next = { status: "error" };
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [round]);

  return { state, reload };
}
