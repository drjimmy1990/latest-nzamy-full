/**
 * dashboardService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode dashboard summary service.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionSummary {
  plan: string;
  name: string;
  limits: {
    aiQueries: number;
    contractDrafts: number;
    consultations: number;
  };
  used: {
    aiQueries: number;
    contractDrafts: number;
    consultations: number;
  };
}

export interface DashboardSummary {
  activeCases: unknown[];
  nextAppointment: unknown | null;
  recentMessages: unknown[];
  subscription: SubscriptionSummary | null;
  communityPreview: unknown[];
  walletBalance: number;
  unreadNotifications: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEMO_SUMMARY: DashboardSummary = {
  activeCases: [],
  nextAppointment: null,
  recentMessages: [],
  subscription: {
    plan: "free",
    name: "مجانية",
    limits: { aiQueries: 1, contractDrafts: 0, consultations: 0 },
    used: { aiQueries: 0, contractDrafts: 0, consultations: 0 },
  },
  communityPreview: [],
  walletBalance: 0,
  unreadNotifications: 0,
};

// ─── Service function ─────────────────────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (!isSupabaseMode) {
    return { ...DEMO_SUMMARY };
  }

  try {
    return await apiGet<DashboardSummary>("/api/v1/dashboard/summary");
  } catch {
    return { ...DEMO_SUMMARY };
  }
}
