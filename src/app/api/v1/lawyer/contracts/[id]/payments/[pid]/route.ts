import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { parseIsoDate } from "@/lib/services/deadlineEngine";
import { isPaymentStage, isPaymentStatus } from "@/lib/services/contractVocabulary";
import { PAYMENT_SELECT, ISO_DATE_RE, toPaymentDto, dbErrorResponse, type PaymentRow } from "../../../_shared";

/**
 * PATCH/DELETE /api/v1/lawyer/contracts/[id]/payments/[pid] — Phase 3.
 *
 * `status = 'paid'` always requires a `paidOn` — checked against the row
 * that would result AFTER this patch is applied (previous + patch merged),
 * not against the patch alone, so a lawyer can send `{ paidOn }` on its own
 * once `status` is already `paid`.
 */

interface PaymentPatchBody {
  label?: string;
  stage?: string;
  amountSar?: number;
  dueOn?: string | null;
  status?: string;
  paidOn?: string | null;
  position?: number;
  notes?: string;
}

async function resolveContract(supabase: SupabaseClient, id: string) {
  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, title, firm_id, starts_on, status")
    .eq("id", id)
    .maybeSingle();
  return { contract, error };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; pid: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, pid } = await context.params;

    const { contract, error: contractError } = await resolveContract(supabase, id);
    if (contractError) {
      console.error("[contracts/payments PATCH] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const { data: previousRow, error: previousError } = await supabase
      .from("contract_payments")
      .select(PAYMENT_SELECT)
      .eq("id", pid)
      .eq("contract_id", id)
      .maybeSingle();
    if (previousError) {
      console.error("[contracts/payments PATCH] lookup failed:", previousError.message, previousError.code);
    }
    if (!previousRow) {
      return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
    }
    const previous = previousRow as unknown as PaymentRow;

    const body = (await request.json()) as PaymentPatchBody;
    const patch: Record<string, unknown> = {};

    if (body.label !== undefined) {
      const trimmedLabel = typeof body.label === "string" ? body.label.trim() : "";
      if (!trimmedLabel) {
        return NextResponse.json({ error: "اسم الدفعة مطلوب." }, { status: 400 });
      }
      patch.label = trimmedLabel;
    }
    if (body.stage !== undefined) {
      if (!isPaymentStage(body.stage)) {
        return NextResponse.json({ error: "مرحلة الدفعة غير صالحة." }, { status: 400 });
      }
      patch.stage = body.stage;
    }
    if (body.amountSar !== undefined) {
      if (typeof body.amountSar !== "number" || !Number.isFinite(body.amountSar) || body.amountSar <= 0) {
        return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
      }
      patch.amount_sar = body.amountSar;
    }
    if (body.dueOn !== undefined) {
      if (body.dueOn !== null && (!ISO_DATE_RE.test(body.dueOn) || !parseIsoDate(body.dueOn))) {
        return NextResponse.json({ error: "تاريخ الاستحقاق يجب أن يكون بصيغة YYYY-MM-DD." }, { status: 400 });
      }
      patch.due_on = body.dueOn;
    }
    if (body.status !== undefined) {
      if (!isPaymentStatus(body.status)) {
        return NextResponse.json({ error: "حالة الدفعة غير صالحة." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.paidOn !== undefined) {
      if (body.paidOn !== null && (!ISO_DATE_RE.test(body.paidOn) || !parseIsoDate(body.paidOn))) {
        return NextResponse.json({ error: "تاريخ السداد يجب أن يكون بصيغة YYYY-MM-DD." }, { status: 400 });
      }
      patch.paid_on = body.paidOn;
    }
    if (body.position !== undefined) {
      if (!Number.isInteger(body.position) || body.position < 0) {
        return NextResponse.json({ error: "الترتيب يجب أن يكون رقماً صحيحاً." }, { status: 400 });
      }
      patch.position = body.position;
    }
    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === "string" ? body.notes.trim() : "";
    }

    // status/paidOn pair checked against the MERGED row (previous + patch).
    const mergedStatus = body.status !== undefined ? body.status : previous.status;
    const mergedPaidOn = body.paidOn !== undefined ? body.paidOn : previous.paid_on;
    if (mergedStatus === "paid" && !mergedPaidOn) {
      return NextResponse.json({ error: "حدّد تاريخ السداد" }, { status: 400 });
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contract_payments")
      .update(patch)
      .eq("id", pid)
      .eq("contract_id", id)
      .select(PAYMENT_SELECT)
      .maybeSingle();

    if (error) {
      const { status: httpStatus, message } = dbErrorResponse(error, "الدفعة");
      return NextResponse.json({ error: message }, { status: httpStatus });
    }
    if (!data) {
      return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({ data: toPaymentDto(data as unknown as PaymentRow) });
  } catch (err) {
    console.error("[contracts/payments PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; pid: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, pid } = await context.params;

    const { contract, error: contractError } = await resolveContract(supabase, id);
    if (contractError) {
      console.error("[contracts/payments DELETE] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const { error, count } = await supabase
      .from("contract_payments")
      .delete({ count: "exact" })
      .eq("id", pid)
      .eq("contract_id", id);

    if (error) {
      console.error("[contracts/payments DELETE] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الدفعة." }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contracts/payments DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف الدفعة." }, { status: 500 });
  }
}
