import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { parseIsoDate } from "@/lib/services/deadlineEngine";
import { isPaymentStage, isPaymentStatus } from "@/lib/services/contractVocabulary";
import { PAYMENT_SELECT, ISO_DATE_RE, toPaymentDto, dbErrorResponse, type PaymentRow } from "../../_shared";

/**
 * POST /api/v1/lawyer/contracts/[id]/payments — Phase 3 (مدير العقود).
 *
 * A payment schedule the lawyer tracks by hand — not an invoice or a ledger
 * (Phase 4, blocked by owner question 3). Nothing here computes a due date.
 */

interface PaymentBody {
  label?: string;
  stage?: string;
  amountSar?: number;
  dueOn?: string | null;
  status?: string;
  paidOn?: string | null;
  position?: number;
  notes?: string;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, title, firm_id, starts_on, status")
      .eq("id", id)
      .maybeSingle();
    if (contractError) {
      console.error("[contracts/payments POST] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const body = (await request.json()) as PaymentBody;
    const { label, stage, amountSar, dueOn, status, paidOn, position, notes } = body;

    const trimmedLabel = typeof label === "string" ? label.trim() : "";
    if (!trimmedLabel) {
      return NextResponse.json({ error: "اسم الدفعة مطلوب." }, { status: 400 });
    }
    if (!isPaymentStage(stage)) {
      return NextResponse.json({ error: "مرحلة الدفعة غير صالحة." }, { status: 400 });
    }
    if (typeof amountSar !== "number" || !Number.isFinite(amountSar) || amountSar <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }
    if (dueOn !== undefined && dueOn !== null) {
      if (!ISO_DATE_RE.test(dueOn) || !parseIsoDate(dueOn)) {
        return NextResponse.json({ error: "تاريخ الاستحقاق يجب أن يكون بصيغة YYYY-MM-DD." }, { status: 400 });
      }
    }

    const resolvedStatus = status !== undefined ? status : "pending";
    if (!isPaymentStatus(resolvedStatus)) {
      return NextResponse.json({ error: "حالة الدفعة غير صالحة." }, { status: 400 });
    }

    if (paidOn !== undefined && paidOn !== null) {
      if (!ISO_DATE_RE.test(paidOn) || !parseIsoDate(paidOn)) {
        return NextResponse.json({ error: "تاريخ السداد يجب أن يكون بصيغة YYYY-MM-DD." }, { status: 400 });
      }
    }
    if (resolvedStatus === "paid" && !paidOn) {
      return NextResponse.json({ error: "حدّد تاريخ السداد" }, { status: 400 });
    }

    let resolvedPosition: number;
    if (position === undefined || position === null) {
      const { count, error: countError } = await supabase
        .from("contract_payments")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", id);
      if (countError) {
        console.error("[contracts/payments POST] position count failed:", countError.message, countError.code);
      }
      resolvedPosition = count ?? 0;
    } else if (Number.isInteger(position) && position >= 0) {
      resolvedPosition = position;
    } else {
      return NextResponse.json({ error: "الترتيب يجب أن يكون رقماً صحيحاً." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contract_payments")
      .insert({
        contract_id: id,
        label: trimmedLabel,
        stage,
        amount_sar: amountSar,
        due_on: dueOn ?? null,
        status: resolvedStatus,
        paid_on: paidOn ?? null,
        position: resolvedPosition,
        notes: typeof notes === "string" ? notes.trim() : "",
      })
      .select(PAYMENT_SELECT)
      .single();

    if (error || !data) {
      const { status: httpStatus, message } = dbErrorResponse(error, "الدفعة");
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    return NextResponse.json({ data: toPaymentDto(data as unknown as PaymentRow) }, { status: 201 });
  } catch (err) {
    console.error("[contracts/payments POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
