import { createServiceClient } from "@/lib/supabase/server";
import { generateBackupCodes, hashBackupCode, normalizeBackupCode } from "@/lib/auth/staffBackupCodes";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { sendStaffSecurityNotice } from "@/lib/auth/staffMfaServer";
import { NOT_STAFF_AR, noStore, readStaffMfaCaller } from "@/lib/auth/staffMfaRoute";

/**
 * POST /api/v1/auth/mfa/backup-codes — a NEW set of 10 one-time backup codes
 * for the calling staff account (owner item 18, batch l7). The old set stops
 * working at once. Needs a verified factor AND an aal2 session: a stolen
 * password alone cannot mint codes.
 *
 *   200 { codes: string[10] }   shown once; only their hashes are stored
 *   403 not staff / not enrolled / not aal2
 *   503 the codes could not be stored (20261127_50 not run)
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const caller = await readStaffMfaCaller();
  if (!caller.ok) return caller.response;
  if (!caller.isStaff) return noStore({ error: NOT_STAFF_AR }, 403);
  if (!caller.enrolled || caller.aal !== "aal2") {
    return noStore(
      { error: "أكمل التحقق بخطوتين (رمز تطبيق المصادقة) قبل إنشاء رموز الاحتياط.", code: "mfa_required" },
      403,
    );
  }

  const codes = generateBackupCodes();
  const hashes = codes.map((c) => hashBackupCode(caller.user.id, normalizeBackupCode(c)!));

  try {
    const admin = await createServiceClient();
    const { error } = await admin.rpc("admin_mfa_backup_codes_replace", {
      p_user: caller.user.id,
      p_hashes: hashes,
    });
    if (error) {
      console.error("[auth/mfa/backup-codes] replace failed:", error.code, error.message);
      return noStore({ error: "تعذّر حفظ رموز الاحتياط الآن. أعد المحاولة لاحقاً." }, 503);
    }
  } catch (err) {
    console.error("[auth/mfa/backup-codes] replace threw:", err instanceof Error ? err.message : err);
    return noStore({ error: "تعذّر حفظ رموز الاحتياط الآن. أعد المحاولة لاحقاً." }, 503);
  }

  await logAdminAction({
    actorId: caller.user.id,
    action: "admin_mfa_backup_codes_generated",
    targetType: "user",
    targetId: caller.user.id,
    metadata: { count: codes.length },
  });
  await sendStaffSecurityNotice(
    caller.user.email,
    "أُنشئت رموز احتياط جديدة لحساب الإدارة",
    "أُنشئت عشرة رموز احتياط جديدة للتحقق بخطوتين في حسابك الإداري، وتوقفت الرموز السابقة عن العمل.",
  );

  return noStore({ codes });
}
