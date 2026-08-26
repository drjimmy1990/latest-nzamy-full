/**
 * _data.ts — Shared helpers and types for client dashboard pages.
 *
 * Mock data previously here has been moved to service layer
 * (dashboardService.ts, lawyerService.ts, documentService.ts).
 */

import type { CaseTone } from "@/lib/services/clientDashboardCards";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Typed `Record<CaseTone, …>` and NOT `Record<string, …>`, which is the whole
 * point of the change that introduced CaseTone.
 *
 * As a `Record<string, …>` this map answered every key with `undefined`, and
 * CaseCard read `.bg` off that answer. The client dashboard passed it
 * `statusColor` straight off a raw `service_requests` row — a column that does
 * not exist — so the landing page threw a TypeError for every client who had
 * ever placed an order. With the union as the key type, a tone the mapper can
 * emit but this map does not define is a build error instead.
 */
export const STATUS_COLOR: Record<CaseTone, { bg: string; text: string; border: string }> = {
  amber: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-700/40" },
  blue:  { bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-600 dark:text-blue-400",   border: "border-blue-200 dark:border-blue-700/40"   },
  green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700/40" },
  zinc:  { bg: "bg-zinc-100 dark:bg-white/[0.06]", text: "text-zinc-600 dark:text-zinc-300",   border: "border-zinc-200 dark:border-white/[0.1]"   },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.38, ease: "easeOut" as const },
  }),
};

// ─── Case Card Type (Client View) ─────────────────────────────────────────────

/**
 * Re-exported, not declared here. The shape now belongs to the mapper that
 * produces it (src/lib/services/clientDashboardCards.ts) so that the only way
 * to obtain a ClientCase is to go through `toClientCase`, rather than by
 * casting a database row at it.
 *
 * The fields this interface used to carry and no longer does — `lawyer`,
 * `lawyerType`, `progress`, `urgent`, `nextAction` — were removed because a
 * `service_requests` row has no source for any of them. See the mapper's
 * header.
 */
export type { ClientCase, CaseTone } from "@/lib/services/clientDashboardCards";
