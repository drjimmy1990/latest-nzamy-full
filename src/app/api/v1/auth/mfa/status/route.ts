import { createServiceClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email/sendEmail";
import { adminMfaMode, staffMfaDecision } from "@/lib/auth/staffMfa";
import { noStore, readStaffMfaCaller } from "@/lib/auth/staffMfaRoute";

/**
 * GET /api/v1/auth/mfa/status — what the two-step page needs to know about
 * the caller (owner item 18, batch l7). Any signed-in account may ask; only
 * a staff account gets more than `isStaff: false`.
 *
 *   200 { isStaff, mode: 'rollout'|'required', enrolled, aal,
 *         need: null|'challenge'|'enroll', suggestEnroll,
 *         backupCodesLeft: number|null,    (null: not aal2, or 20261127_50 not run)
 *         emailAlerts: boolean }           (the new-login / change e-mails can be sent here)
 *   401 / 503 as every gate.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const caller = await readStaffMfaCaller();
  if (!caller.ok) return caller.response;
  if (!caller.isStaff) return noStore({ isStaff: false });

  const mode = adminMfaMode(process.env);
  const decision = staffMfaDecision({ hasVerifiedFactor: caller.enrolled, aal: caller.aal, mode });

  let backupCodesLeft: number | null = null;
  if (caller.enrolled && caller.aal === "aal2") {
    try {
      const admin = await createServiceClient();
      const { count, error } = await admin
        .from("admin_mfa_backup_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", caller.user.id)
        .is("used_at", null);
      if (error) console.error("[auth/mfa/status] backup code count failed:", error.code, error.message);
      else backupCodesLeft = count ?? 0;
    } catch (err) {
      console.error("[auth/mfa/status] backup code count threw:", err instanceof Error ? err.message : err);
    }
  }

  return noStore({
    isStaff: true,
    mode,
    enrolled: caller.enrolled,
    aal: caller.aal,
    need: decision.ok ? null : decision.need,
    suggestEnroll: decision.ok ? decision.suggestEnroll : false,
    backupCodesLeft,
    emailAlerts: emailConfigured(),
  });
}
