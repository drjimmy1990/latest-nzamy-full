import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { parseIsoDate } from "@/lib/services/deadlineEngine";
import {
  CONTRACT_STATUSES, isContractStatus, isContractType,
  isPartyRole, isPartyKind, isEntityType,
} from "@/lib/services/contractVocabulary";
import { ensureRenewalObligation } from "./_obligations";
import {
  CONTRACT_SELECT, ISO_DATE_RE, dbErrorResponse, toContractDto, profileNames, contractListExtras,
  type ContractRow,
} from "./_shared";

/**
 * /api/v1/lawyer/contracts — Phase 3 (مدير العقود).
 *
 * Backed by `public.contracts` (migration
 * 20260905_phase3_consultations_and_contracts.sql). GET lists the caller's
 * (or firm's) contracts; POST creates one, optionally seeding its parties and
 * — whenever it carries an end date — the one renewal-notice obligation
 * `ensureRenewalObligation` keeps in step with `ends_on` / `renewal_notice_days`.
 */

const COMMERCIAL_REGISTER_RE = /^[0-9]{10}$/;

/**
 * GET /api/v1/lawyer/contracts?status=<ContractStatus>|all&limit
 * RLS-scoped, ordered updated_at desc. Response: { data: Contract[], total }.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") || "all";
    if (statusParam !== "all" && !isContractStatus(statusParam)) {
      return NextResponse.json(
        { error: `status يجب أن يكون أحد: ${[...CONTRACT_STATUSES, "all"].join(", ")}` },
        { status: 400 },
      );
    }
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 200;

    let query = supabase.from("contracts").select(CONTRACT_SELECT, { count: "exact" });
    if (statusParam !== "all") query = query.eq("status", statusParam);

    const { data, error, count } = await query.order("updated_at", { ascending: false }).limit(limit);
    if (error) {
      console.error("[lawyer/contracts GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل العقود." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as ContractRow[];
    const ids = rows.map((r) => r.id);
    const [extrasMap, names] = await Promise.all([
      contractListExtras(supabase, ids),
      profileNames(rows.flatMap((r) => [r.owner_user_id, r.client_user_id])),
    ]);

    const dtos = rows.map((r) =>
      toContractDto(r, {
        ownerName: r.owner_user_id ? names.get(r.owner_user_id) ?? null : null,
        clientName: r.client_user_id ? names.get(r.client_user_id) ?? null : null,
        ...(extrasMap.get(r.id) ?? { versionsCount: 0, pendingObligations: 0, nextDueOn: null }),
      }),
    );

    return NextResponse.json({ data: dtos, total: count ?? dtos.length });
  } catch (err) {
    console.error("[lawyer/contracts GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

interface CreatePartyBody {
  role?: string;
  partyKind?: string;
  name?: string;
  entityType?: string;
  lawyerClientId?: string | null;
  commercialRegisterNo?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

interface CreateBody {
  title?: string;
  contractType?: string;
  status?: string;
  counterpartyName?: string | null;
  lawyerClientId?: string | null;
  clientUserId?: string | null;
  valueSar?: number | null;
  currency?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  autoRenew?: boolean;
  renewalNoticeDays?: number;
  signedOn?: string | null;
  notes?: string;
  parties?: CreatePartyBody[];
}

function isIsoOrNull(value: string | null | undefined): boolean {
  return value === undefined || value === null || (ISO_DATE_RE.test(value) && !!parseIsoDate(value));
}

/**
 * Best-effort — the contract row is already committed by the time this runs.
 * An invalid party in the array is skipped (and logged), never fails the
 * request; `position` mirrors the party's index in the submitted array.
 */
async function insertParties(
  supabase: SupabaseClient,
  contractId: string,
  parties: CreatePartyBody[],
): Promise<void> {
  try {
    const rows: Record<string, unknown>[] = [];
    parties.forEach((p, index) => {
      if (!p || typeof p !== "object") {
        console.error("[lawyer/contracts POST] skipping non-object party at index", index);
        return;
      }
      const name = typeof p.name === "string" ? p.name.trim() : "";
      if (!isPartyRole(p.role) || !isPartyKind(p.partyKind) || !isEntityType(p.entityType) || !name) {
        console.error("[lawyer/contracts POST] skipping invalid party at index", index);
        return;
      }
      const commercialRegisterNo = p.commercialRegisterNo ?? null;
      if (commercialRegisterNo !== null && !COMMERCIAL_REGISTER_RE.test(commercialRegisterNo)) {
        console.error("[lawyer/contracts POST] skipping party with invalid commercial register at index", index);
        return;
      }
      rows.push({
        contract_id: contractId,
        role: p.role,
        party_kind: p.partyKind,
        name,
        entity_type: p.entityType,
        lawyer_client_id: p.lawyerClientId ?? null,
        commercial_register_no: commercialRegisterNo,
        contact_phone: p.contactPhone ?? null,
        contact_email: p.contactEmail ?? null,
        position: index,
      });
    });
    if (rows.length === 0) return;
    const { error } = await supabase.from("contract_parties").insert(rows);
    if (error) console.error("[lawyer/contracts POST] parties insert failed:", error.message, error.code);
  } catch (err) {
    console.error("[lawyer/contracts POST] parties insert threw:", err);
  }
}

