/**
 * lawyerTasksService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/lawyer/tasks (Phase 1, public.tasks + task_steps).
 *
 * `status` is the UI vocabulary directly now (todo/in_progress/done/
 * archived) — `public.tasks.status` stores exactly that, so the
 * DB_TO_TASK_STATUS / taskStatusToDbStatus translation this module used to
 * export is gone. There is nothing left to translate.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

// ─── Types ────────────────────────────────────────────────────────────────────

/** One checklist step, stored as its own row in task_steps. */
export interface LawyerSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface LawyerTask {
  id: string;
  title: string;
  /** todo / in_progress / done / archived */
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  /** UI category (case/document/admin/deadline/client) */
  category?: string;
  dueDate?: string | null;
  /** tasks.case_request_id — the case this task hangs off, if any. */
  caseId?: string;
  /** Free-text case label (tasks.metadata.caseRef) for when no real case is linked. */
  caseRef?: string;
  notes?: string;
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

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * The lawyer's task list.
 *
 * Returns `ListRead<LawyerTask>` so a failed read is unmissable — the tasks
 * page (src/app/dashboard/lawyer/tasks/page.tsx) calls `apiGet` directly
 * instead of this wrapper for that same reason, kept even now that the route
 * no longer swallows failures: two independent code paths reaching a 500 the
 * same way is a cheap redundancy, not a risk.
 */
export async function getLawyerTasks(
  opts?: { caseId?: string; limit?: number },
): Promise<ListRead<LawyerTask>> {
  // Demo mode: no task store exists behind this endpoint. Hardcoded, not read.
  if (!isSupabaseMode) {
    return listOk([]);
  }

  try {
    const body = await apiGet<{ data: LawyerTask[]; total?: number }>("/api/v1/lawyer/tasks", {
      caseId: opts?.caseId,
      limit: opts?.limit,
    });
    return listFromApi(body);
  } catch (error) {
    console.error("[lawyerTasksService] getLawyerTasks failed:", error);
    return listFailed<LawyerTask>();
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
}

/**
 * Persist a partial task edit (title / priority / category / dueDate / notes /
 * subtasks). Never throws, like updateLawyerTaskStatus — the callers are
 * optimistic UI handlers that roll back and show an Arabic message.
 *
 * Every field is its own column server-side, so — unlike the old jsonb
 * version — there is no merge to reason about here either: omitting a field
 * leaves that column untouched because the route only updates what the body
 * names.
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
    await apiMutate<{ success?: boolean }>("/api/v1/lawyer/tasks", "PATCH", body);
    return { ok: true };
  } catch (e) {
    console.error("[lawyerTasksService] updateLawyerTask failed:", e);
    return { ok: false };
  }
}

/**
 * Persist the whole checklist. The array is replaced wholesale (that is how
 * the route treats it — upsert-by-id then prune whatever is not in the list),
 * so ticking one step is last-write-wins against another edit of a different
 * step on the same task.
 */
export async function updateLawyerTaskSubtasks(
  taskId: string,
  subtasks: LawyerSubtask[],
): Promise<boolean> {
  const res = await updateLawyerTask(taskId, { subtasks });
  return res.ok;
}
