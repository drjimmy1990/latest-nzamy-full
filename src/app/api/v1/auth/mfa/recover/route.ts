import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashBackupCode, normalizeBackupCode } from "@/lib/auth/staffBackupCodes";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { sendStaffSecurityNotice } from "@/lib/auth/staffMfaServer";
import { NOT_STAFF_AR, noStore, readStaffMfaCaller } from "@/lib/auth/staffMfaRoute";

/**
 * POST /api/v1/auth/mfa/recover { code } — a staff member who lost the
 * authenticator app spends ONE backup code (owner item 18, batch l7).
 *
 * GoTrue cannot be told "this session is now aal2", so a backup code does
 * not sign in: it removes the account's MFA factors (GoTrue admin API) and
 * the page then enrols a new authenticator on the spot, which ends in a real
 * aal2 session. Reached on an aal1 session (that is the point), after the
 * password. Limits: 5 tries per address per 15 minutes in src/proxy.ts, and
 * the account locks after 5 refused codes in 15 minutes (20261127_50).
 *
 *   200 { reset: true }  the factors are gone; enrol a new one now
 *   400 a wrong or already used code · 403 not staff · 409 nothing to recover
 *   429 locked · 503 the check could not be made
 */
export const dynamic = "force-dynamic";

const WRONG_AR = "رمز الاحتياط غير صحيح أو استُخدم من قبل.";
const LOCKED_AR = "تجاوزت عدد المحاولات المسموح. انتظر ١٥ دقيقة ثم أعد المحاولة.";
const UNAVAILABLE_AR = "تعذّر التحقق من رمز الاحتياط الآن. أعد المحاولة لاحقاً.";

export async function POST(req: NextRequest) {
  const caller = await readStaffMfaCaller();
  if (!caller.ok) return caller.response;
  if (!caller.isStaff) return noStore({ error: NOT_STAFF_AR }, 403);
  if (!caller.enrolled) {
    return noStore({ error: "لا يوجد تطبيق مصادقة مفعّل على هذا الحساب، فلا حاجة لرمز احتياط." }, 409);
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const normalized = normalizeBackupCode((body as { code?: unknown } | null)?.code);
  // A malformed code is still spent as a refused try, so it counts toward the lock.
  const hash = normalized ? hashBackupCode(caller.user.id, normalized) : "";

  let admin: Awaited<ReturnType<typeof createServiceClient>>;
  let verdict: unknown;
  try {
    admin = await createServiceClient();
    const { data, error } = await admin.rpc("admin_mfa_backup_code_consume", {
      p_user: caller.user.id,
      p_hash: hash,
    });
    if (error) {
      console.error("[auth/mfa/recover] consume failed:", error.code, error.message);
      return noStore({ error: UNAVAILABLE_AR }, 503);
    }
    verdict = data;
  } catch (err) {
    console.error("[auth/mfa/recover] consume threw:", err instanceof Error ? err.message : err);
    return noStore({ error: UNAVAILABLE_AR }, 503);
  }

  if (verdict === "locked") return noStore({ error: LOCKED_AR, code: "locked" }, 429);
  if (verdict !== "ok") return noStore({ error: WRONG_AR, code: "invalid" }, 400);

  // The code is spent: remove every factor (verified or abandoned) of the account.
  const factors = Array.isArray(caller.user.factors) ? caller.user.factors : [];
  const failed: string[] = [];
  for (const factor of factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: caller.user.id });
    if (error) failed.push(factor.id);
  }
  if (failed.length > 0) {
    console.error("[auth/mfa/recover] deleteFactor failed for", failed.length, "factor(s)");
    return noStore(
      { error: "قُبل رمز الاحتياط لكن تعذّر إلغاء تطبيق المصادقة القديم. أعد المحاولة برمز آخر أو تواصل مع مسؤول الخادم." },
      503,
    );
  }

  const { error: eventError } = await admin
    .from("admin_mfa_events")
    .insert({ user_id: caller.user.id, kind: "factor_reset", trigger: "recovery" });
  if (eventError) console.error("[auth/mfa/recover] event insert failed:", eventError.code, eventError.message);

  await logAdminAction({
    actorId: caller.user.id,
    action: "admin_mfa_reset_by_backup_code",
    targetType: "user",
    targetId: caller.user.id,
    metadata: { factors_removed: factors.length },
  });
  await sendStaffSecurityNotice(
    caller.user.email,
    "استُخدم رمز احتياط في حساب الإدارة",
    "استُخدم أحد رموز الاحتياط لإلغاء تطبيق المصادقة القديم في حسابك الإداري، ويجب الآن ربط تطبيق مصادقة جديد.",
  );

  return noStore({ reset: true });
}
