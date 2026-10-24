/**
 * The result page's self-refresh rule. Kept in its own import-free module: the
 * client component ResultAutoRefresh imports it, and resultView.ts pulls in
 * fulfillDecision.ts (node:crypto), which must never reach the browser bundle.
 */

/** How often the pending result page re-renders itself, and for how long. */
export const AUTO_REFRESH_INTERVAL_MS = 3_000;
export const AUTO_REFRESH_WINDOW_MS = 60_000;

/**
 * Whether the result page should re-render itself (router.refresh) once more.
 * Only a view that offers the refresh link polls — pending, claimed elsewhere,
 * temporarily unavailable; every final state (granted, already done, failed,
 * rejected, closed) has refresh: false and never polls. A window of about a
 * minute from the first pending render; after it the manual link stays.
 */
export function autoRefreshDecision(input: {
  view: { refresh: boolean };
  startedAt: number;
  now: number;
}): "poll" | "stop" {
  if (!input.view.refresh) return "stop";
  if (!Number.isFinite(input.startedAt) || !Number.isFinite(input.now)) return "stop";
  const elapsed = input.now - input.startedAt;
  return elapsed >= 0 && elapsed < AUTO_REFRESH_WINDOW_MS ? "poll" : "stop";
}
