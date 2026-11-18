/**
 * Instant approval of a lawyer (decisions ٢٠–٢١), behind
 * LAWYER_INSTANT_APPROVAL=on. Server-only.
 *
 * It does what the admin approval does for a lawyer
 * (PATCH /api/v1/admin/verifications/[id], the lawyer_profiles branch):
 *   - lawyer_profiles.verification_status = 'verified', updated_at = now,
 *     with the service client;
 *   - the same in-app notification «تم اعتماد حسابك» to the lawyer;
 *   - the same n8n verification event (inert while N8N_WEBHOOK_BASE_URL is unset).
 * approve.test.ts pins the two texts and the update to that route's.
 *
 * Differences, on purpose:
 *   - it only moves a PENDING row (never a rejected or suspended one);
 *   - no admin_audit_events row: there is no admin actor, and that table is an
 *     admin trail written by logAdminAction alone. The trace is the signup
 *     verification row (decision = 'approved', decided_by = 'system',
 *     decided_at), written by the caller;
 *   - R6 (20261122_40): another VERIFIED account on the same licence makes the
 *     update fail with 23505 → 'claimed' → the caller holds the account.
 */

import type { createServiceClient } from "@/lib/supabase/server";
import { recordNotification } from "@/lib/notify";
import { settleFounderSeatAfterDecision } from "@/lib/membership/founderVerificationServer";
import { dispatchVerificationToN8n } from "@/lib/n8n/dispatch";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

export type ApproveResult = "approved" | "claimed" | "not_pending" | "error";

export const APPROVED_TITLE = "تم اعتماد حسابك";
export const APPROVED_BODY = "تهانينا! تم توثيق حسابك ويمكنك الآن استخدام كامل المزايا.";

export async function approveLawyerInstantly(svc: Svc, userId: string): Promise<ApproveResult> {
  const { data, error } = await svc
    .from("lawyer_profiles")
    .update({ verification_status: "verified", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("verification_status", "pending")
    .select("user_id")
    .maybeSingle();
  if (error?.code === "23505") return "claimed";
  if (error) {
    console.error("[lawyerSignup/approve] update failed:", error.code);
    return "error";
  }
  if (!data) return "not_pending";

  const { data: p } = await svc.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  await recordNotification({ userId, title: APPROVED_TITLE, body: APPROVED_BODY, href: "/dashboard" });
  await dispatchVerificationToN8n({
    userId,
    name: (p?.display_name as string | undefined) ?? userId,
    type: "lawyer",
    status: "verified",
  });
  // l7 (decision 1): a founder seat paid while pending is activated now, as
  // the admin approval does (founderVerification.ts). Never fails the approval.
  await settleFounderSeatAfterDecision(svc, userId, userId, "approve");
  return "approved";
}
