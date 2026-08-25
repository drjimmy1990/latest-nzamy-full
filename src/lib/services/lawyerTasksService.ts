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

/** One checklist step, stored in the task row's metadata.subtasks array. */
export interface LawyerSubtask {
  id: string;
  title: string;
  done: boolean;
}

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
  /** Checklist — from metadata.subtasks. GET always returns an array. */
  subtasks?: LawyerSubtask[];
}

export interface CreateLawyerTaskInput {
  title: string;
  category?: string;
  priority?: string;
  dueDate?: string;
  caseId?: string;
  caseRef?: string;
  notes?: string;
  subtasks?: LawyerSubtask[];
}

/**
 * A partial task edit. Every field is optional and only the ones actually
 * present are sent — presence is tested with `!== undefined`, so `notes: ""`
 * (cleared the note) and `subtasks: []` (deleted the last step) reach the
 * server instead of being swallowed as falsy.
 */
export interface UpdateLawyerTaskInput {
  title?: string;
  priority?: string;
  category?: string;
  /** null clears the due date. */
  dueDate?: string | null;
  notes?: string;
  subtasks?: LawyerSubtask[];
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

export interface UpdateLawyerTaskResult {
  /** false = nothing was written; the caller must roll its optimistic edit back. */
  ok: boolean;
  /**
   * Everything except the title was written: the row is a client's own request,
   * whose title the client sees in their dashboard, so the server refuses to
   * rename it. Revert only the title and tell the lawyer why.
   */
  titleSkipped?: boolean;
}

/**
 * Persist a partial task edit (title / priority / category / dueDate / notes /
 * subtasks). Never throws, like updateLawyerTaskStatus — the callers are
 * optimistic UI handlers that roll back and show an Arabic message.
 *
 * The server merges the metadata keys it is given over the ones already stored;
 * it never replaces the blob, so omitting a field here leaves it untouched
 * rather than deleting it.
 */
export async function updateLawyerTask(
  taskId: string,
  patch: UpdateLawyerTaskInput,
): Promise<UpdateLawyerTaskResult> {
  if (!taskId) return { ok: false };

  const body: Record<string, unknown> = { taskId };
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.category !== undefined) body.category = patch.category;
  if (patch.dueDate !== undefined) body.dueDate = patch.dueDate;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.subtasks !== undefined) body.subtasks = patch.subtasks;

  // Nothing to send — treat as a no-op success rather than a phantom failure.
  if (Object.keys(body).length === 1) return { ok: true };

  if (!isSupabaseMode) return { ok: false };

  try {
    const res = await apiMutate<{ success?: boolean; titleSkipped?: boolean }>(
      "/api/v1/lawyer/tasks",
      "PATCH",
      body,
    );
    return res?.titleSkipped ? { ok: true, titleSkipped: true } : { ok: true };
  } catch (e) {
    console.error("[lawyerTasksService] updateLawyerTask failed:", e);
    return { ok: false };
  }
}

/**
 * Persist the whole checklist. The array is replaced wholesale (that is how it
 * is stored), so ticking one step is last-write-wins against another edit of a
 * different step on the same task.
 */
export async function updateLawyerTaskSubtasks(
  taskId: string,
  subtasks: LawyerSubtask[],
): Promise<boolean> {
  const res = await updateLawyerTask(taskId, { subtasks });
  return res.ok;
}