/**
 * POST /api/v1/lawyer/contracts — Response: 201 { data: Contract }.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = (await request.json()) as CreateBody;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "عنوان العقد مطلوب." }, { status: 400 });

    if (!isContractType(body.contractType)) {
      return NextResponse.json({ error: "نوع العقد غير صالح." }, { status: 400 });
    }
    const contractType = body.contractType;

    if (body.status !== undefined && !isContractStatus(body.status)) {
      return NextResponse.json({ error: "حالة العقد غير صالحة." }, { status: 400 });
    }
    const status = body.status ?? "draft";

    if (!isIsoOrNull(body.startsOn)) {
      return NextResponse.json({ error: "تاريخ البداية غير صالح." }, { status: 400 });
    }
    const startsOn = body.startsOn ?? null;

    if (!isIsoOrNull(body.endsOn)) {
      return NextResponse.json({ error: "تاريخ النهاية غير صالح." }, { status: 400 });
    }
    const endsOn = body.endsOn ?? null;

    if (startsOn && endsOn && endsOn < startsOn) {
      return NextResponse.json({ error: "تاريخ النهاية لا يسبق تاريخ البداية" }, { status: 400 });
    }

    if (
      body.valueSar !== undefined && body.valueSar !== null &&
      (typeof body.valueSar !== "number" || !Number.isFinite(body.valueSar) || body.valueSar < 0)
    ) {
      return NextResponse.json({ error: "قيمة العقد غير صالحة." }, { status: 400 });
    }
    const valueSar = body.valueSar ?? null;

    const currency = typeof body.currency === "string" && body.currency.trim() ? body.currency.trim() : "SAR";
    const autoRenew = !!body.autoRenew;

    if (
      body.renewalNoticeDays !== undefined &&
      (!Number.isInteger(body.renewalNoticeDays) || body.renewalNoticeDays < 0 || body.renewalNoticeDays > 365)
    ) {
      return NextResponse.json({ error: "أيام إشعار التجديد يجب أن تكون عدداً صحيحاً بين ٠ و٣٦٥." }, { status: 400 });
    }
    const renewalNoticeDays = body.renewalNoticeDays ?? 30;

    if (!isIsoOrNull(body.signedOn)) {
      return NextResponse.json({ error: "تاريخ التوقيع غير صالح." }, { status: 400 });
    }
    const signedOn = body.signedOn ?? null;

    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const counterpartyName =
      typeof body.counterpartyName === "string" ? body.counterpartyName.trim() || null : null;

    let lawyerClientId: string | null = null;
    // The linked lawyer_clients row's own platform account, when it has one —
    // read alongside `id` so a contract created against a client CARD can
    // still reach that client's «عقودي» even when the caller never passes
    // clientUserId explicitly (the create form only knows the client card).
    let linkedClientUserId: string | null = null;
    if (body.lawyerClientId) {
      const { data: clientRow, error: clientErr } = await supabase
        .from("lawyer_clients").select("id, client_user_id").eq("id", body.lawyerClientId).maybeSingle();
      if (clientErr) {
        console.error("[lawyer/contracts POST] lawyer_clients lookup failed:", clientErr.message, clientErr.code);
      }
      if (!clientRow) return NextResponse.json({ error: "بطاقة الموكّل غير موجودة" }, { status: 400 });
      lawyerClientId = clientRow.id as string;
      linkedClientUserId = (clientRow as { client_user_id: string | null }).client_user_id ?? null;
    }

    // clientUserId — an explicit body value (a string, or an explicit
    // null/empty meaning "do not share") always wins. Only when the caller
    // left the field out of the body entirely do we fall back to the linked
    // lawyer_clients row's own platform account — the one path that lets a
    // contract created against a client card reach that client's «عقودي»
    // without the caller having to already know the account id.
    const clientUserIdExplicit =
      body.clientUserId !== undefined
        ? (typeof body.clientUserId === "string" && body.clientUserId.trim() ? body.clientUserId.trim() : null)
        : undefined;
    const clientUserId = clientUserIdExplicit !== undefined ? clientUserIdExplicit : linkedClientUserId;

    // firm_id — ALWAYS resolved server-side from the creator's own active
    // firm_members row (same lookup as service-requests POST), never trusted
    // from the body; sent only when non-null.
    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/contracts POST] firm_members lookup failed:", membershipError.message, membershipError.code);
    }
    const firmId = membership?.firm_id ?? null;

    const { data, error } = await supabase
      .from("contracts")
      .insert({
        owner_user_id: user.id,
        ...(firmId ? { firm_id: firmId } : {}),
        lawyer_client_id: lawyerClientId,
        client_user_id: clientUserId,
        title,
        contract_type: contractType,
        status,
        counterparty_name: counterpartyName,
        value_sar: valueSar,
        currency,
        starts_on: startsOn,
        ends_on: endsOn,
        auto_renew: autoRenew,
        renewal_notice_days: renewalNoticeDays,
        signed_on: signedOn,
        notes,
      })
      .select(CONTRACT_SELECT)
      .single();

    if (error || !data) {
      console.error("[lawyer/contracts POST] insert failed:", error?.message, error?.code);
      const { status: httpStatus, message } = dbErrorResponse(error);
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    const row = data as unknown as ContractRow;

    if (Array.isArray(body.parties) && body.parties.length > 0) {
      await insertParties(supabase, row.id, body.parties);
    }

    await ensureRenewalObligation({
      supabase,
      userId: user.id,
      contract: {
        id: row.id,
        title: row.title,
        firm_id: row.firm_id,
        starts_on: row.starts_on,
        ends_on: row.ends_on,
        renewal_notice_days: row.renewal_notice_days,
        status: row.status,
      },
    });

    const [extrasMap, names] = await Promise.all([
      contractListExtras(supabase, [row.id]),
      profileNames([row.owner_user_id, row.client_user_id]),
    ]);

    return NextResponse.json(
      {
        data: toContractDto(row, {
          ownerName: row.owner_user_id ? names.get(row.owner_user_id) ?? null : null,
          clientName: row.client_user_id ? names.get(row.client_user_id) ?? null : null,
          ...(extrasMap.get(row.id) ?? { versionsCount: 0, pendingObligations: 0, nextDueOn: null }),
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[lawyer/contracts POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
