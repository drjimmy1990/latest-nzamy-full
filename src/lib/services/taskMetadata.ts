/**
 * taskMetadata.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A lawyer task is a `service_requests` row: there is no tasks table, so every
 * task-only field (task, priority, category, dueDate, caseId, caseRef, notes,
 * subtasks) lives in the row's single `metadata` jsonb column.
 *
 * That makes every partial update of a task a read-modify-write on one blob.
 * `.update({ metadata: { subtasks } })` REPLACES the column — the task silently
 * loses its case link and its due date and nothing errors. So the write path
 * must go through `mergeTaskMetadata`, and the patch it merges must be built by
 * `buildTaskMetadataPatch`, which is a fixed whitelist rather than a spread of
 * the request body: a caller must not be able to reach `metadata.internalNotes`
 * (an admin-private note — see internalNotes.ts), flip `metadata.task`, or
 * clobber `caseId` / `caseRef` through the task edit endpoint.
 *
 * Deliberately import-free and framework-free so the API route (server) and the
 * unit test (`node --test`) can both load it — lawyerTasksService.ts is
 * "use client" and cannot be imported from a route handler.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskSubtask {
  id: string;
  title: string;
  done: boolean;
}

export type TaskValidation<T> = { ok: true; value: T } | { ok: false; error: string };

// ─── Limits ───────────────────────────────────────────────────────────────────
// jsonb has no length limit of its own, so the caps live here: without them a
// client can write an unbounded blob into the column.

export const MAX_SUBTASKS = 50;
export const MAX_SUBTASK_ID = 100;
export const MAX_SUBTASK_TITLE = 300;
export const MAX_TASK_TITLE = 300;
export const MAX_TASK_NOTES = 4000;

const PRIORITIES = ["urgent", "high", "normal", "low"];
const CATEGORIES = ["case", "document", "admin", "deadline", "client"];

/** The only metadata keys a task update may touch. */
const PATCHABLE_KEYS = ["subtasks", "priority", "category", "dueDate", "notes"];

// ─── Subtasks ─────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict validation for the WRITE direction. Anything that is not an array of
 * `{ id: string, title: string, done: boolean }` is rejected so the caller can
 * answer 400 instead of storing junk in jsonb that every later read has to
 * defend against.
 */
export function validateSubtasks(input: unknown): TaskValidation<TaskSubtask[]> {
  if (!Array.isArray(input)) {
    return { ok: false, error: "subtasks must be an array" };
  }
  if (input.length > MAX_SUBTASKS) {
    return { ok: false, error: `subtasks may not exceed ${MAX_SUBTASKS} items` };
  }

  const seen = new Set<string>();
  const value: TaskSubtask[] = [];

  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (!isPlainObject(raw)) {
      return { ok: false, error: `subtasks[${i}] must be an object` };
    }
    if (typeof raw.id !== "string" || raw.id.trim() === "") {
      return { ok: false, error: `subtasks[${i}].id must be a non-empty string` };
    }
    if (typeof raw.title !== "string" || raw.title.trim() === "") {
      return { ok: false, error: `subtasks[${i}].title must be a non-empty string` };
    }
    if (typeof raw.done !== "boolean") {
      return { ok: false, error: `subtasks[${i}].done must be a boolean` };
    }
    const id = raw.id.trim();
    const title = raw.title.trim();
    if (id.length > MAX_SUBTASK_ID) {
      return { ok: false, error: `subtasks[${i}].id may not exceed ${MAX_SUBTASK_ID} characters` };
    }
    if (title.length > MAX_SUBTASK_TITLE) {
      return { ok: false, error: `subtasks[${i}].title may not exceed ${MAX_SUBTASK_TITLE} characters` };
    }
    // Duplicate ids would make a toggle ambiguous — the UI matches by id, so two
    // rows sharing one id flip together.
    if (seen.has(id)) {
      return { ok: false, error: `subtasks[${i}].id is duplicated` };
    }
    seen.add(id);
    // Rebuild rather than spread: unknown keys never reach the column.
    value.push({ id, title, done: raw.done });
  }

  return { ok: true, value };
}

