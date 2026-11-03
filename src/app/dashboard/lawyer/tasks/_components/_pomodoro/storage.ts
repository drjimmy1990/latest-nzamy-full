// ─── Pomodoro Pro — Persistence Adapter ─────────────────────────────────────
//
// Phase 6 (item 97): a signed-in supabase-mode lawyer's focus log lives on
// `public.work_sessions`, not in the browser. `usePomodoroEngine.ts` (not
// owned by this task) calls `loadSessions`/`saveSession` synchronously and
// assigns their return straight to React state, so those two signatures stay
// BYTE-IDENTICAL — sync, `PomodoroSession[]` in, `PomodoroSession[]` out.
// What changes is what they do:
//   - demo mode (`!isSupabaseMode`)              → unchanged: read/write the
//     browser under `nzamy_pomodoro_sessions`, exactly as before this phase.
//   - supabase mode                                → they stop touching the
//     browser (`loadSessions` → `[]`, `saveSession` → `[session]`, no
//     `localStorage` read or write). Finished periods go to the server through
//     the engine's outbox instead (CODE-F09, ./sessionQueue.ts): kept in the
//     browser under the user's id until `postSessionIdempotent` gets the row
//     back. `PomodoroPanel.tsx` fetches the true history with
//     `getServerSessions` and runs `migrateLocalSessionsToServer` once to
//     sweep any pre-phase-6 rows left in the browser into the server and out
//     of it. (`recordSessionOnServer`, which the panel used to call after
//     marking a session "synced" before the answer came, is gone.)
//
// The pure mapping + stats logic (mode mapping, row shaping, validation,
// getWeekStats/getHourStats/generateInsights) lives in `./sessionMapping.ts`
// and is re-exported below unchanged — see that file's header for why it's
// split out (in one sentence: it's what `node --test` can actually load).

import type { PomodoroSession } from "./types";
// Relative, not "@/…": this file is reached by `node --test` indirectly
// (nothing here is itself unit-tested, but it must still load cleanly), and
// the plain ESM loader has no tsconfig-paths resolution for the "@/" alias.
import { isSupabaseMode } from "../../../../../../lib/services/api.ts";
import type { ListRead } from "../../../../../../lib/services/listRead.ts";
import { getWorkSessions, recordWorkSession, type WorkSession } from "../../../../../../lib/services/workSessionsService.ts";
import {
  isPostableSession, isUuid, pomodoroSessionToWorkSessionInput, workSessionToPomodoroSession,
} from "./sessionMapping.ts";

export {
  pomodoroModeToWorkSessionMode, workSessionModeToPomodoroMode,
  workSessionToPomodoroSession, isPostableSession, isUuid, pomodoroSessionToWorkSessionInput,
  getWeekStats, getHourStats, generateInsights,
  type DayStats, type HourStats, type SmartInsight,
} from "./sessionMapping.ts";

const KEY = "nzamy_pomodoro_sessions";
const MAX = 500; // max sessions stored / migrated in one pass

/** Unconditional local read — bypasses the supabase-mode gate below. Used by
 *  demo-mode `loadSessions` and by the one-time migration, which must be
 *  able to see a leftover key even while `isSupabaseMode` is true. */
function readLocalRaw(): PomodoroSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PomodoroSession[];
  } catch {
    return [];
  }
}

/** Unconditional local write, capped at MAX, with the same quota-full
 *  halve-and-retry fallback `saveSession` always had. */
function writeLocalRaw(sessions: PomodoroSession[]): void {
  const capped = sessions.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(capped));
  } catch {
    localStorage.setItem(KEY, JSON.stringify(capped.slice(0, Math.floor(MAX / 2))));
  }
}

/**
 * Demo mode: the local scratch array, as before. Supabase mode: `[]` — the
 * signed-in history is fetched separately (`getServerSessions`), and the
 * engine's own mount-time load is not the source of truth for it.
 */
export function loadSessions(): PomodoroSession[] {
  if (typeof window === "undefined") return [];
  if (isSupabaseMode) return [];
  return readLocalRaw();
}

/**
 * Demo mode: prepend + persist, as before. Supabase mode: no `localStorage`
 * read or write — returns `[session]` so the caller's `setSessions(updated)`
 * still gets a valid array (the engine doesn't depend on it being
 * cumulative; `PomodoroPanel` sources the displayed history from the server
 * and only watches this array to notice a *new* completion to sync).
 */
export function saveSession(session: PomodoroSession): PomodoroSession[] {
  if (isSupabaseMode) return [session];
  if (typeof window === "undefined") return [session];
  const existing = readLocalRaw();
  const updated = [session, ...existing].slice(0, MAX);
  writeLocalRaw(updated);
  return updated;
}

