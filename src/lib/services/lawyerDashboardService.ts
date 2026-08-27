/**
 * lawyerDashboardService.ts
 * ─────────────────────────────────────────────────────────
 * Client wrapper for GET /api/v1/lawyer/dashboard/summary.
 *
 * Audit 2026-08-27 — this file used to end with:
 *
 *     try { return await apiGet(...) } catch { return { ...DEMO_SUMMARY } }
 *
 * where DEMO_SUMMARY was every count at 0 and every list empty. `apiGet` throws
 * on any non-2xx (src/lib/services/api.ts), so an expired session, a 403, a
 * dropped connection and a 500 all arrived at the dashboard as a complete,
 * confident, empty practice. Six practising lawyers read that screen for their
 * hearings. A failure must never be able to render as «لا توجد جلسات قادمة».
 *
 * So the result is a discriminated union now: the caller cannot read a number
 * off it without first deciding what to do about failure. Inside the summary,
 * an individual field is `null` when the server could read the others but not
 * that one — again never 0, because 0 is a legitimate answer this platform
 * gives all the time and would be indistinguishable.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawyerDashboardCase {
  id: string;
  title: string;
  status: string;
  updated_at: string | null;
  type: string | null;
}

export interface LawyerDashboardHearing {
  id: string;
  /** `YYYY-MM-DD` wall-clock date, as the lawyer typed it. */
  date: string;
  title: string;
  time: string | null;
  /** Raw metadata token: hearing / deadline / gov_review / client_meet / internal. */
  type: string | null;
  urgency: string | null;
  location: string | null;
  caseName: string | null;
}

export interface LawyerDashboardTask {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string | null;
  category: string | null;
}

export interface LawyerDashboardActivity {
  id: string | number;
  event: string;
  created_at: string;
  request_id?: string;
}

/**
 * Every field is nullable on purpose: `null` means "the server could not read
 * this", which the dashboard must render as «تعذّر القراءة» and never as ٠.
 */
export interface LawyerDashboardSummary {
  activeCases: number | null;
  pendingConsultations: number | null;
  revenueThisMonth: number | null;
  recentCases: LawyerDashboardCase[] | null;
  upcomingHearings: LawyerDashboardHearing[] | null;
  /** Total upcoming hearings — NOT `upcomingHearings.length`, which is capped. */
  upcomingHearingsCount: number | null;
  criticalDeadlines: LawyerDashboardHearing[] | null;
  /** Total critical dates — the card shows at most four, so it needs this. */
  criticalDeadlinesCount: number | null;
  urgentTasks: LawyerDashboardTask[] | null;
  recentActivity: LawyerDashboardActivity[] | null;
  /** Section keys the server failed to read; empty when everything loaded. */
  degraded: string[];
}

export type LawyerDashboardResult =
  | { ok: true; summary: LawyerDashboardSummary }
  | { ok: false; reason: string };

// ─── Service function ─────────────────────────────────────────────────────────

export async function getLawyerDashboardSummary(): Promise<LawyerDashboardResult> {
  if (!isSupabaseMode) {
    // `isSupabaseMode` is a module-level constant (api.ts), so this branch is
    // dead-code-eliminated from the production build — it exists only for local
    // demo runs. It reports failure rather than zeros for the same reason as
    // above: there is no backend to have answered, so there is nothing true to
    // say about this lawyer's caseload.
    return { ok: false, reason: "الوضع التجريبي: لا يوجد اتصال بالخادم لعرض بيانات لوحة التحكم." };
  }

  try {
    const summary = await apiGet<LawyerDashboardSummary>("/api/v1/lawyer/dashboard/summary");
    return { ok: true, summary };
  } catch (err) {
    console.error("[lawyerDashboardService] summary fetch failed:", err);
    return {
      ok: false,
      reason:
        err instanceof Error && err.message
          ? err.message
          : "تعذّر الاتصال بالخادم.",
    };
  }
}
