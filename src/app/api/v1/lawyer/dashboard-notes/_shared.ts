/**
 * _shared.ts — the scope resolution the dashboard-notes routes share (N3.4).
 *
 * A note's `firm_id` is never taken from the request: it is derived here from
 * the scope and the linked case, with the same rules as a case-file note
 * (cases/[id]/notes/_resolveFirmVisibility.ts), and RLS re-checks it
 * (`case_note_scope_ok` in the WITH CHECK of 20261025_31).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCaseTeamFirmId, resolveFirmVisibilityFirmId } from "@/app/api/v1/cases/[id]/notes/_resolveFirmVisibility";
import { firmForCaselessNote, type NoteVisibility } from "@/lib/dashboardNotes/notesInput";

export async function resolveNoteFirmId(
  supabase: SupabaseClient,
  userId: string,
  visibility: NoteVisibility,
  caseRequestId: string | null,
): Promise<{ firmId: string | null } | { error: string }> {
  if (visibility === "private") return { firmId: null };
  if (visibility === "case_team") {
    if (!caseRequestId) return { error: "ملاحظة فريق القضية تحتاج قضية مرتبطة." };
    return resolveCaseTeamFirmId(supabase, userId, caseRequestId);
  }
  if (caseRequestId) return resolveFirmVisibilityFirmId(supabase, userId, caseRequestId);

  const { data, error } = await supabase
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(5);
  if (error) {
    console.error("[dashboard-notes] firm_members lookup failed:", error.message, error.code);
    return { error: "تعذّر التحقق من عضويتك في المكتب." };
  }
  return firmForCaselessNote(((data ?? []) as Array<{ firm_id: string }>).map((r) => r.firm_id));
}
