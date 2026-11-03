import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { sectorRowValuesFor } from "@/lib/auth/accountTypeClaim";

/**
 * POST /api/v1/lawyer/profile-row — create the signed-in lawyer's own
 * `lawyer_profiles` row when it is missing. → { created: boolean }
 *
 * CODE-F26 (owner package 2026-10-30): «أنشئ ملفك المهني» led to an editor
 * whose Save is disabled when there is no row, and nothing in the product
 * created one — onboarding/account-type does, but it refuses anyone whose
 * `user_type` is already `lawyer`, which is exactly who lands here (accounts
 * typed lawyer by an admin, a seed or an older signup path).
 *
 * The row is the same minimal row onboarding provisions
 * (SECTOR_ROW_BY_USER_TYPE.lawyer: `user_id` + `is_accepting_clients`); every
 * other column takes its table default. `verification_status` is never set
 * here — it stays admin-only and starts at the column default, exactly as for
 * a lawyer who came through onboarding.
 *
 * Idempotent: an upsert on the primary key with ignoreDuplicates, so a double
 * click or an existing row changes nothing (`created: false`). Runs on the
 * service client for the same reason onboarding does: whether the owner
 * INSERT policy from 20260614 is live on production cannot be confirmed from
 * code, and the session's identity — never a body field — is the only id used.
 */
export async function POST() {
  try {
    const auth = await assertRole(["lawyer"]);
    if (!auth.ok) return auth.response;
    const { user, userType } = auth;
    // assertRole always admits a platform admin, who is not a lawyer and must
    // not be given a professional row by visiting a lawyer screen.
    if (userType !== "lawyer") {
      return NextResponse.json({ error: "هذا الإجراء لحسابات المحامين فقط." }, { status: 403 });
    }

    // The exact row onboarding/account-type provisions for a lawyer.
    const spec = sectorRowValuesFor({ userType: "lawyer", subRole: null }, user.id);
    if (!spec || !spec.ownerColumnIsUnique) {
      return NextResponse.json({ error: "تعذّر إنشاء السجل المهني." }, { status: 500 });
    }
    const service = await createServiceClient();
    const { data, error } = await service
      .from(spec.table)
      .upsert(spec.row, { onConflict: spec.ownerColumn, ignoreDuplicates: true })
      .select(spec.ownerColumn);

    if (error) {
      console.error("[lawyer/profile-row POST] upsert failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر إنشاء السجل المهني — حاول مرة أخرى." }, { status: 500 });
    }
    // With ignoreDuplicates PostgREST returns only rows it inserted.
    return NextResponse.json({ created: (data?.length ?? 0) > 0 });
  } catch (err) {
    console.error("[lawyer/profile-row POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
