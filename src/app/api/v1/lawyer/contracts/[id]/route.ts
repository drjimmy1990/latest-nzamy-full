import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { isoDate, parseIsoDate } from "@/lib/services/deadlineEngine";
import { isContractStatus, isContractType, contractTransitionIssue, type ContractStatus } from "@/lib/services/contractVocabulary";
import { ensureRenewalObligation } from "../_obligations";
import {
  CONTRACT_SELECT, ISO_DATE_RE, dbErrorResponse, toContractDto, profileNames, contractListExtras,
  loadContractDetail, type ContractRow,
} from "../_shared";

/**
 * /api/v1/lawyer/contracts/[id] — Phase 3 (مدير العقود). See ../route.ts.
 */

/** PostgREST's code for «the filter matched zero rows» on `.single()`. */
const PGRST_NO_ROWS = "PGRST116";

function isIsoOrNull(value: string | null | undefined): boolean {
  return value === undefined || value === null || (ISO_DATE_RE.test(value) && !!parseIsoDate(value));
}

/**
 * GET /api/v1/lawyer/contracts/[id] — Response: { data: ContractDetail }.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    const detail = await loadContractDetail(supabase, id);
    if (!detail) return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });

    return NextResponse.json({ data: detail });
  } catch (err) {
    console.error("[lawyer/contracts/[id] GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل العقد." }, { status: 500 });
  }
}

interface UpdateBody {
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
}

/**
 * PATCH /api/v1/lawyer/contracts/[id] — Response: { data: Contract }.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { data: currentData, error: readError } = await supabase
      .from("contracts").select(CONTRACT_SELECT).eq("id", id).maybeSingle();
    if (readError) {
      console.error("[lawyer/contracts PATCH] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل العقد." }, { status: 500 });
    }
    if (!currentData) return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    const current = currentData as unknown as ContractRow;

    const body = (await request.json()) as UpdateBody;

    // status — transition guard
    let nextStatus: ContractStatus = current.status as ContractStatus;
    if (body.status !== undefined) {
      if (!isContractStatus(body.status)) {
        return NextResponse.json({ error: "حالة العقد غير صالحة." }, { status: 400 });
      }
      const issue = contractTransitionIssue(current.status as ContractStatus, body.status);
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
      nextStatus = body.status;
    }

    let title: string | undefined;
    if (body.title !== undefined) {
      title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return NextResponse.json({ error: "عنوان العقد مطلوب." }, { status: 400 });
    }

    let contractType: string | undefined;
    if (body.contractType !== undefined) {
      if (!isContractType(body.contractType)) {
        return NextResponse.json({ error: "نوع العقد غير صالح." }, { status: 400 });
      }
      contractType = body.contractType;
    }

    let startsOn: string | null | undefined;
    if (body.startsOn !== undefined) {
      if (!isIsoOrNull(body.startsOn)) return NextResponse.json({ error: "تاريخ البداية غير صالح." }, { status: 400 });
      startsOn = body.startsOn;
    }
    let endsOn: string | null | undefined;
    if (body.endsOn !== undefined) {
      if (!isIsoOrNull(body.endsOn)) return NextResponse.json({ error: "تاريخ النهاية غير صالح." }, { status: 400 });
      endsOn = body.endsOn;
    }
    const effectiveStartsOn = startsOn !== undefined ? startsOn : current.starts_on;
    const effectiveEndsOn = endsOn !== undefined ? endsOn : current.ends_on;
    if (effectiveStartsOn && effectiveEndsOn && effectiveEndsOn < effectiveStartsOn) {
      return NextResponse.json({ error: "تاريخ النهاية لا يسبق تاريخ البداية" }, { status: 400 });
    }

    let valueSar: number | null | undefined;
    if (body.valueSar !== undefined) {
      if (body.valueSar !== null && (typeof body.valueSar !== "number" || !Number.isFinite(body.valueSar) || body.valueSar < 0)) {
        return NextResponse.json({ error: "قيمة العقد غير صالحة." }, { status: 400 });
      }
      valueSar = body.valueSar;
    }

    let currency: string | undefined;
    if (body.currency !== undefined) {
      currency = typeof body.currency === "string" && body.currency.trim() ? body.currency.trim() : "SAR";
    }

    const autoRenew = body.autoRenew !== undefined ? !!body.autoRenew : undefined;

    let renewalNoticeDays: number | undefined;
    if (body.renewalNoticeDays !== undefined) {
      if (!Number.isInteger(body.renewalNoticeDays) || body.renewalNoticeDays < 0 || body.renewalNoticeDays > 365) {
        return NextResponse.json({ error: "أيام إشعار التجديد يجب أن تكون عدداً صحيحاً بين ٠ و٣٦٥." }, { status: 400 });
      }
      renewalNoticeDays = body.renewalNoticeDays;
    }

    let signedOn: string | null | undefined;
    if (body.signedOn !== undefined) {
      if (!isIsoOrNull(body.signedOn)) return NextResponse.json({ error: "تاريخ التوقيع غير صالح." }, { status: 400 });
      signedOn = body.signedOn;
    }

    const notes = body.notes !== undefined ? (typeof body.notes === "string" ? body.notes.trim() : "") : undefined;
    const counterpartyName =
      body.counterpartyName !== undefined
        ? (typeof body.counterpartyName === "string" ? body.counterpartyName.trim() || null : null)
        : undefined;

    let lawyerClientId: string | null | undefined;
    // Set only when this PATCH re-links to a client CARD that itself carries
    // a platform account — see the clientUserId fallback below. Left null
    // when lawyerClientId is being cleared (unlinked), so that branch cannot
    // contribute a fallback value.
    let linkedClientUserId: string | null = null;
    if (body.lawyerClientId !== undefined) {
      if (body.lawyerClientId) {
        const { data: clientRow, error: clientErr } = await supabase
          .from("lawyer_clients").select("id, client_user_id").eq("id", body.lawyerClientId).maybeSingle();
        if (clientErr) {
          console.error("[lawyer/contracts PATCH] lawyer_clients lookup failed:", clientErr.message, clientErr.code);
        }
        if (!clientRow) return NextResponse.json({ error: "بطاقة الموكّل غير موجودة" }, { status: 400 });
        lawyerClientId = clientRow.id as string;
        linkedClientUserId = (clientRow as { client_user_id: string | null }).client_user_id ?? null;
      } else {
        // Unlinking the client card. `client_user_id` — the platform account
        // the contract is actually SHARED with — is left untouched: clearing
        // the CRM link must not silently un-share a contract the client can
        // already see under «عقودي». An explicit clientUserId in this same
        // body (handled below) can still change it.
        lawyerClientId = null;
      }
    }

    // clientUserId — an explicit body value (a string, or an explicit
    // null/empty meaning "un-share") always wins. Only when the caller PATCHes
    // a new lawyerClientId AND leaves clientUserId out of the body entirely do
    // we adopt that client card's own platform account, mirroring POST — and
    // only when that card actually has one (linkedClientUserId is null both
    // when lawyerClientId was not touched this call and when the linked card
    // has no account, so nothing is patched in either case).
    const clientUserId =
      body.clientUserId !== undefined
        ? (typeof body.clientUserId === "string" && body.clientUserId.trim() ? body.clientUserId.trim() : null)
        : (linkedClientUserId ?? undefined);

    // status BECOMES active in this PATCH (not merely "is already active" —
    // that must not stamp a signature date on an unrelated field edit), no
    // signed_on yet, and none given in this PATCH: stamp today.
    const signedOnAutoSet =
      body.status === "active" && current.signed_on === null && body.signedOn === undefined
        ? isoDate(new Date())
        : undefined;

    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (contractType !== undefined) patch.contract_type = contractType;
    if (body.status !== undefined) patch.status = nextStatus;
    if (counterpartyName !== undefined) patch.counterparty_name = counterpartyName;
    if (lawyerClientId !== undefined) patch.lawyer_client_id = lawyerClientId;
    if (clientUserId !== undefined) patch.client_user_id = clientUserId;
    if (valueSar !== undefined) patch.value_sar = valueSar;
    if (currency !== undefined) patch.currency = currency;
    if (startsOn !== undefined) patch.starts_on = startsOn;
    if (endsOn !== undefined) patch.ends_on = endsOn;
    if (autoRenew !== undefined) patch.auto_renew = autoRenew;
    if (renewalNoticeDays !== undefined) patch.renewal_notice_days = renewalNoticeDays;
    if (signedOn !== undefined) patch.signed_on = signedOn;
    if (signedOnAutoSet !== undefined) patch.signed_on = signedOnAutoSet;
    if (notes !== undefined) patch.notes = notes;

    let updatedRow: ContractRow = current;
    if (Object.keys(patch).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from("contracts")
        .update(patch)
        .eq("id", id)
        .select(CONTRACT_SELECT)
        .single();

      if (updateError) {
        if (updateError.code === "42501" || updateError.code === PGRST_NO_ROWS) {
          return NextResponse.json({ error: "غير مصرح لك بتعديل هذا العقد" }, { status: 403 });
        }
        console.error("[lawyer/contracts PATCH] update failed:", updateError.message, updateError.code);
        const { status: httpStatus, message } = dbErrorResponse(updateError);
        return NextResponse.json({ error: message }, { status: httpStatus });
      }
      if (!updated) return NextResponse.json({ error: "غير مصرح لك بتعديل هذا العقد" }, { status: 403 });
      updatedRow = updated as unknown as ContractRow;
    }

    if (body.endsOn !== undefined || body.renewalNoticeDays !== undefined || body.status !== undefined) {
      await ensureRenewalObligation({
        supabase,
        userId: user.id,
        contract: {
          id: updatedRow.id,
          title: updatedRow.title,
          firm_id: updatedRow.firm_id,
          starts_on: updatedRow.starts_on,
          ends_on: updatedRow.ends_on,
          renewal_notice_days: updatedRow.renewal_notice_days,
          status: updatedRow.status,
        },
      });
    }

    const [extrasMap, names] = await Promise.all([
      contractListExtras(supabase, [updatedRow.id]),
      profileNames([updatedRow.owner_user_id, updatedRow.client_user_id]),
    ]);

    return NextResponse.json({
      data: toContractDto(updatedRow, {
        ownerName: updatedRow.owner_user_id ? names.get(updatedRow.owner_user_id) ?? null : null,
        clientName: updatedRow.client_user_id ? names.get(updatedRow.client_user_id) ?? null : null,
        ...(extrasMap.get(updatedRow.id) ?? { versionsCount: 0, pendingObligations: 0, nextDueOn: null }),
      }),
    });
  } catch (err) {
    console.error("[lawyer/contracts PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
