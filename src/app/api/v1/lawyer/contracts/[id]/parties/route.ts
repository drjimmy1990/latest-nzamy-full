import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { isPartyRole, isPartyKind, isEntityType } from "@/lib/services/contractVocabulary";
import { normalizeCommercialRegister, isValidCommercialRegister } from "@/lib/services/clientIdentityRules";
import { PARTY_SELECT, toPartyDto, dbErrorResponse, type PartyRow } from "../../_shared";

/**
 * POST /api/v1/lawyer/contracts/[id]/parties — Phase 3 (مدير العقود).
 *
 * A party card on a contract — no national ids here (Phase 2 rule: hash-only,
 * and only on lawyer_clients); a party is linked to a client card instead
 * through `lawyerClientId`. Writes go through RLS (`can_manage_contract`).
 */

interface PartyBody {
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
      console.error("[contracts/parties POST] contract lookup failed:", contractError.message, contractError.code);
    }
    if (!contract) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    const body = (await request.json()) as PartyBody;
    const { role, partyKind, name, entityType, lawyerClientId, commercialRegisterNo, contactPhone, contactEmail, position } = body;

    if (!isPartyRole(role)) {
      return NextResponse.json({ error: "دور الطرف غير صالح." }, { status: 400 });
    }
    if (!isPartyKind(partyKind)) {
      return NextResponse.json({ error: "نوع الطرف غير صالح." }, { status: 400 });
    }
    if (!isEntityType(entityType)) {
      return NextResponse.json({ error: "نوع الكيان غير صالح." }, { status: 400 });
    }
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return NextResponse.json({ error: "اسم الطرف مطلوب." }, { status: 400 });
    }

    let resolvedLawyerClientId: string | null = null;
    if (lawyerClientId !== undefined && lawyerClientId !== null) {
      if (typeof lawyerClientId !== "string" || !lawyerClientId) {
        return NextResponse.json({ error: "بطاقة الموكّل غير موجودة" }, { status: 400 });
      }
      const { data: clientRow, error: clientError } = await supabase
        .from("lawyer_clients")
        .select("id")
        .eq("id", lawyerClientId)
        .maybeSingle();
      if (clientError) {
        console.error("[contracts/parties POST] client lookup failed:", clientError.message, clientError.code);
      }
      if (!clientRow) {
        return NextResponse.json({ error: "بطاقة الموكّل غير موجودة" }, { status: 400 });
      }
      resolvedLawyerClientId = lawyerClientId;
    }

    let resolvedCommercialRegisterNo: string | null = null;
    if (commercialRegisterNo !== undefined && commercialRegisterNo !== null && commercialRegisterNo !== "") {
      if (typeof commercialRegisterNo !== "string" || !isValidCommercialRegister(commercialRegisterNo)) {
        return NextResponse.json({ error: "رقم السجل التجاري يجب أن يتكوّن من ١٠ أرقام." }, { status: 400 });
      }
      resolvedCommercialRegisterNo = normalizeCommercialRegister(commercialRegisterNo);
    }

    if (contactPhone !== undefined && contactPhone !== null && typeof contactPhone !== "string") {
      return NextResponse.json({ error: "رقم الهاتف غير صالح." }, { status: 400 });
    }
    if (contactEmail !== undefined && contactEmail !== null && typeof contactEmail !== "string") {
      return NextResponse.json({ error: "البريد الإلكتروني غير صالح." }, { status: 400 });
    }

    let resolvedPosition: number;
    if (position === undefined || position === null) {
      const { count, error: countError } = await supabase
        .from("contract_parties")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", id);
      if (countError) {
        console.error("[contracts/parties POST] position count failed:", countError.message, countError.code);
      }
      resolvedPosition = count ?? 0;
    } else if (Number.isInteger(position) && position >= 0) {
      resolvedPosition = position;
    } else {
      return NextResponse.json({ error: "الترتيب يجب أن يكون رقماً صحيحاً." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contract_parties")
      .insert({
        contract_id: id,
        role,
        party_kind: partyKind,
        name: trimmedName,
        entity_type: entityType,
        lawyer_client_id: resolvedLawyerClientId,
        commercial_register_no: resolvedCommercialRegisterNo,
        contact_phone: contactPhone ?? null,
        contact_email: contactEmail ?? null,
        position: resolvedPosition,
      })
      .select(PARTY_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = dbErrorResponse(error, "الطرف");
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toPartyDto(data as unknown as PartyRow) }, { status: 201 });
  } catch (err) {
    console.error("[contracts/parties POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
