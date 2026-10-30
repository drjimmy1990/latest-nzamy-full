// ─── Pomodoro Pro — the outbox of finished periods (pure) ───────────────────
//
// CODE-F09 (owner review of 0d5273ea): PomodoroPanel recorded a session's
// "synced" key BEFORE its POST answered, kept no queue (a failed POST was
// gone for good, a closed tab mid-request too), and keyed sessions on
// `startedAt|mode|durationMin`. Now every finished period goes into an outbox
// stored in the browser under the signed-in user's id, with an explicit state:
//
//   pending → POST in flight or not tried yet
//   failed  → the server refused or could not be reached; retried on the next
//             flush (page load, back online, every minute, «إعادة المحاولة»)
//             unless `permanent` (a 4xx validation refusal — retrying the same
//             body changes nothing; the manual retry still may)
//   synced  → the server answered with the row; the entry LEAVES the outbox
//             and the row joins the server log.
//
// Retrying is safe: the session's `id` is the work_sessions row id, so a
// second POST of the same period (a retry after a lost answer, or another
// tab flushing the same outbox) answers with the existing row instead of
// inserting a duplicate (see api/v1/lawyer/work-sessions POST).
//
// Pure: no storage, no network — the hook does both.

import type { PomodoroSession } from "./types.ts";

export type QueueState = "pending" | "failed";

export interface QueueEntry {
  session: PomodoroSession;
  state: QueueState;
  attempts: number;
  /** A refusal that retrying the same body cannot fix — skipped by automatic flushes. */
  permanent: boolean;
  lastError: string | null;
  updatedAt: number;
}

/** Most entries kept; the oldest beyond this are dropped (a browser is not an archive). */
export const QUEUE_MAX = 200;

/** Storage keys, scoped by the signed-in user's id — never shared between accounts on one browser. */
export function queueStorageKey(scope: string): string {
  return `nzamy_pomodoro_outbox:${scope}`;
}
export function activeTimerStorageKey(scope: string): string {
  return `nzamy_pomodoro_active:${scope}`;
}

/** Add a finished period. Idempotent by session id — the same period is never queued twice. */
export function enqueueSession(queue: readonly QueueEntry[], session: PomodoroSession, now: number): QueueEntry[] {
  if (queue.some(e => e.session.id === session.id)) return [...queue];
  const next = [...queue, { session, state: "pending" as const, attempts: 0, permanent: false, lastError: null, updatedAt: now }];
  return next.length > QUEUE_MAX ? next.slice(next.length - QUEUE_MAX) : next;
}

/** The entries an automatic flush should send now; `manual` also includes permanent refusals. */
export function entriesToSend(queue: readonly QueueEntry[], opts: { manual: boolean }): QueueEntry[] {
  return queue.filter(e => opts.manual || !e.permanent);
}

export function markAttempt(queue: readonly QueueEntry[], id: string, now: number): QueueEntry[] {
  return queue.map(e => e.session.id === id ? { ...e, state: "pending" as const, attempts: e.attempts + 1, updatedAt: now } : e);
}

export function markFailed(queue: readonly QueueEntry[], id: string, error: string, permanent: boolean, now: number): QueueEntry[] {
  return queue.map(e => e.session.id === id ? { ...e, state: "failed" as const, permanent, lastError: error, updatedAt: now } : e);
}

/** The server confirmed the row — it leaves the outbox. */
export function markSynced(queue: readonly QueueEntry[], id: string): QueueEntry[] {
  return queue.filter(e => e.session.id !== id);
}

/** Which HTTP answers mean "do not retry automatically". */
export function isPermanentFailure(status: number | null): boolean {
  return status !== null && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 408 && status !== 429;
}

/** Stored JSON back into entries; anything malformed is dropped, never thrown on. */
export function parseStoredQueue(raw: unknown): QueueEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: QueueEntry[] = [];
  for (const e of raw) {
    if (typeof e !== "object" || e === null) continue;
    const r = e as Record<string, unknown>;
    const s = r.session as Record<string, unknown> | undefined;
    if (!s || typeof s.id !== "string" || typeof s.startedAt !== "string" || typeof s.mode !== "string") continue;
    if (typeof s.durationMin !== "number") continue;
    out.push({
      session: {
        id: s.id,
        mode: s.mode as PomodoroSession["mode"],
        startedAt: s.startedAt,
        endedAt: typeof s.endedAt === "string" ? s.endedAt : s.startedAt,
        taskId: typeof s.taskId === "string" ? s.taskId : null,
        taskTitle: typeof s.taskTitle === "string" ? s.taskTitle : undefined,
        completed: s.completed !== false,
        durationMin: s.durationMin,
        noises: Array.isArray(s.noises) ? (s.noises.filter(n => typeof n === "string") as PomodoroSession["noises"]) : [],
      },
      state: r.state === "failed" ? "failed" : "pending",
      attempts: typeof r.attempts === "number" ? r.attempts : 0,
      permanent: r.permanent === true,
      lastError: typeof r.lastError === "string" ? r.lastError : null,
      updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    });
  }
  return out.slice(-QUEUE_MAX);
}

/**
 * The log the panel shows: server rows first-class, plus outbox entries the
 * server does not hold yet (marked with their state), newest first, one row
 * per session id — a period never shows twice while it syncs.
 */
export function mergeSessionLog(
  serverRows: readonly PomodoroSession[],
  queue: readonly QueueEntry[],
): (PomodoroSession & { syncState?: QueueState })[] {
  const seen = new Set<string>();
  const rows: PomodoroSession[] = [];
  for (const s of serverRows) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    rows.push(s);
  }
  const pending = queue
    .filter(e => !seen.has(e.session.id))
    .map(e => ({ ...e.session, syncState: e.state }));
  return [...pending, ...rows].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
