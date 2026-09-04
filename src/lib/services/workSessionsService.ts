/**
 * workSessionsService.ts — the pomodoro / focus log, out of the browser
 * (Phase 6, item 97).
 * ─────────────────────────────────────────────────────────
 *   GET    /api/v1/lawyer/work-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD&limit
 *   POST   /api/v1/lawyer/work-sessions
 *   DELETE /api/v1/lawyer/work-sessions/[id]
 * The stats the widget draws (week/hour/insights) stay client-side helpers
 * fed by these rows — they are arithmetic, not data.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

export type WorkSessionMode = "focus" | "short_break" | "long_break";

/** Mirrors public.work_sessions. */
export interface WorkSession {
  id: string;
  mode: WorkSessionMode;
  startedAt: string;
  endedAt: string | null;
  durationMin: number;
  completed: boolean;
  taskId: string | null;
  label: string;
  createdAt: string;
}

export interface WorkSessionInput {
  mode: WorkSessionMode;
  startedAt: string;
  endedAt?: string | null;
  durationMin: number;
  completed?: boolean;
  taskId?: string | null;
  label?: string;
}

const BASE = "/api/v1/lawyer/work-sessions";
const DEMO = "سجل جلسات العمل غير متاح في وضع العرض التجريبي";

export async function getWorkSessions(opts?: { from?: string; to?: string; limit?: number }): Promise<ListRead<WorkSession>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(await apiGet<{ data: WorkSession[]; total?: number }>(BASE, { from: opts?.from, to: opts?.to, limit: opts?.limit }));
  } catch (error) {
    console.error("[workSessionsService] getWorkSessions failed:", error);
    return listFailed<WorkSession>();
  }
}

export async function recordWorkSession(input: WorkSessionInput): Promise<WorkSession> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: WorkSession }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الجلسة المحفوظة.");
  return res.data;
}

export async function deleteWorkSession(id: string): Promise<void> {
  if (!isSupabaseMode) throw new Error(DEMO);
  await apiMutate<{ ok: true }>(`${BASE}/${encodeURIComponent(id)}`, "DELETE", {});
}
