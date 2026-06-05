/**
 * lawyerTasksService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer tasks service.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawyerTask {
  id: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  eventsCount: number;
  lastEvent: unknown | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLawyerTasks(): Promise<LawyerTask[]> {
  if (!isSupabaseMode) {
    return [];
  }

  try {
    return await apiGet<LawyerTask[]>("/api/v1/lawyer/tasks");
  } catch {
    return [];
  }
}

export async function updateLawyerTaskStatus(taskId: string, status: string): Promise<boolean> {
  if (!isSupabaseMode) return false;

  try {
    await apiMutate("/api/v1/lawyer/tasks", "PATCH", { taskId, status });
    return true;
  } catch {
    return false;
  }
}
