import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/credits — Grant or adjust credits for a user
 *
 * Body: {
 *   user_id: string,
 *   amount: number,       // positive = grant, negative = deduct
 *   description: string
 * }
 *
 * - Reads current balance from lawyer_profiles.credit_balance
 * - Creates credit_transactions record with kind = 'admin_adjustment'
 * - Updates lawyer_profiles.credit_balance
 * - Returns the new balance
 *
 * Requires: authenticated admin user
 */
export async function POST(request: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "غير مصرح — يرجى تسجيل الدخول" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { user_id: string; amount: number; description: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "بيانات غير صالحة" },
      { status: 400 },
    );
  }

  const { user_id, amount, description } = body;

  // ── Validate required fields ───────────────────────────────────────────────
  if (!user_id || amount === undefined || amount === null || !description) {
    return NextResponse.json(
      { error: "جميع الحقول مطلوبة: user_id, amount, description" },
      { status: 400 },
    );
  }

  if (!Number.isInteger(amount) || amount === 0) {
    return NextResponse.json(
      { error: "المبلغ يجب أن يكون عددًا صحيحًا غير صفري" },
      { status: 400 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Get current balance ──────────────────────────────────────────────────
    const { data: lawyerProfile, error: lpError } = await adminClient
      .from("lawyer_profiles")
      .select("user_id, credit_balance")
      .eq("user_id", user_id)
      .single();

    if (lpError || !lawyerProfile) {
      return NextResponse.json(
        { error: "ملف المحامي غير موجود لهذا المستخدم" },
        { status: 404 },
      );
    }

    const currentBalance = (lawyerProfile.credit_balance as number) ?? 0;
    const newBalance = currentBalance + amount;

    // ── Prevent negative balance ─────────────────────────────────────────────
    if (newBalance < 0) {
      return NextResponse.json(
        {
          error: `الرصيد غير كافٍ. الرصيد الحالي: ${currentBalance}، المبلغ المطلوب خصمه: ${Math.abs(amount)}`,
        },
        { status: 400 },
      );
    }

    // ── Create transaction record ────────────────────────────────────────────
    const { error: txError } = await adminClient
      .from("credit_transactions")
      .insert({
        user_id,
        amount,
        kind: "admin_adjustment",
        balance_after: newBalance,
        description,
        metadata: {
          adjusted_by: user.id,
          adjusted_at: new Date().toISOString(),
          previous_balance: currentBalance,
        },
      });

    if (txError) {
      return NextResponse.json(
        { error: txError.message },
        { status: 500 },
      );
    }

    // ── Update credit balance ────────────────────────────────────────────────
    const { error: updateError } = await adminClient
      .from("lawyer_profiles")
      .update({
        credit_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        amount > 0
          ? `تمت إضافة ${amount} رصيد بنجاح`
          : `تم خصم ${Math.abs(amount)} رصيد بنجاح`,
      data: {
        user_id,
        previous_balance: currentBalance,
        adjustment: amount,
        new_balance: newBalance,
      },
    });
  } catch (err) {
    console.error("[admin/credits] POST error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تعديل الرصيد" },
      { status: 500 },
    );
  }
}
