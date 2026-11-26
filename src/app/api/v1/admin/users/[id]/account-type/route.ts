import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { isUuid } from "@/lib/admin/viewAsCore";
import { convertRefusal, isConverterMissing, readConvertBody } from "@/lib/admin/accountTypeConvert";

/**
 * /api/v1/admin/users/[id]/account-type — l16 C14 (owner package 25 Nov,
 * §٣.٣), first slice of the account-type converter.
 *
 * GET  — the account's full type (type + kind), its verification state, the
 *        open commitments that would refuse a conversion, and the moves
 *        allowed from here (public.admin_account_type_state). Any staff role.
 * POST { target, reason } — converts: lawyer advocate ↔ consultant,
 *        individual → lawyer (advocate | consultant), individual → provider
 *        (notary | arbitrator | bailiff). Staff action users.change_type.
 *
 * The work is ONE database function, public.admin_change_account_type
 * (20261206_80, SECURITY DEFINER, service_role only): it refuses an account
 * with open commitments and then changes nothing; otherwise it snapshots the
 * old sector rows (never deletes), creates or updates the new one, writes
 * profiles.user_type, and writes the audit row (account_type_converted, with
 * the reason and the admin) in the SAME transaction — so this route does not
 * call logAdminAction: an audit row written apart could be lost while the
 * conversion stands. Before 20261206_80 runs both answer 503.
 */

export const dynamic = "force-dynamic";

const NOT_INSTALLED_AR = "الخدمة غير متاحة مؤقتاً — محوّل نوع الحساب لم يُثبَّت بعد.";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;

  const { id: targetId } = await params;
  if (!isUuid(targetId)) return NextResponse.json({ error: "معرّف المستخدم غير صالح" }, { status: 400 });

  const admin = await createServiceClient();
  const { data, error } = await admin.rpc("admin_account_type_state", { p_user: targetId });
  if (error) {
    if (isConverterMissing(error.code)) return NextResponse.json({ error: NOT_INSTALLED_AR }, { status: 503 });
    console.error("[admin/users/account-type] state read failed:", error.code);
    return NextResponse.json({ error: "تعذّر قراءة نوع الحساب الآن." }, { status: 500 });
  }
  const state = (data ?? {}) as Record<string, unknown>;
  if (state.found !== true) return NextResponse.json({ error: "المستخدم غير موجود." }, { status: 404 });
  return NextResponse.json({ data: state });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("users.change_type");
  if (!gate.ok) return gate.response;

  const { id: targetId } = await params;
  if (!isUuid(targetId)) return NextResponse.json({ error: "معرّف المستخدم غير صالح" }, { status: 400 });
  if (targetId.toLowerCase() === gate.userId.toLowerCase()) {
    return NextResponse.json({ error: "لا يمكنك تحويل حسابك من لوحة الإدارة." }, { status: 400 });
  }

  const parsed = readConvertBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = await createServiceClient();
  const { data, error } = await admin.rpc("admin_change_account_type", {
    p_user: targetId,
    p_target: parsed.target,
    p_reason: parsed.reason,
    p_actor: gate.userId,
  });
  if (error) {
    if (isConverterMissing(error.code)) return NextResponse.json({ error: NOT_INSTALLED_AR }, { status: 503 });
    console.error("[admin/users/account-type] conversion failed:", error.code);
    return NextResponse.json({ error: "تعذّر تحويل نوع الحساب. لم يُحفظ أي تغيير." }, { status: 500 });
  }
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const refusal = convertRefusal(result);
    return NextResponse.json(
      refusal.blockers ? { error: refusal.error, blockers: refusal.blockers } : { error: refusal.error },
      { status: refusal.status },
    );
  }
  return NextResponse.json({ data: result });
}
