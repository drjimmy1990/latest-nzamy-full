import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isConsultationStatus, CONSULTATION_STATUSES } from "@/lib/services/consultationVocabulary";

/**
 * GET /api/v1/consultations/[id] — Get consultation detail
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const { data, error } = await supabase
    .from("consultations")
    .select("*")
    .eq("id", id)
    .or(`requester_user_id.eq.${user.id},lawyer_user_id.eq.${user.id}`)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Consultation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ data });
}

/**
 * PATCH /api/v1/consultations/[id] — Update consultation
 * Body: { status?, scheduled_at? }
 *
 * `notes` was removed from the allow-list (2026-09-05, phase 3): the column
 * never existed on `consultations` — 20260905_phase3_consultations_and_
 * contracts.sql keeps the lawyer's private notes in `consultation_notes`
 * instead (DECISION 3), reachable through
 * /api/v1/lawyer/consultations/[id]/notes, not through this row.
 *
 * `status`/`scheduled_at` change the LAWYER's working record, not the
 * client's request — 20260905's "consultations update" RLS policy scopes the
 * UPDATE to `can_access_case_row(lawyer_user_id, firm_id)` only; a client
 * cancels through their service request instead (a trigger carries that over
 * to this row). Rather than re-deriving that membership test in JS, this
 * route lets RLS decide and reads its answer off the write: a caller RLS
 * refuses updates zero rows, which is indistinguishable here from "no such
 * id" — both come back as the one 403 below, which is fine for the id case
 * too since it never leaks whether the id exists.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const body = await request.json();
  const allowedFields = ["status", "scheduled_at"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  if ("status" in updates && !isConsultationStatus(updates.status)) {
    return NextResponse.json(
      { error: `status يجب أن يكون أحد: ${CONSULTATION_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  if ("scheduled_at" in updates) {
    const v = updates.scheduled_at;
    if (v !== null && (typeof v !== "string" || Number.isNaN(Date.parse(v)))) {
      return NextResponse.json({ error: "موعد الاستشارة غير صالح." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("consultations")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[consultations/[id] PATCH] update failed:", error.message, error.code);
    return NextResponse.json({ error: "تعذّر تحديث الاستشارة." }, { status: 500 });
  }
  if (!data) {
    // 0 rows affected — the RLS "consultations update" policy is lawyer-side
    // only (can_access_case_row(lawyer_user_id, firm_id)); a client account
    // hitting this route always lands here.
    return NextResponse.json(
      { error: "لا يمكن للعميل تغيير حالة الاستشارة — تواصل مع محاميك أو ألغِ الطلب من صفحته" },
      { status: 403 },
    );
  }

  return NextResponse.json({ data });
}
