import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { ADMIN_FREEZE_AR, deletionErrorAr, isAdminFreeze, isMissingAccountDeletionSchema } from "@/lib/auth/accountFreeze";
import { readActiveRequest, syncFreezeMetadata } from "@/lib/accountDeletion/accountDeletionServer";

/**
 * POST /api/v1/me/account-deletion/cancel — «استعادة الحساب» (D6, owner ٢٩٨).
 *
 * cancel_account_deletion() runs on the caller's OWN session: it takes no user
 * id, so nobody restores (or cancels) anyone else's deletion. Then the gates'
 * copy (app_metadata) is lifted — whenever no active request is left, even if
 * this call cancelled nothing (a copy left frozen by a failed write heals here).
 * A request the purge job already holds answers 409. So does a freeze the
 * administration made (requested_by = admin): the database refuses to let the
 * user lift it, and the copy stays frozen — only an admin's «استعادة» does.
 */
export async function POST() {
  const supabase = await createClient();
  const auth = await requireApiUser(supabase, { error: "غير مصرح — يرجى تسجيل الدخول" });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error && !isMissingAccountDeletionSchema(error.code)) {
    console.error("[me/account-deletion/cancel] rpc failed:", error.code, error.message);
    return NextResponse.json({ error: deletionErrorAr(error.message) }, { status: 500 });
  }

  if (!error) {
    const still = await readActiveRequest(supabase, user.id);
    if (!still.ok && !still.schemaMissing) {
      return NextResponse.json({ error: "تعذّر التحقق من حالة الحساب الآن. أعد المحاولة." }, { status: 500 });
    }
    if (still.ok && still.request && isAdminFreeze(still.request.requested_by)) {
      return NextResponse.json({ error: ADMIN_FREEZE_AR, code: "admin_freeze" }, { status: 409 });
    }
    if (still.ok && still.request) {
      return NextResponse.json(
        { error: "بدأ حذف حسابك النهائي بعد انتهاء المهلة، ولم يعد ممكناً استعادته." },
        { status: 409 },
      );
    }
  }

  const service = await createServiceClient();
  const synced = await syncFreezeMetadata(service, user.id, { frozen: false, purgeAfter: null });
  if (!synced.ok) {
    console.error("[me/account-deletion/cancel] lifting app_metadata failed:", synced.error);
    return NextResponse.json({ error: "أُلغي طلب الحذف، لكن تعذّر فتح الحساب الآن. أعد المحاولة." }, { status: 500 });
  }
  return NextResponse.json({ data: { restored: true } });
}
