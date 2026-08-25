/**
 * lawyerTasksService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode lawyer tasks service.
 *
 * There is no `tasks` table: a task is a `service_requests` row assigned to
 * the lawyer, with its task-only fields (priority / dueDate / caseId) living
 * in `metadata`. /api/v1/lawyer/tasks owns that mapping — this module is only
 * the typed client for it.
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
  /** UI category (case/document/admin/deadline/client) — from metadata.category */
  category?: string;
  dueDate?: string | null;
  /** service_requests.id of the case this task hangs off — from metadata.caseId */
  caseId?: string;
  caseRef?: string;
  notes?: string;
}

export interface CreateLawyerTaskInput {
  title: string;
  category?: string;
  priority?: string;
  dueDate?: string;
  caseId?: string;
  caseRef?: string;
  notes?: string;
}

// ─── Status mapping: UI TaskStatus → DB service_requests.status enum ─────────
// The route maps the read direction (DB → UI); this is the write direction and
// must stay its exact inverse. PATCH rejects anything outside the DB enum.
const UI_TO_DB_STATUS: Record<string, string> = {
  todo: "pending_assignment",
  in_progress: "assigned",
  done: "completed",
  archived: "cancelled",
};

/** UI task status → the DB enum value PATCH expects. Unknown → pending_assignment. */
export function taskStatusToDbStatus(status: string): string {
  return UI_TO_DB_STATUS[status] ?? "pending_assignment";
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getLawyerTasks(opts?: { caseId?: string }): Promise<LawyerTask[]> {
  if (!isSupabaseMode) {
    return [];
  }

  try {
    return await apiGet<LawyerTask[]>("/api/v1/lawyer/tasks", {
      caseId: opts?.caseId,
    });
  } catch {
    return [];
  }
}

/**
 * Create a task. Unlike the getters, this THROWS on failure — a save button
 * has to be able to tell the lawyer it failed, and a swallowed error there is
 * exactly the "success screen over a task that does not exist" bug.
 */
export async function createLawyerTask(input: CreateLawyerTaskInput): Promise<LawyerTask> {
  const title = input.title.trim();
  if (!title) throw new Error("عنوان المهمة مطلوب");

  if (!isSupabaseMode) {
    // Demo mode has no store behind this endpoint. Say so rather than
    // returning a fake row the caller would render as saved.
    throw new Error("حفظ المهام غير متاح في وضع العرض التجريبي");
  }

  const res = await apiMutate<{ data: LawyerTask }>("/api/v1/lawyer/tasks", "POST", {
    ...input,
    title,
  });
  if (!res?.data) throw new Error("لم يصل تأكيد الحفظ من الخادم");
  return res.data;
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
