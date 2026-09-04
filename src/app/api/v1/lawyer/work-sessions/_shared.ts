/**
 * _shared.ts — the ONE row → DTO mapping for the work-sessions routes.
 * ─────────────────────────────────────────────────────────
 * Backed by `public.work_sessions` (20260906_phase6_settings_out_of_browser.sql).
 * RLS is `for all using (user_id = auth.uid())` — a single owner-only
 * policy, no wider grant — so every route here still adds an explicit
 * `.eq("user_id", user.id)` on top of it as defense-in-depth, the same
 * convention `lawyer/services/[id]/route.ts` documents for itself.
 */

import type { WorkSession } from "@/lib/services/workSessionsService";
import type { WorkSessionMode } from "@/lib/services/workSessionInput";

export const WORK_SESSION_SELECT = "id, mode, started_at, ended_at, duration_min, completed, task_id, label, created_at";

export interface WorkSessionRow {
  id: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  duration_min: number;
  completed: boolean;
  task_id: string | null;
  label: string;
  created_at: string;
}

/** Annotated against `WorkSession` so a field the client contract expects — and this route omits or misnames — fails `tsc`, not a screen. */
export function toWorkSessionDto(row: WorkSessionRow): WorkSession {
  return {
    id: row.id,
    mode: row.mode as WorkSessionMode,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMin: row.duration_min,
    completed: row.completed,
    taskId: row.task_id,
    label: row.label,
    createdAt: row.created_at,
  };
}

/** Riyadh (UTC+3, no DST) midnight of `date` (YYYY-MM-DD), as a UTC ISO instant. */
export function riyadhDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00+03:00`).toISOString();
}

/** Riyadh 23:59:59.999 of `date` (YYYY-MM-DD) — the inclusive end-of-day bound. */
export function riyadhDayEndIso(date: string): string {
  return new Date(`${date}T23:59:59.999+03:00`).toISOString();
}

/**
 * Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514
 * CHECK · 23503 FK · 42501 RLS · 22007/22008 — `startedAt`/`endedAt` parsed
 * loosely by `Date.parse` (matching `consultations/[id]/route.ts`'s own
 * `scheduledAt` check) can still reach Postgres as something `timestamptz`
 * itself rejects; that must answer 400, not the generic 500 below.
 */
export function dbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "هذه الجلسة مسجَّلة مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات الجلسة غير صالحة." };
  if (code === "23503") return { status: 400, message: "الجلسة تشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  if (code === "22007" || code === "22008") return { status: 400, message: "صيغة التاريخ/الوقت غير صالحة." };
  return { status: 500, message: "تعذّر حفظ الجلسة." };
}
