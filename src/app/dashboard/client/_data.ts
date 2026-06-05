/**
 * _data.ts — Shared helpers and types for client dashboard pages.
 *
 * Mock data previously here has been moved to service layer
 * (dashboardService.ts, lawyerService.ts, documentService.ts).
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  amber: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-700/40" },
  blue:  { bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-600 dark:text-blue-400",   border: "border-blue-200 dark:border-blue-700/40"   },
  green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700/40" },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.38, ease: "easeOut" as const },
  }),
};

// ─── Case Card Type (Client View) ─────────────────────────────────────────────

export interface ClientCase {
  id: string;
  title: string;
  lawyer: string;
  lawyerType: string;
  status: "filed" | "pending" | "session" | "judgment" | "closed";
  statusLabel: string;
  statusColor: string;
  nextAction: string;
  urgent: boolean;
  caseNo: string;
  progress: number;
}
