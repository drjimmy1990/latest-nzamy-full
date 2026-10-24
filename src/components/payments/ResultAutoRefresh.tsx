"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AUTO_REFRESH_INTERVAL_MS, autoRefreshDecision } from "@/lib/payments/autoRefresh";

/**
 * ResultAutoRefresh — /payments/result confirms on its own while the outcome
 * is pending. 3 s after the last render it asks the server to render the page
 * again (router.refresh in a transition), for about a minute
 * (autoRefreshDecision). The next refresh is scheduled only once the previous
 * one has finished (the transition is no longer pending), so a slow server
 * render never piles refreshes on top of each other.
 *
 * The page renders this only for a view that offers the refresh link, at a
 * fixed place in the card and with no key. So across refreshes that stay
 * pending it keeps its state (the window started at the first render), and a
 * final render (granted, failed, already done…) unmounts it, which cancels
 * the next refresh. After the window it stops and hides its line; the manual
 * «تحديث الصفحة» link stays.
 */
export default function ResultAutoRefresh({ refresh }: { refresh: boolean }) {
  const router = useRouter();
  const startedAt = useRef<number | null>(null);
  const [polling, setPolling] = useState(refresh);
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!refresh || !polling || refreshing) return;
    if (startedAt.current === null) startedAt.current = Date.now();
    const timer = setTimeout(() => {
      const decision = autoRefreshDecision({ view: { refresh }, startedAt: startedAt.current ?? Number.NaN, now: Date.now() });
      if (decision === "poll") {
        startRefresh(() => router.refresh());
      } else {
        setPolling(false);
      }
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [refresh, polling, refreshing, router]);

  if (!refresh || !polling) return null;
  return (
    <p className="mt-3 text-sm opacity-80" role="status">
      جارٍ التحقق تلقائياً…
    </p>
  );
}
