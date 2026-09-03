/**
 * taskMetadata.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Field-level validation for a lawyer task and its checklist.
 *
 * Phase 1 (2026-09-03) moved tasks off `service_requests.metadata` onto real
 * columns in `public.tasks`, and subtasks off a jsonb array onto real rows in
 * `public.task_steps`. Before that, every field (priority / category / dueDate
 * / notes / subtasks) lived in one jsonb blob, and a partial update meant a
 * read-modify-write merge to avoid clobbering the other keys — that merge
 * machinery (`buildTaskMetadataPatch`, `mergeTaskMetadata`, the PATCHABLE_KEYS
 * whitelist) is gone, because `.update({ priority })` on a real column cannot
 * clobber `dueDate` sitting in a column of its own.
 *
 * What is still needed is exactly what a real column does not give you for
 * free: rejecting a priority the CHECK constraint would also reject, but with
 * a message the caller can show, before the round-trip. Deliberately
 * import-free and framework-free so the API route (server) and the unit test
 * (`node --test`) can both load it.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskSubtask {
  id: string;
  title: string;
  done: boolean;
}

export type TaskValidation<T> = { ok: true; value: T } | { ok: false; error: string };

// ─── Limits ───────────────────────────────────────────────────────────────────
// jsonb had no length limit of its own; the columns underneath these now do
// (text is unbounded in Postgres too), so the caps still earn their keep —
// without them a client can still send an unbounded checklist or title.

export const MAX_SUBTASKS = 50;
export const MAX_SUBTASK_ID = 100;
export const MAX_SUBTASK_TITLE = 300;
export const MAX_TASK_TITLE = 300;
export const MAX_TASK_NOTES = 4000;

/** `tasks.priority` CHECK constraint (migration 20260903), restated here so a bad value is a 400 with a message, not a raw Postgres error. */
export const PRIORITIES = ["urgent", "high", "normal", "low"];
/** UI category — not a DB constraint (the column is a free `text`), but a fixed vocabulary the Kanban filters on. */
export const CATEGORIES = ["case", "document", "admin", "deadline", "client"];

// ─── Subtasks ─────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict validation for the WRITE direction. Anything that is not an array of
 * `{ id: string, title: string, done: boolean }` is rejected so the caller can
 * answer 400 instead of the insert failing halfway through a delete-and-
 * reinsert of `task_steps`.
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
    // Rebuild rather than spread: unknown keys never reach the insert.
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

// ─── Single-field validators ───────────────────────────────────────────────────
// Each mirrors one column's own constraint, so a caller gets a message before
// the round-trip instead of a raw Postgres CHECK-violation error.

export function validatePriority(input: unknown): TaskValidation<string> {
  if (typeof input !== "string" || !PRIORITIES.includes(input)) {
    return { ok: false, error: `priority must be one of: ${PRIORITIES.join(", ")}` };
  }
  return { ok: true, value: input };
}

/** `null` clears the category (the column is nullable free text). */
export function validateCategory(input: unknown): TaskValidation<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string" || !CATEGORIES.includes(input)) {
    return { ok: false, error: `category must be one of: ${CATEGORIES.join(", ")}` };
  }
  return { ok: true, value: input };
}

/** `""` and `null` both mean "clear the due date". */
export function validateDueDate(input: unknown): TaskValidation<string | null> {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { ok: false, error: "dueDate must be an ISO date (YYYY-MM-DD) or null" };
  }
  return { ok: true, value: input };
}

export function validateNotes(input: unknown): TaskValidation<string> {
  if (typeof input !== "string") {
    return { ok: false, error: "notes must be a string" };
  }
  if (input.length > MAX_TASK_NOTES) {
    return { ok: false, error: `notes may not exceed ${MAX_TASK_NOTES} characters` };
  }
  return { ok: true, value: input };
}

/** Validates a task title for the `tasks.title` column. */
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
