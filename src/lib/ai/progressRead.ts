/**
 * progressRead.ts — a run's progress for its owner (20261103_31).
 *
 *   by id    through the session's RLS client. The "own ai runs" and "own progress
 *            events" policies hold the rows; user_id on progress_events is not
 *            granted to a session, so that query must not name it.
 *   by key   through the service client, because idempotency_key is not granted
 *            to a session. The key is only ever looked up inside the session
 *            user's own rows, and both queries say so.
 *
 * Only the id, kind and label of an event leave here. Before 20261103_31 runs, or
 * when the events cannot be read, the reply carries no events and the run's status
 * still comes back, so a poll can always reach a final state.
 *
 * Pure: type-only for Supabase, so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 100;
const KEY = /^[A-Za-z0-9_-]{8,100}$/; // runCore's IDEMPOTENCY_KEY

export interface ProgressRow {
  id: number;
  kind: string;
  label: string;
}

export function parseAfter(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : 0;
}

export function parseProgressKey(raw: string | null): string | null {
  return raw !== null && KEY.test(raw) ? raw : null;
}

interface RunRow {
  id: string;
  status: string;
  progress_step: string | null;
}
type Reply = { status: number; body: Record<string, unknown> };

const UNAVAILABLE: Reply = { status: 503, body: { error: "تعذّر تحميل الطلب" } };

async function readEvents(client: SupabaseClient, runId: string, after: number, ownerFilter: string | null): Promise<ProgressRow[]> {
  const base = client.from("progress_events").select("id, kind, label").eq("run_id", runId);
  const { data, error } = await (ownerFilter ? base.eq("user_id", ownerFilter) : base)
    .gt("id", after)
    .order("id", { ascending: true })
    .limit(PAGE);
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[ai/runs] progress events read failed:", runId, error.code);
    }
    return [];
  }
  return ((data ?? []) as ProgressRow[]).map(({ id, kind, label }) => ({ id, kind, label }));
}

/** GET /api/v1/ai/runs/<id>/events: the RLS client, and a run that is the viewer's own. */
export async function readProgressById(supabase: SupabaseClient, userId: string, runId: string, after: number): Promise<Reply> {
  const { data, error } = await supabase
    .from("ai_runs")
    .select("id, status, progress_step")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[ai/runs/:id/events] run read failed:", runId, error.code);
    return UNAVAILABLE;
  }
  const run = data as RunRow | null;
  if (!run) return { status: 404, body: { error: "غير موجود" } };
  const events = await readEvents(supabase, run.id, after, null);
  return { status: 200, body: { status: run.status, step: run.progress_step, events, final: run.status !== "running" } };
}

/** GET /api/v1/ai/runs/progress: the service client, inside the session user's own rows. */
export async function readProgressByKey(admin: SupabaseClient, userId: string, key: string, after: number): Promise<Reply> {
  const { data, error } = await admin
    .from("ai_runs")
    .select("id, status, progress_step")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) {
    console.error("[ai/runs/progress] run read failed:", error.code);
    return UNAVAILABLE;
  }
  const run = data as RunRow | null;
  // Not a 404: the POST may not have created the run yet.
  if (!run) return { status: 200, body: { runId: null, status: null, events: [] } };
  const events = await readEvents(admin, run.id, after, userId);
  return { status: 200, body: { runId: run.id, status: run.status, step: run.progress_step, events, final: run.status !== "running" } };
}
