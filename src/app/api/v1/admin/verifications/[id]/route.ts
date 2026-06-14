import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * PATCH /api/v1/admin/verifications/[id] — Approve or reject a verification
 *
 * URL param: id = the user_id of the provider/lawyer/firm owner
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * Requires: authenticated admin user
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
  }

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.user_type !== "admin") {
    return NextResponse.json({ error: "غير مصرح — صلاحيات المسؤول مطلوبة" }, { status: 403 });
  }

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
  await adminClient.from("admin_audit_events").insert({
    actor_id: user.id,
    actor_type: "admin",
    action: action === "approve" ? "verification_approved" : "verification_rejected",
    target_type: updatedType,
    target_id: userId,
    before_state: { verification_status: "pending" },
    after_state: { verification_status: newStatus, reason: reason ?? null },
    metadata: { reason: reason ?? null },
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