/**
 * Lenient counterpart for the READ direction. A row may predate this validator
 * (or have been written by hand), and a malformed entry must not blank out the
 * whole task list — so bad entries are dropped, not thrown on.
 */
export function readSubtasks(input: unknown): TaskSubtask[] {
  if (!Array.isArray(input)) return [];
  const out: TaskSubtask[] = [];
  for (const raw of input) {
    if (!isPlainObject(raw)) continue;
    if (typeof raw.id !== "string" || raw.id.trim() === "") continue;
    if (typeof raw.title !== "string") continue;
    out.push({ id: raw.id, title: raw.title, done: raw.done === true });
    if (out.length >= MAX_SUBTASKS) break;
  }
  return out;
}

// ─── Patch building ───────────────────────────────────────────────────────────

/**
 * Picks the patchable metadata keys out of a request body and validates each.
 * Presence is tested with `!== undefined`, never truthiness: `subtasks: []`
 * (the lawyer deleted the last step) and `notes: ""` (cleared the note) are
 * legitimate updates, and dropping them is the same "it reverted on reload"
 * bug this module exists to fix.
 *
 * `null` means "remove this key" for the optional keys that can be absent
 * (dueDate, category). An empty object result means the body carried no
 * metadata edit at all.
 */
export function buildTaskMetadataPatch(
  body: Record<string, unknown>,
): TaskValidation<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};

  for (const key of PATCHABLE_KEYS) {
    const raw = body[key];
    if (raw === undefined) continue;

    if (key === "subtasks") {
      const parsed = validateSubtasks(raw);
      if (!parsed.ok) return parsed;
      patch.subtasks = parsed.value;
      continue;
    }

    if (key === "priority") {
      if (typeof raw !== "string" || !PRIORITIES.includes(raw)) {
        return { ok: false, error: `priority must be one of: ${PRIORITIES.join(", ")}` };
      }
      patch.priority = raw;
      continue;
    }

    if (key === "category") {
      if (raw === null) { patch.category = null; continue; }
      if (typeof raw !== "string" || !CATEGORIES.includes(raw)) {
        return { ok: false, error: `category must be one of: ${CATEGORIES.join(", ")}` };
      }
      patch.category = raw;
      continue;
    }

    if (key === "dueDate") {
      if (raw === null || raw === "") { patch.dueDate = null; continue; }
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return { ok: false, error: "dueDate must be an ISO date (YYYY-MM-DD) or null" };
      }
      patch.dueDate = raw;
      continue;
    }

    // notes
    if (typeof raw !== "string") {
      return { ok: false, error: "notes must be a string" };
    }
    if (raw.length > MAX_TASK_NOTES) {
      return { ok: false, error: `notes may not exceed ${MAX_TASK_NOTES} characters` };
    }
    patch.notes = raw;
  }

  return { ok: true, value: patch };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Shallow-merges a validated patch over the metadata read back from the row.
 * `undefined` in the patch leaves the existing key alone; `null` removes it.
 * Never mutates `existing`.
 *
 * Shallow is correct here: every task key is a leaf (or, for subtasks, an array
 * the client owns whole). It is also last-write-wins — two concurrent updates to
 * two DIFFERENT metadata keys can lose one another, because each read its own
 * snapshot of the blob. At one lawyer per task that is acceptable; it is the
 * price of not adding a migration for a jsonb-concatenating RPC.
 */
export function mergeTaskMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(existing) ? { ...existing } : {};

  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) {
      delete base[key];
      continue;
    }
    base[key] = value;
  }

  return base;
}

/** Validates a task title for the `service_requests.title` column (not metadata). */
export function validateTaskTitle(input: unknown): TaskValidation<string> {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "title must be a non-empty string" };
  }
  const title = input.trim();
  if (title.length > MAX_TASK_TITLE) {
    return { ok: false, error: `title may not exceed ${MAX_TASK_TITLE} characters` };
  }
  return { ok: true, value: title };
}