export function clearSessions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

// ─── Server adapter ───────────────────────────────────────────────────────────

/** The signed-in lawyer's true history, mapped onto `PomodoroSession[]` so
 *  every existing stats helper and screen in this folder keeps working
 *  unchanged. `ok:false` passes straight through — a failed read must read
 *  as "unreadable", never as an empty log. */
export async function getServerSessions(opts?: { from?: string; to?: string; limit?: number }): Promise<ListRead<PomodoroSession>> {
  const read = await getWorkSessions(opts);
  if (!read.ok) return read;
  return {
    ok: true,
    items: read.items.map(workSessionToPomodoroSession),
    total: read.total,
    truncated: read.truncated,
  };
}

// ─── Outbox transport + the active period (CODE-F09, LIVE-F17) ───────────────

export type PostOutcome =
  | { ok: true; saved: WorkSession }
  | { ok: false; status: number | null; error: string };

/**
 * POSTs one finished period with its own id, so the route answers a repeat
 * with the row it already holds (see work-sessions/route.ts POST). `fetch`
 * directly rather than `recordWorkSession`, because the outbox needs the HTTP
 * status to tell a refusal (do not retry) from an outage (retry) — `apiMutate`
 * folds both into one Error.
 */
export async function postSessionIdempotent(session: PomodoroSession): Promise<PostOutcome> {
  // Owner decision ١١٥ — demo mode never reaches a server. `apiMutate` has
  // this guard; a direct `fetch` must repeat it.
  if (!isSupabaseMode) {
    return { ok: false, status: 400, error: "وضع العرض التجريبي محلي بالكامل." };
  }
  if (!isPostableSession(session)) {
    return { ok: false, status: 400, error: "بيانات الفترة غير صالحة." };
  }
  const body = {
    ...pomodoroSessionToWorkSessionInput(session),
    ...(isUuid(session.id) ? { id: session.id } : {}),
  };
  try {
    const res = await fetch("/api/v1/lawyer/work-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { data?: WorkSession; error?: string } | null;
    if (res.ok && json?.data) return { ok: true, saved: json.data };
    return { ok: false, status: res.status, error: json?.error || `HTTP ${res.status}` };
  } catch (error) {
    // Offline / DNS / aborted — no status, always retryable.
    return { ok: false, status: null, error: error instanceof Error ? error.message : "network" };
  }
}

/** Read one JSON value from the browser; null when absent, unreadable or blocked. */
export function readStoredJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Write (or with `null`, remove) one JSON value; a full or blocked storage is not fatal. */
export function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("[pomodoro storage] could not persist", key, error);
  }
}

export interface MigrationResult {
  posted:    number;
  dropped:   number; // failed local validation — permanently unpostable, discarded
  retryable: number; // POST failed (network/server) — left in place for next attempt
}

/**
 * One-time sweep: whatever is left under `nzamy_pomodoro_sessions` (pre-
 * phase-6 browser data, or a demo-mode session that predates this account
 * going supabase-backed) is POSTed oldest-first, capped at MAX, then the key
 * is cleared of everything the sweep actually resolved.
 *
 * A row that fails local validation is dropped (it would fail server
 * validation too — retrying it changes nothing). A row whose POST itself
 * fails (network/5xx) is kept: only entries the sweep actually posted or
 * dropped are removed from `localStorage`, so a transient failure never
 * loses history and never re-posts an already-saved row on the next login.
 */
export async function migrateLocalSessionsToServer(): Promise<MigrationResult> {
  if (typeof window === "undefined") return { posted: 0, dropped: 0, retryable: 0 };
  const capped = readLocalRaw().slice(0, MAX);
  if (capped.length === 0) return { posted: 0, dropped: 0, retryable: 0 };

  const oldestFirst = [...capped].reverse();
  const handledIds = new Set<string>();
  let posted = 0, dropped = 0, retryable = 0;

  for (const session of oldestFirst) {
    if (!isPostableSession(session)) {
      dropped++;
      handledIds.add(session.id);
      continue;
    }
    try {
      await recordWorkSession(pomodoroSessionToWorkSessionInput(session));
      posted++;
      handledIds.add(session.id);
    } catch (error) {
      console.error("[pomodoro storage] migration POST failed, keeping for retry:", error);
      retryable++;
    }
  }

  const remaining = capped.filter(s => !handledIds.has(s.id));
  if (remaining.length === 0) clearSessions();
  else writeLocalRaw(remaining);

  return { posted, dropped, retryable };
}
