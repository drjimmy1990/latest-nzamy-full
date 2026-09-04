/**
 * workSessionInput.ts — the ONE validator for `public.work_sessions` writes.
 * ─────────────────────────────────────────────────────────
 * Pure — no I/O, no Supabase import — so it can be unit-tested without a
 * database and reused by both `/api/v1/lawyer/work-sessions` (POST) and,
 * later, anything else that writes a pomodoro row. Mirrors every CHECK
 * constraint on the table (20260906_phase6_settings_out_of_browser.sql):
 * `mode`, `duration_min between 1 and 600`, and
 * `ended_at is null or ended_at >= started_at`. `task_id` has NO foreign key
 * on that table on purpose (a deleted task keeps its log) — this validator
 * only checks the uuid SHAPE, never whether the task exists.
 */

export const WORK_SESSION_MODES = ["focus", "short_break", "long_break"] as const;
export type WorkSessionMode = (typeof WORK_SESSION_MODES)[number];

export function isWorkSessionMode(v: unknown): v is WorkSessionMode {
  return typeof v === "string" && (WORK_SESSION_MODES as readonly string[]).includes(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_MAX = 120;
const DURATION_MIN = 1;
const DURATION_MAX = 600;

/** Same shape as JSON.parse output — every field unknown until checked. */
export interface WorkSessionInputBody {
  mode?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  durationMin?: unknown;
  completed?: unknown;
  taskId?: unknown;
  label?: unknown;
}

export interface ValidatedWorkSessionInput {
  mode: WorkSessionMode;
  startedAt: string;
  endedAt: string | null;
  durationMin: number;
  completed: boolean;
  taskId: string | null;
  label: string;
}

export type WorkSessionValidation = { ok: true; value: ValidatedWorkSessionInput } | { ok: false; error: string };

function isIsoDateTime(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !Number.isNaN(Date.parse(v));
}

/**
 * Validates one POST body against `WorkSessionInput`
 * (src/lib/services/workSessionsService.ts). Returns the Arabic message a
 * route hands back verbatim on `{ ok: false }`, or the normalized row-ready
 * value on `{ ok: true }`. `startedAt`/`endedAt` are passed through as given
 * (not re-serialized) — Postgres parses any valid ISO 8601 instant into
 * `timestamptz` the same way `consultations/[id]/route.ts` already trusts it
 * to for `scheduled_at`.
 */
export function validateWorkSessionInput(body: WorkSessionInputBody): WorkSessionValidation {
  const { mode, startedAt, endedAt, durationMin, completed, taskId, label } = body;

  if (!isWorkSessionMode(mode)) {
    return { ok: false, error: `mode يجب أن يكون أحد: ${WORK_SESSION_MODES.join(", ")}` };
  }

  if (!isIsoDateTime(startedAt)) {
    return { ok: false, error: "وقت بدء الجلسة مطلوب بصيغة تاريخ ووقت صحيحة." };
  }

  let endedAtValue: string | null = null;
  if (endedAt !== undefined && endedAt !== null) {
    if (!isIsoDateTime(endedAt)) {
      return { ok: false, error: "وقت انتهاء الجلسة غير صالح." };
    }
    if (Date.parse(endedAt as string) < Date.parse(startedAt as string)) {
      return { ok: false, error: "وقت الانتهاء لا يسبق وقت البدء." };
    }
    endedAtValue = endedAt as string;
  }

  if (typeof durationMin !== "number" || !Number.isInteger(durationMin) || durationMin < DURATION_MIN || durationMin > DURATION_MAX) {
    return { ok: false, error: `مدة الجلسة يجب أن تكون عدداً صحيحاً بين ${DURATION_MIN} و${DURATION_MAX} دقيقة.` };
  }

  let completedValue = true;
  if (completed !== undefined) {
    if (typeof completed !== "boolean") {
      return { ok: false, error: "completed يجب أن يكون true أو false." };
    }
    completedValue = completed;
  }

  let taskIdValue: string | null = null;
  if (taskId !== undefined && taskId !== null) {
    if (typeof taskId !== "string" || !UUID_RE.test(taskId)) {
      return { ok: false, error: "معرّف المهمة غير صالح." };
    }
    taskIdValue = taskId;
  }

  let labelValue = "";
  if (label !== undefined && label !== null) {
    if (typeof label !== "string") {
      return { ok: false, error: "تسمية الجلسة يجب أن تكون نصاً." };
    }
    const trimmed = label.trim();
    if (trimmed.length > LABEL_MAX) {
      return { ok: false, error: `تسمية الجلسة يجب ألا تتجاوز ${LABEL_MAX} حرفاً.` };
    }
    labelValue = trimmed;
  }

  return {
    ok: true,
    value: {
      mode,
      startedAt: startedAt as string,
      endedAt: endedAtValue,
      durationMin,
      completed: completedValue,
      taskId: taskIdValue,
      label: labelValue,
    },
  };
}
