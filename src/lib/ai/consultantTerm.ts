/**
 * consultantTerm.ts — owner ١٤٦ (register 14 #19, batch l12): the legal
 * opinion and contract drafting are reserved for the licensed advocate and the
 * law firm until the consultant's account type opens. A consultant who had
 * already paid keeps them «to the end of his term»: a paid plan whose current
 * term had started before the cut-off and has not ended yet.
 *
 * Why the term must have STARTED before the cut-off: a renewal opens a new
 * term (current_period_start moves), so an auto-renewed plan does not keep the
 * tools forever, and a plan bought after the change opens nothing.
 *
 * The cut-off is this batch's date. A consultant who subscribes between it and
 * the deploy is not covered; move it to the deploy day if that matters.
 *
 * `consultantPaidTermCovers` is the pure rule (node --test loads this file);
 * `readConsultantPaidTerm` is the one read, used by the run path and by
 * tool-status alike so the screen and the server never disagree (R5). Any
 * failed read answers false: a doubt never opens a reserved tool.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const CONSULTANT_TOOLS_CUTOFF = "2026-11-22T00:00:00+03:00";

export interface PlanTermRow {
  tier?: unknown;
  status?: unknown;
  current_period_start?: unknown;
  current_period_end?: unknown;
}

function time(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Does one of these subscription rows keep the reserved tools open now? */
export function consultantPaidTermCovers(
  rows: readonly PlanTermRow[],
  now: number,
  cutoff: string = CONSULTANT_TOOLS_CUTOFF,
): boolean {
  const cut = time(cutoff);
  if (cut === null) return false;
  return rows.some((r) => {
    if (r.status !== "active") return false;
    if (typeof r.tier !== "string" || r.tier === "free") return false;
    const start = time(r.current_period_start);
    const end = time(r.current_period_end);
    // No end date = no paid term to keep (an open-ended grant is not a paid term).
    return start !== null && end !== null && start < cut && end > now;
  });
}

/** The read behind it, for one user. Server only (service client). */
export async function readConsultantPaidTerm(admin: SupabaseClient, userId: string, now: number = Date.now()): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("subscriptions")
      .select("tier, status, current_period_start, current_period_end")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error || !Array.isArray(data)) return false;
    return consultantPaidTermCovers(data as PlanTermRow[], now);
  } catch {
    return false;
  }
}
