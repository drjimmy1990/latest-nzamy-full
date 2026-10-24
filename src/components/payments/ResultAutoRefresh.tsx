"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTO_REFRESH_INTERVAL_MS, autoRefreshDecision } from "@/lib/payments/resultView";

/**
 * ResultAutoRefresh — /payments/result confirms on its own while the outcome
 * is pending. Every 3 s it asks the server to render the page again
 * (router.refresh), for about a minute (autoRefreshDecision).
 *
 * The page renders this only for a view that offers the refresh link, at a
 * fixed place in the card and with no key. So across refreshes that stay
 * pending it keeps its state (the window started at the first render), and a
 * final render (granted, failed, already done…) unmounts it, which stops the
 * polling. After the window it stops and hides its line; the manual
 * «تحديث الصفحة» link stays.
 */
export default function ResultAutoRefresh({ refresh }: { refresh: boolean }) {
  const router = useRouter();
  const startedAt = useRef<number | null>(null);
  const [polling, setPolling] = useState(refresh);

  useEffect(() => {
    if (!refresh) return;
    if (startedAt.current === null) startedAt.current = Date.now();
    const timer = setInterval(() => {
      const decision = autoRefreshDecision({ view: { refresh }, startedAt: startedAt.current ?? Number.NaN, now: Date.now() });
      if (decision === "poll") {
        router.refresh();
      } else {
        clearInterval(timer);
        setPolling(false);
      }
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, router]);

  if (!refresh || !polling) return null;
  return (
    <p className="mt-3 text-sm opacity-80" role="status">
      جارٍ التحقق تلقائياً…
    </p>
  );
}
