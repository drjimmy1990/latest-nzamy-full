import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { isPartyRole, isPartyKind, isEntityType } from "@/lib/services/contractVocabulary";
import { normalizeCommercialRegister, isValidCommercialRegister } from "@/lib/services/clientIdentityRules";
import { PARTY_SELECT, toPartyDto, dbErrorResponse, type PartyRow } from "../../../_shared";

/**
 * PATCH/DELETE /api/v1/lawyer/contracts/[id]/parties/[pid] — Phase 3.
 * Writes go through RLS (`can_manage_contract`); an update/delete affecting
 * 0 rows means the party is not on THIS contract — 404, not a silent no-op.
 */

interface PartyPatchBody {
  role?: string;
  partyKind?: string;
  name?: string;
  entityType?: string;
  lawyerClientId?: string | null;
  commercialRegisterNo?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  position?: number;
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
      console.error("[contracts/parties PATCH] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const body = (await request.json()) as PartyPatchBody;
    const patch: Record<string, unknown> = {};

    if (body.role !== undefined) {
      if (!isPartyRole(body.role)) {
        return NextResponse.json({ error: "دور الطرف غير صالح." }, { status: 400 });
      }
      patch.role = body.role;
    }
    if (body.partyKind !== undefined) {
      if (!isPartyKind(body.partyKind)) {
        return NextResponse.json({ error: "نوع الطرف غير صالح." }, { status: 400 });
      }
      patch.party_kind = body.partyKind;
    }
    if (body.entityType !== undefined) {
      if (!isEntityType(body.entityType)) {
        return NextResponse.json({ error: "نوع الكيان غير صالح." }, { status: 400 });
      }
      patch.entity_type = body.entityType;
    }
    if (body.name !== undefined) {
      const trimmedName = typeof body.name === "string" ? body.name.trim() : "";
      if (!trimmedName) {
        return NextResponse.json({ error: "اسم الطرف مطلوب." }, { status: 400 });
      }
      patch.name = trimmedName;
    }
    if (body.lawyerClientId !== undefined) {
      if (body.lawyerClientId === null) {
        patch.lawyer_client_id = null;
      } else {
        if (typeof body.lawyerClientId !== "string" || !body.lawyerClientId) {
          return NextResponse.json({ error: "بطاقة الموكّل غير موجودة" }, { status: 400 });
        }
        const { data: clientRow, error: clientError } = await supabase
          .from("lawyer_clients")
          .select("id")
          .eq("id", body.lawyerClientId)
          .maybeSingle();
        if (clientError) {
          console.error("[contracts/parties PATCH] client lookup failed:", clientError.message, clientError.code);
        }
        if (!clientRow) {
          return NextResponse.json({ error: "بطاقة الموكّل غير موجودة" }, { status: 400 });
        }
        patch.lawyer_client_id = body.lawyerClientId;
      }
    }
    if (body.commercialRegisterNo !== undefined) {
      if (body.commercialRegisterNo === null || body.commercialRegisterNo === "") {
        patch.commercial_register_no = null;
      } else if (typeof body.commercialRegisterNo !== "string" || !isValidCommercialRegister(body.commercialRegisterNo)) {
        return NextResponse.json({ error: "رقم السجل التجاري يجب أن يتكوّن من ١٠ أرقام." }, { status: 400 });
      } else {
        patch.commercial_register_no = normalizeCommercialRegister(body.commercialRegisterNo);
      }
    }
    if (body.contactPhone !== undefined) {
      if (body.contactPhone !== null && typeof body.contactPhone !== "string") {
        return NextResponse.json({ error: "رقم الهاتف غير صالح." }, { status: 400 });
      }
      patch.contact_phone = body.contactPhone ?? null;
    }
    if (body.contactEmail !== undefined) {
      if (body.contactEmail !== null && typeof body.contactEmail !== "string") {
        return NextResponse.json({ error: "البريد الإلكتروني غير صالح." }, { status: 400 });
      }
      patch.contact_email = body.contactEmail ?? null;
    }
    if (body.position !== undefined) {
      if (!Number.isInteger(body.position) || body.position < 0) {
        return NextResponse.json({ error: "الترتيب يجب أن يكون رقماً صحيحاً." }, { status: 400 });
      }
      patch.position = body.position;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contract_parties")
      .update(patch)
      .eq("id", pid)
      .eq("contract_id", id)
      .select(PARTY_SELECT)
      .maybeSingle();

    if (error) {
      const { status, message } = dbErrorResponse(error, "الطرف");
      return NextResponse.json({ error: message }, { status });
    }
    if (!data) {
      return NextResponse.json({ error: "الطرف غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ data: toPartyDto(data as unknown as PartyRow) });
  } catch (err) {
    console.error("[contracts/parties PATCH] Unexpected error:", err);
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
      console.error("[contracts/parties DELETE] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const { error, count } = await supabase
      .from("contract_parties")
      .delete({ count: "exact" })
      .eq("id", pid)
      .eq("contract_id", id);

    if (error) {
      console.error("[contracts/parties DELETE] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر حذف الطرف." }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: "الطرف غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contracts/parties DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف الطرف." }, { status: 500 });
  }
}
