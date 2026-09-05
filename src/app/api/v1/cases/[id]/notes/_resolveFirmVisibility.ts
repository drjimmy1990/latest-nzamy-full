/**
 * _resolveFirmVisibility.ts — kept separate from _shared.ts (which pulls in
 * `@/lib/supabase/server` for `hydrateAuthorNames`) on purpose: that import
 * only resolves through Next's bundler alias, so a module that carries it
 * cannot be loaded by `node --test` directly. This file has no such import,
 * so `resolveFirmVisibilityFirmId` — the one piece of this route pair with
 * real branching logic worth a unit test — stays independently testable.
 * See `_resolveFirmVisibility.test.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the `firm_id` a `visibility: "firm"` note should carry.
 *
 * A note's firm scope must match the CASE's own firm
 * (`service_requests.firm_id`), not just any firm the caller happens to be
 * active in right now: a lawyer active in two firms (A and B) who writes a
 * "firm" note on a case that belongs to firm A must not have it silently
 * filed under firm B because an unordered `firm_members` lookup picked B
 * first — that would leak the note to firm B's colleagues (who have no
 * relationship to this case) while hiding it from firm A's colleagues (who
 * should see it). So: when the case itself has a firm, the caller must be an
 * ACTIVE member of THAT firm — never a different one. Only a solo case (no
 * `service_requests.firm_id`) falls back to the caller's own first active
 * membership, exactly as the template (`lawyer_client_notes`, which has no
 * independent case anchor to check against) always did.
 *
 * A case that cannot be confirmed right now — the lookup errored, or RLS hid
 * the row — must ALSO refuse rather than fall back to the unfiltered pick:
 * "unreadable" and "genuinely solo" are different facts and must not collapse
 * to the same branch. This matters for PATCH in particular — "case notes
 * updatable by author" has no `service_requests` check of its own (unlike the
 * insert policy), so a lawyer whose firm-A membership was later suspended can
 * still PATCH their own old note; if the case has since become unreadable to
 * them, guessing a firm here would be the same cross-firm leak the caller
 * lookup was built to prevent, just reached from the update side instead of
 * the insert side.
 */
export async function resolveFirmVisibilityFirmId(
  supabase: SupabaseClient,
  userId: string,
  caseId: string,
): Promise<{ firmId: string } | { error: string }> {
  const { data: caseRow, error: caseError } = await supabase
    .from("service_requests")
    .select("firm_id")
    .eq("id", caseId)
    .maybeSingle();

  if (caseError || !caseRow) {
    if (caseError) {
      console.error("[cases/notes] service_requests firm lookup failed:", caseError.message, caseError.code);
    }
    return { error: "لا يمكن مشاركة الملاحظة مع المكتب — تعذّر التحقق من القضية." };
  }

  const caseFirmId = (caseRow as { firm_id: string | null }).firm_id;

  let membershipQuery = supabase
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (caseFirmId) {
    membershipQuery = membershipQuery.eq("firm_id", caseFirmId);
  }
  const { data: membership, error: membershipError } = await membershipQuery.limit(1).maybeSingle();
  if (membershipError) {
    console.error("[cases/notes] firm_members lookup failed:", membershipError.message, membershipError.code);
  }

  if (!membership?.firm_id) {
    return {
      error: caseFirmId
        ? "لا يمكن مشاركة الملاحظة مع المكتب لأنك لست عضوًا نشطًا في مكتب هذه القضية."
        : "لا يمكن مشاركة الملاحظة مع المكتب لأنك غير مرتبط بمكتب نشط.",
    };
  }
  return { firmId: membership.firm_id };
}
