/**
 * aiSweep.ts — what POST /api/v1/cron/ai-sweep runs, after the route has checked
 * the cron secret.
 *
 *   (default)   ai_sweep_runs: every run still `running` past its deadline fails
 *               as `timeout` and gets its points back.
 *   retention   ai_runs_retention (input / output older than 90 days), then
 *               progress_events_prune (events older than 7 days).
 *
 * A function that is not there yet (its migration has not run) is skipped, never
 * a 500; a real failure is a 500 the scheduler sees.
 *
 * Pure: type-only for Supabase, so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const isMissingFunction = (code: string | undefined) => code === "42883" || code === "PGRST202";
const countOf = (data: unknown) => (typeof data === "number" ? data : 0);

export async function runAiSweep(
  admin: SupabaseClient,
  retention: boolean,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const fn = retention ? "ai_runs_retention" : "ai_sweep_runs";
  const { data, error } = await admin.rpc(fn);
  if (error) {
    if (isMissingFunction(error.code)) return { status: 200, body: { ok: true, skipped: "schema_missing" } };
    console.error(`[cron/ai-sweep] ${fn} failed:`, error.code, error.message);
    return { status: 500, body: { error: `${fn} failed` } };
  }
  const count = countOf(data);
  if (count > 0) console.info(`[cron/ai-sweep] ${fn}:`, count);
  if (!retention) return { status: 200, body: { ok: true, task: "sweep", count } };

  const pruned = await admin.rpc("progress_events_prune");
  if (pruned.error && !isMissingFunction(pruned.error.code)) {
    console.error("[cron/ai-sweep] progress_events_prune failed:", pruned.error.code, pruned.error.message);
    return { status: 500, body: { error: "progress_events_prune failed" } };
  }
  return { status: 200, body: { ok: true, task: "retention", count, pruned: countOf(pruned.data) } };
}
