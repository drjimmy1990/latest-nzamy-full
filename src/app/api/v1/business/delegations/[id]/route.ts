import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerBusinessScope } from "@/lib/auth/businessCallerScope";
import { riyadhToday } from "@/lib/riyadhToday";
import { recordNotification } from "@/lib/notify";
import { DELEGATION_COLUMNS, displayNames, isMissingRelation, toDelegationDto, type DelegationRow } from "../_shared";

/**
 * PATCH /api/v1/business/delegations/[id] — body `{ action: "revoke" }`.
 *
 * The owner revokes a delegation. The row stays in the register with
 * `revoked_at` / `revoked_by`; the database sets both itself (the 20261017_30
 * update trigger overwrites whatever the request sends) and refuses to revive a
 * revoked row or to change anything else on it. `authenticated` holds UPDATE
 * on `revoked_at` only.
 */

const AR = {
  badAction: "الإجراء غير معروف.",
  ownerOnly: "إلغاء التفويضات متاح لمالك الحساب فقط.",
  notFound: "التفويض غير موجود.",
  alreadyRevoked: "هذا التفويض ملغى مسبقاً.",
  saveFailed: "تعذّر إلغاء التفويض.",
  notReady: "سجل التفويضات غير مفعّل بعد على الخادم.",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: AR.notFound }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    if (body?.action !== "revoke") return NextResponse.json({ error: AR.badAction }, { status: 400 });

    const scope = await resolveCallerBusinessScope(supabase, user.id, "business/delegations PATCH", {
      withDelegation: false,
    });
    if (scope.scope !== "owner" || !scope.businessId) {
      if (scope.readFailed) return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
      return NextResponse.json({ error: AR.ownerOnly }, { status: 403 });
    }

    const { data: current, error: readErr } = await supabase
      .from("business_delegations")
      .select(DELEGATION_COLUMNS)
      .eq("id", id)
      .eq("business_id", scope.businessId)
      .maybeSingle();
    if (readErr) {
      if (isMissingRelation(readErr.code)) return NextResponse.json({ error: AR.notReady }, { status: 503 });
      console.error("[business/delegations PATCH] read failed:", readErr.message, readErr.code);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: AR.notFound }, { status: 404 });
    if ((current as DelegationRow).revoked_at) {
      return NextResponse.json({ error: AR.alreadyRevoked }, { status: 409 });
    }

    // The value sent is irrelevant — the trigger stamps now() — but it must be
    // non-null to say "revoke".
    const { data: updated, error: updErr } = await supabase
      .from("business_delegations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", scope.businessId)
      .select(DELEGATION_COLUMNS)
      .maybeSingle();
    if (updErr) {
      if (updErr.code === "23514") return NextResponse.json({ error: AR.alreadyRevoked }, { status: 409 });
      console.error("[business/delegations PATCH] update failed:", updErr.message, updErr.code);
      return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ error: AR.notFound }, { status: 404 });

    const row = updated as DelegationRow;
    await recordNotification({
      userId: row.delegate_user_id,
      title: "أُلغي تفويضك",
      body: "ألغى مالك الحساب تفويضك بتعديل بيانات المنشأة.",
      href: "/dashboard/business/delegations",
    });

    const { data: member } = await supabase
      .from("business_members")
      .select("user_id, role, status")
      .eq("business_id", scope.businessId)
      .eq("user_id", row.delegate_user_id)
      .maybeSingle();
    const names = await displayNames([row.delegate_user_id, row.granted_by, row.revoked_by]);
    return NextResponse.json({
      data: toDelegationDto(row, names, (member as { user_id: string; role: string; status: string } | null) ?? undefined, riyadhToday()),
    });
  } catch (err) {
    console.error("[business/delegations PATCH] Unexpected error:", err);
    return NextResponse.json({ error: AR.saveFailed }, { status: 500 });
  }
}
