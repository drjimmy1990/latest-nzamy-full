import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { parseIsoDate } from "@/lib/services/deadlineEngine";
import { isObligationKind, isObligationStatus } from "@/lib/services/contractVocabulary";
import { OBLIGATION_SELECT, ISO_DATE_RE, toObligationDto, dbErrorResponse, type ObligationRow } from "../../../_shared";
import { syncObligationDeadline, cancelObligationDeadline } from "../../../_obligations";

/**
 * PATCH/DELETE /api/v1/lawyer/contracts/[id]/obligations/[oid] — Phase 3.
 *
 * A re-dated / completed / cancelled / reopened obligation moves its radar
 * deadline the same way (`syncObligationDeadline`); deleting one cancels the
 * deadline rather than deleting it, so history stays on رادار المهل.
 */

interface ObligationPatchBody {
  title?: string;
  kind?: string;
  dueOn?: string;
  responsiblePartyId?: string | null;
  status?: string;
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; oid: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const { id, oid } = await context.params;

    const { contract, error: contractError } = await resolveContract(supabase, id);
    if (contractError) {
      console.error("[contracts/obligations PATCH] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const { data: previousRow, error: previousError } = await supabase
      .from("contract_obligations")
      .select(OBLIGATION_SELECT)
      .eq("id", oid)
      .eq("contract_id", id)
      .maybeSingle();
    if (previousError) {
      console.error("[contracts/obligations PATCH] lookup failed:", previousError.message, previousError.code);
    }
    if (!previousRow) {
      return NextResponse.json({ error: "الالتزام غير موجود" }, { status: 404 });
    }
    const previous = previousRow as unknown as ObligationRow;

    const body = (await request.json()) as ObligationPatchBody;
    const patch: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const trimmedTitle = typeof body.title === "string" ? body.title.trim() : "";
      if (!trimmedTitle) {
        return NextResponse.json({ error: "عنوان الالتزام مطلوب." }, { status: 400 });
      }
      patch.title = trimmedTitle;
    }
    if (body.kind !== undefined) {
      if (!isObligationKind(body.kind)) {
        return NextResponse.json({ error: "نوع الالتزام غير صالح." }, { status: 400 });
      }
      patch.kind = body.kind;
    }
    if (body.dueOn !== undefined) {
      if (!body.dueOn || !ISO_DATE_RE.test(body.dueOn) || !parseIsoDate(body.dueOn)) {
        return NextResponse.json({ error: "تاريخ الاستحقاق مطلوب بصيغة YYYY-MM-DD." }, { status: 400 });
      }
      patch.due_on = body.dueOn;
    }
    if (body.responsiblePartyId !== undefined) {
      if (body.responsiblePartyId === null) {
        patch.responsible_party_id = null;
      } else {
        if (typeof body.responsiblePartyId !== "string" || !body.responsiblePartyId) {
          return NextResponse.json({ error: "الطرف المسؤول غير موجود في هذا العقد." }, { status: 400 });
        }
        const { data: partyRow, error: partyError } = await supabase
          .from("contract_parties")
          .select("id")
          .eq("id", body.responsiblePartyId)
          .eq("contract_id", id)
          .maybeSingle();
        if (partyError) {
          console.error("[contracts/obligations PATCH] party lookup failed:", partyError.message, partyError.code);
        }
        if (!partyRow) {
          return NextResponse.json({ error: "الطرف المسؤول غير موجود في هذا العقد." }, { status: 400 });
        }
        patch.responsible_party_id = body.responsiblePartyId;
      }
    }
    if (body.status !== undefined) {
      if (!isObligationStatus(body.status)) {
        return NextResponse.json({ error: "حالة الالتزام غير صالحة." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === "string" ? body.notes.trim() : "";
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from("contract_obligations")
      .update(patch)
      .eq("id", oid)
      .eq("contract_id", id)
      .select(OBLIGATION_SELECT)
      .maybeSingle();
    if (updateError) {
      const { status, message } = dbErrorResponse(updateError, "الالتزام");
      return NextResponse.json({ error: message }, { status });
    }
    if (!updatedRow) {
      return NextResponse.json({ error: "الالتزام غير موجود" }, { status: 404 });
    }
    const current = updatedRow as unknown as ObligationRow;

    await syncObligationDeadline({ supabase, userId: user.id, contract, previous, current });

    const { data: finalRow, error: finalError } = await supabase
      .from("contract_obligations")
      .select(OBLIGATION_SELECT)
      .eq("id", oid)
      .maybeSingle();
    if (finalError) {
      console.error("[contracts/obligations PATCH] re-read failed:", finalError.message, finalError.code);
    }
    const result = (finalRow ?? updatedRow) as unknown as ObligationRow;

    return NextResponse.json({ data: toObligationDto(result) });
  } catch (err) {
    console.error("[contracts/obligations PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; oid: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, oid } = await context.params;

    const { contract, error: contractError } = await resolveContract(supabase, id);
    if (contractError) {
      console.error("[contracts/obligations DELETE] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const { data: row, error: rowError } = await supabase
      .from("contract_obligations")
      .select("id, deadline_id")
      .eq("id", oid)
      .eq("contract_id", id)
      .maybeSingle();
    if (rowError) {
      console.error("[contracts/obligations DELETE] lookup failed:", rowError.message, rowError.code);
    }
    if (!row) {
      return NextResponse.json({ error: "الالتزام غير موجود" }, { status: 404 });
    }

    await cancelObligationDeadline(supabase, (row as { deadline_id: string | null }).deadline_id);

    const { error: deleteError, count } = await supabase
      .from("contract_obligations")
      .delete({ count: "exact" })
      .eq("id", oid)
      .eq("contract_id", id);
    if (deleteError) {
      console.error("[contracts/obligations DELETE] delete failed:", deleteError.message, deleteError.code);
      return NextResponse.json({ error: "تعذّر حذف الالتزام." }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: "الالتزام غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contracts/obligations DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف الالتزام." }, { status: 500 });
  }
}
