/**
 * lawyerActivityService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer activity feed service.
 */

"use client";

import { apiGet, isSupabaseMode } from "@/lib/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawyerActivity {
  id: string;
  type: "event" | "audit";
  action: string;
  payload: unknown;
  entityId: string;
  createdAt: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLawyerActivity(): Promise<LawyerActivity[]> {
  if (!isSupabaseMode) {
    return [];
  }

  try {
    return await apiGet<LawyerActivity[]>("/api/v1/lawyer/activity");
  } catch {
    return [];
  }
}
