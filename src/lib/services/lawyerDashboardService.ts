/**
 * lawyerDashboardService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer dashboard summary service.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawyerDashboardSummary {
  activeCases: number;
  pendingConsultations: number;
  revenueThisMonth: number;
  pendingTasks: number;
  recentCases: unknown[];
  upcomingDeadlines: unknown[];
  recentActivity: unknown[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEMO_SUMMARY: LawyerDashboardSummary = {
  activeCases: 0,
  pendingConsultations: 0,
  revenueThisMonth: 0,
  pendingTasks: 0,
  recentCases: [],
  upcomingDeadlines: [],
  recentActivity: [],
};

// ─── Service function ─────────────────────────────────────────────────────────

export async function getLawyerDashboardSummary(): Promise<LawyerDashboardSummary> {
  if (!isSupabaseMode) {
    return { ...DEMO_SUMMARY };
  }

  try {
    return await apiGet<LawyerDashboardSummary>("/api/v1/lawyer/dashboard/summary");
  } catch {
    return { ...DEMO_SUMMARY };
  }
}
