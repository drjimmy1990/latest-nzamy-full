import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { dispatchVerificationToN8n } from "@/lib/n8n/dispatch";
import { recordNotification } from "@/lib/notify";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";

/**
 * PATCH /api/v1/admin/verifications/[id] — Approve or reject a verification
 *
 * URL param: id = the user_id of the provider/lawyer/firm owner
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * Requires: a staff role with verifications.decide; audited once (owner ٢١٠)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  // ── Staff gate (owner ٢١٠) ─────────────────────────────────────────────────
  const gate = await requireStaff("verifications.decide");
  if (!gate.ok) return gate.response;

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { action: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { action, reason } = body;

  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "الإجراء مطلوب: 'approve' أو 'reject'" },
      { status: 400 },
    );
  }

  const newStatus = action === "approve" ? "verified" : "rejected";
  const adminClient = await createServiceClient();

  // ── Try to update across all profile tables ────────────────────────────────
  // We don't know which table the user belongs to, so we try all three.
  // Only one will match, the others will return count=0.

  let updated = false;
  let updatedName = "";
  let updatedType = "";

  // 1. Try lawyer_profiles
  const { data: lawyerUpdate, error: lawyerErr } = await adminClient
    .from("lawyer_profiles")
    .update({
      verification_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("user_id, verification_status")
    .maybeSingle();

  if (!lawyerErr && lawyerUpdate) {
    updated = true;
    updatedType = "lawyer";
    // Get display name
    const { data: p } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();
    updatedName = p?.display_name ?? userId;
  }

  // 2. Try provider_profiles
  if (!updated) {
    const { data: providerUpdate, error: providerErr } = await adminClient
      .from("provider_profiles")
      .update({
        verification_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select("user_id, verification_status, sub_role")
      .maybeSingle();

    if (!providerErr && providerUpdate) {
      updated = true;
      updatedType = (providerUpdate.sub_role as string) ?? "provider";
      const { data: p } = await adminClient
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single();
      updatedName = p?.display_name ?? userId;
    }
  }

  // 3. Try firm_profiles (userId is the owner_user_id)
  if (!updated) {
    const { data: firmUpdate, error: firmErr } = await adminClient
      .from("firm_profiles")
      .update({
        verification_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_user_id", userId)
      .select("id, name_ar, verification_status")
      .maybeSingle();

    if (!firmErr && firmUpdate) {
      updated = true;
      updatedType = "firm";
      updatedName = (firmUpdate.name_ar as string) ?? userId;
    }
  }

  if (!updated) {
    return NextResponse.json(
      { error: "لم يتم العثور على طلب تحقق لهذا المستخدم" },
      { status: 404 },
    );
  }

  // ── Audit log ──────────────────────────────────────────────────────────────
  await logAdminAction({
    actorId: gate.userId,
    action: action === "approve" ? "verification_approved" : "verification_rejected",
    targetType: updatedType,
    targetId: userId,
    before: { verification_status: "pending" },
    after: { verification_status: newStatus, reason: reason ?? null },
    metadata: { reason: reason ?? null },
  });

  // ── Notify the applicant + fire n8n (best-effort, non-blocking) ─────────────
  // firm updates target owner_user_id, which === userId here, so notifying
  // userId reaches the right person in all three table cases.
  await recordNotification({
    userId,
    title: action === "approve" ? "تم اعتماد حسابك" : "لم يُقبل طلب التحقق",
    body:
      action === "approve"
        ? "تهانينا! تم توثيق حسابك ويمكنك الآن استخدام كامل المزايا."
        : `نعتذر، لم تتم الموافقة على طلب التحقق.${reason ? ` السبب: ${reason}` : ""}`,
    href: "/dashboard",
  });
  await dispatchVerificationToN8n({
    userId,
    name: updatedName,
    type: updatedType,
    status: newStatus as "verified" | "rejected",
  });

  // ── Response ───────────────────────────────────────────────────────────────
  const actionLabel = action === "approve" ? "اعتماد" : "رفض";
  const message = `تم ${actionLabel} ${updatedName} بنجاح`;

  return NextResponse.json({
    success: true,
    message,
    verification: {
      user_id: userId,
      name: updatedName,
      type: updatedType,
      status: newStatus,
    },
  });
}
