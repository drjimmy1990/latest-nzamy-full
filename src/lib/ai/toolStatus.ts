/**
 * toolStatus.ts — may this signed-in caller run this tool now? One boolean, for a
 * page to decide whether to show a tool's form and price (S3-07, q296).
 *
 * It reads the caller the way POST /api/v1/ai/runs does and decides with the same
 * two helpers startRunWith uses (R5), so a screen never offers a run the server
 * refuses. It says nothing else: not the mode, the limits or the price, and a caller
 * whose role cannot use the tool gets its answer before the setting is even read.
 *
 * It does not cover what comes after these checks in the run path: the library's
 * own gate for a library tool, the daily limit, or the points balance.
 *
 * Any failed read answers "not usable". Pure apart from the two clients it is
 * handed, so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { practiceKindFromRead } from "../auth/courtPracticeDecision.ts";
import { readConsultantStanding } from "../auth/consultantScopeServer.ts";
import { resolveToolRuntime, toolAvailability, toolNeedsLicence, toolRoleRefusal } from "./aiToolsConfig.ts";
import { licenceRefusalBody, type VerifiedProviderDecision } from "../auth/verifiedProvider.ts";
import { readAiToolsSetting } from "./runCore.ts";
import type { AiToolSpec } from "./tools.ts";

export interface ToolStatus {
  usable: boolean;
  /**
   * Owner س٢١٤ (batch l16): set only when the one thing missing is the
   * account's verified licence, so the screen says «وثّق رخصتك» instead of
   * «قيد التفعيل». `verifyHref` is the lawyer's own step (null for a firm).
   */
  reason?: "licence";
  verifyHref?: string | null;
}

export interface ToolStatusOptions {
  /** The run path's licence check (StartRunDeps.verifiedProvider). Absent → not asked. */
  licence?: (userId: string, userType: string) => Promise<VerifiedProviderDecision>;
}

export async function toolStatusWith(
  rls: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  spec: AiToolSpec,
  opts: ToolStatusOptions = {},
): Promise<ToolStatus> {
  try {
    const { data: profile, error } = await rls.from("profiles").select("user_type").eq("id", userId).maybeSingle();
    if (error) return { usable: false };
    const userType = typeof profile?.user_type === "string" ? profile.user_type : "";
    // Art. 18: the same read and the same fail-open-to-advocate rule as the run path.
    const practiceKind =
      userType === "lawyer" || userType === "firm"
        ? practiceKindFromRead(await rls.from("lawyer_profiles").select("practice_kind").eq("user_id", userId).maybeSingle()).practiceKind
        : "advocate";
    // Owner decision (22-23 Nov 2026): the run path's own membership read, for a consultant only.
    const firmMember = practiceKind === "consultant" ? (await readConsultantStanding(rls, userId)).firmMember : false;
    if (toolRoleRefusal(spec, { userType, practiceKind, firmMember })) return { usable: false };
    // Owner س٢١٤ (batch l16): the run path's order — the licence after the role, before the mode.
    if (userType !== "admin" && toolNeedsLicence(spec) && opts.licence) {
      const decision = await opts.licence(userId, userType);
      if (!decision.ok) {
        return decision.status === 403 ? { usable: false, reason: "licence", verifyHref: licenceRefusalBody(userType).verifyHref } : { usable: false };
      }
    }

    const runtime = resolveToolRuntime(spec, await readAiToolsSetting(admin));
    return { usable: toolAvailability(runtime.mode, userType === "admin") === "ok" };
  } catch (err) {
    console.error("[ai/tool-status] read failed:", err instanceof Error ? err.name : "unknown");
    return { usable: false };
  }
}
