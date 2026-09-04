import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { parseIsoDate } from "@/lib/services/deadlineEngine";
import { isObligationKind, isObligationStatus } from "@/lib/services/contractVocabulary";
import { OBLIGATION_SELECT, ISO_DATE_RE, toObligationDto, dbErrorResponse, type ObligationRow } from "../../_shared";
import { createDeadlineForObligation } from "../../_obligations";

/**
 * POST /api/v1/lawyer/contracts/[id]/obligations — Phase 3 (مدير العقود).
 *
 * A contract obligation carries a plain date (`due_on`); by default (unless
 * `createDeadline: false`) a pending obligation also becomes a رادار المهل
 * deadline through `createDeadlineForObligation` (item 116). Nothing here
 * computes a due date — it is the contract's own.
 */

interface ObligationBody {
  title?: string;
  kind?: string;
  dueOn?: string;
  responsiblePartyId?: string | null;
  status?: string;
  notes?: string;
  createDeadline?: boolean;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const { id } = await context.params;

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, title, firm_id, starts_on, status")
      .eq("id", id)
      .maybeSingle();
    if (contractError) {
      console.error("[contracts/obligations POST] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const body = (await request.json()) as ObligationBody;
    const { title, kind, dueOn, responsiblePartyId, status, notes, createDeadline } = body;

    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    if (!trimmedTitle) {
      return NextResponse.json({ error: "عنوان الالتزام مطلوب." }, { status: 400 });
    }
    if (!isObligationKind(kind)) {
      return NextResponse.json({ error: "نوع الالتزام غير صالح." }, { status: 400 });
    }
    if (!dueOn || !ISO_DATE_RE.test(dueOn) || !parseIsoDate(dueOn)) {
      return NextResponse.json({ error: "تاريخ الاستحقاق مطلوب بصيغة YYYY-MM-DD." }, { status: 400 });
    }

    let resolvedResponsiblePartyId: string | null = null;
    if (responsiblePartyId !== undefined && responsiblePartyId !== null) {
      if (typeof responsiblePartyId !== "string" || !responsiblePartyId) {
        return NextResponse.json({ error: "الطرف المسؤول غير موجود في هذا العقد." }, { status: 400 });
      }
      const { data: partyRow, error: partyError } = await supabase
        .from("contract_parties")
        .select("id")
        .eq("id", responsiblePartyId)
        .eq("contract_id", id)
        .maybeSingle();
      if (partyError) {
        console.error("[contracts/obligations POST] party lookup failed:", partyError.message, partyError.code);
      }
      if (!partyRow) {
        return NextResponse.json({ error: "الطرف المسؤول غير موجود في هذا العقد." }, { status: 400 });
      }
      resolvedResponsiblePartyId = responsiblePartyId;
    }

    const resolvedStatus = status !== undefined ? status : "pending";
    if (!isObligationStatus(resolvedStatus)) {
      return NextResponse.json({ error: "حالة الالتزام غير صالحة." }, { status: 400 });
    }

    const shouldCreateDeadline = createDeadline !== false; // default true

    const { data, error } = await supabase
      .from("contract_obligations")
      .insert({
        contract_id: id,
        title: trimmedTitle,
        kind,
        due_on: dueOn,
        responsible_party_id: resolvedResponsiblePartyId,
        status: resolvedStatus,
        notes: typeof notes === "string" ? notes.trim() : "",
      })
      .select(OBLIGATION_SELECT)
      .single();

    if (error || !data) {
      const { status: httpStatus, message } = dbErrorResponse(error, "الالتزام");
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    let row = data as unknown as ObligationRow;

    if (shouldCreateDeadline && row.status === "pending") {
      await createDeadlineForObligation({
        supabase,
        userId: user.id,
        contract,
        obligation: { id: row.id, title: row.title, kind: row.kind, due_on: row.due_on },
      });
      const { data: refreshed, error: refreshError } = await supabase
        .from("contract_obligations")
        .select(OBLIGATION_SELECT)
        .eq("id", row.id)
        .maybeSingle();
      if (refreshError) {
        console.error("[contracts/obligations POST] re-read failed:", refreshError.message, refreshError.code);
      }
      if (refreshed) row = refreshed as unknown as ObligationRow;
    }

    return NextResponse.json({ data: toObligationDto(row) }, { status: 201 });
  } catch (err) {
    console.error("[contracts/obligations POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
