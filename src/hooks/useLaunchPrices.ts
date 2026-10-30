"use client";

import { useEffect, useState } from "react";
import type { LaunchPriceMap } from "@/lib/pricing/cardPrice";

/**
 * useLaunchPrices — the launch prices running today, as the SERVER decides it
 * (GET /api/v1/pricing/launch; owner ٣٠٣).
 *
 * Starts null and is filled in an effect, so a server render — which nginx
 * may cache — never carries a launch price (the SSR cached-date trap: no
 * date-dependent value in the first render). null, an error or a malformed
 * answer all mean «no launch price shown»: the card keeps the listed price,
 * which is what checkout charges once the campaign is over.
 */
export function useLaunchPrices(): LaunchPriceMap | null {
  const [prices, setPrices] = useState<LaunchPriceMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/pricing/launch", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const map = (body as { prices?: unknown } | null)?.prices;
        if (!cancelled && map && typeof map === "object" && !Array.isArray(map)) setPrices(map as LaunchPriceMap);
      })
      .catch(() => {
        // no launch price shown
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return prices;
}
