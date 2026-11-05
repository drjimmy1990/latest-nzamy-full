/**
 * aiRunActivity.ts — the AI runs in the unified activity log (S2 D1). The route
 * hands in its RLS-bound client, so a viewer reads his own rows twice over: the
 * `user_id` filter here and the "own ai runs" policy (20261027_10). The column
 * list stays inside that migration's grant and never names a text column.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describeAiRun, type ActivityBadge } from "../events.ts";

export const AI_RUN_ACTIVITY_COLUMNS = "id, tool, status, charged_points, refunded_at, created_at";

export interface AiRunActivityRow {
  id: string;
  tool: string;
  status: string;
  charged_points: number;
  refunded_at: string | null;
  created_at: string;
}

export async function readAiRunActivity(
  supabase: SupabaseClient,
  uid: string,
  before: string | null,
  pageSize: number,
): Promise<{ rows: AiRunActivityRow[]; degraded: boolean }> {
  const filter = supabase.from("ai_runs").select(AI_RUN_ACTIVITY_COLUMNS).eq("user_id", uid);
  const { data, error } = await (before ? filter.lt("created_at", before) : filter)
    .order("created_at", { ascending: false })
    .limit(pageSize);
  if (error) {
    // Before 20261027_10 there is simply nothing to show.
    if (error.code === "42P01" || error.code === "PGRST205") return { rows: [], degraded: false };
    console.error("[lawyer/activity GET] ai_runs query failed:", error.code);
    return { rows: [], degraded: true };
  }
  return { rows: (data ?? []) as unknown as AiRunActivityRow[], degraded: false };
}

export function aiRunActivityItem(row: AiRunActivityRow): {
  id: string;
  badge: ActivityBadge;
  title: string;
  description?: string;
  requestId: null;
  requestHref: string;
  requestTitle: null;
  serviceTitleAr: null;
  createdAt: string;
} {
  const described = describeAiRun({
    tool: row.tool,
    status: row.status,
    chargedPoints: row.charged_points,
    refunded: Boolean(row.refunded_at),
  });
  return {
    id: `ai:${row.id}`,
    badge: described.badge,
    title: described.title,
    ...(described.description ? { description: described.description } : {}),
    requestId: null,
    requestHref: `/ai/runs/${row.id}`,
    requestTitle: null,
    serviceTitleAr: null,
    createdAt: row.created_at,
  };
}
