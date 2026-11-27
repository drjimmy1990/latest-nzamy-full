import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { TIME_SELECT, parseTimePatch, riyadhDay, toTimeDto, type TimeRow } from "@/lib/financeLedger/financeLedgerRules";
import { UUID_RE, errorResponse, labelRows } from "../../_financeLedger/server";

/**
 * PATCH /api/v1/lawyer/time-entries/[id]
 *   { void: true, reason }  — void with a reason (the writer or a firm finance
 *                             role). A voided entry never changes again and
 *                             leaves every statement.
 *   { workDate?, durationMin?, description?, hourlyRateHalalas?, billable? }
 *                           — the writer, while the entry is neither voided
 *                             nor billed (the guard trigger of 20261126_40).
 * There is no DELETE: void with a reason instead (owner F3/F4).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    // Owner ق٢٦-٤ / ق٢٦-٥: «finance» is «إدارة المكتب» — refused on the free side.
    const officeLocked = await officePlanRefusal(auth.supabase, "finance", auth.userType);
    if (officeLocked) return officeLocked;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "القيد غير موجود." }, { status: 404 });

    const parsed = parseTimePatch(await request.json().catch(() => null), riyadhDay(Date.now()));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const patch = parsed.value.kind === "void"
      ? { voided_at: new Date().toISOString(), void_reason: parsed.value.reason }
      : parsed.value.row;

    const { data, error } = await supabase
      .from("time_entries")
      .update(patch)
      .eq("id", id)
      .select(TIME_SELECT)
      .maybeSingle();
    if (error) return errorResponse(error, "lawyer/time-entries PATCH");
    if (!data) return NextResponse.json({ error: "القيد غير موجود أو لا تملك تعديله." }, { status: 404 });
    const row = data as unknown as TimeRow;
    const names = await labelRows(supabase, [row]);
    return NextResponse.json({ data: toTimeDto(row, user.id, names(row)) });
  } catch (err) {
    console.error("[lawyer/time-entries PATCH] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تعديل قيد الوقت." }, { status: 500 });
  }
}
