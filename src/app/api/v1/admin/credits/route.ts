import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { adjustPointsWith } from "@/lib/payments/pointsAdmin";

/**
 * POST /api/v1/admin/credits — Grant or adjust credits for a user
 *
 * Body: {
 *   user_id: string,
 *   amount: number,       // positive = grant, negative = deduct
 *   description: string
 * }
 *
 * - Adjusts the authoritative points lots through service-only RPCs
 * - Returns the new balance
 *
 * Requires: a staff role with credits.adjust (owner ٢١٠)
 */
export async function POST(request: NextRequest) {
  // ── Staff gate (owner ٢١٠) ─────────────────────────────────────────────────
  const gate = await requireStaff("credits.adjust");
  if (!gate.ok) return gate.response;

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
    const expires = new Date();
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    const changed = await adjustPointsWith(adminClient, { userId: user_id, amount, ref: `admin:${gate.userId}:${description}`, expiresAt: expires });
    if (!changed.ok) return NextResponse.json({ error: changed.error }, { status: changed.error.includes("غير كافٍ") ? 400 : 503 });
    const currentBalance = changed.previous_balance;
    const newBalance = changed.new_balance;

    await logAdminAction({
      actorId: gate.userId,
      action: "credits_adjusted",
      targetType: "profile",
      targetId: user_id,
      before: { credit_balance: currentBalance },
      after: { credit_balance: newBalance },
      metadata: { amount, description },
    });

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
      { status: 503 },
    );
  }
}
