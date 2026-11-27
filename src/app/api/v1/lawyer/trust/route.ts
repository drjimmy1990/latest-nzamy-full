import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import {
  LIST_PAGE_SIZE,
  TRUST_SELECT,
  needsNegativeConfirmation,
  parseListFilters,
  parseTrustCreate,
  riyadhDay,
  toTrustDto,
  trustBalanceAfter,
  type TrustRow,
} from "@/lib/financeLedger/financeLedgerRules";
import { errorResponse, labelRows } from "../_financeLedger/server";

/**
 * /api/v1/lawyer/trust — «أمانات العميل» (owner TODO F3/F4;
 * public.client_trust_ledger, 20261126_40).
 *
 * Readers: the row's writer, the client card's owner, the firm owner /
 * managing partner / partner / finance manager. Writers: the card's owner or
 * a finance role of the card's firm. The balance of a card is
 * public.client_trust_balance(card) — every live row of the card, whatever
 * the caller's list shows.
 *
 * GET  ?clientId=&caseId=&from=&to=&voided=1
 *      → { data, truncated, balances: { [clientId]: halalas } }
 *        balances only for cards the caller may read the account of.
 * POST { lawyerClientId, caseRequestId?, kind, amountHalalas, occurredOn?,
 *        description, reference?, confirmNegative? } → { data, balanceHalalas } (201)
 *      A disbursement that would take the balance below zero answers 409
 *      { code: "trust_negative", balanceHalalas, afterHalalas } until it is
 *      resent with confirmNegative: true (stored as negative_ack).
 */

const MAX_BALANCES = 100;

export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const f = parseListFilters((k) => request.nextUrl.searchParams.get(k));

    let query = supabase.from("client_trust_ledger").select(TRUST_SELECT);
    if (f.caseId) query = query.eq("case_request_id", f.caseId);
    if (f.clientId) query = query.eq("lawyer_client_id", f.clientId);
    if (f.from) query = query.gte("occurred_on", f.from);
    if (f.to) query = query.lte("occurred_on", f.to);
    if (!f.includeVoided) query = query.is("voided_at", null);
    const { data, error } = await query
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIST_PAGE_SIZE + 1);
    if (error) return errorResponse(error, "lawyer/trust GET");
    const rows = ((data ?? []) as unknown as TrustRow[]).slice(0, LIST_PAGE_SIZE);
    const names = await labelRows(supabase, rows);

    const cards = [...new Set([f.clientId, ...rows.map((r) => r.lawyer_client_id)].filter((x): x is string => !!x))]
      .slice(0, MAX_BALANCES);
    const balances: Record<string, number> = {};
    await Promise.all(
      cards.map(async (card) => {
        const { data: b, error: bErr } = await supabase.rpc("client_trust_balance", { p_client: card });
        // 42501: the caller sees a row he wrote but not the account — no balance shown.
        if (!bErr && b !== null && b !== undefined) balances[card] = Number(b);
      }),
    );

    return NextResponse.json({
      data: rows.map((r) => toTrustDto(r, user.id, names(r))),
      truncated: (data ?? []).length > LIST_PAGE_SIZE,
      balances,
    });
  } catch (err) {
    console.error("[lawyer/trust GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل سجل الأمانات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    // Owner ق٢٦-٤ / ق٢٦-٥: «finance» is «إدارة المكتب» — refused on the free side.
    const officeLocked = await officePlanRefusal(auth.supabase, "finance", auth.userType);
    if (officeLocked) return officeLocked;
    const { user, supabase } = auth;

    const parsed = parseTrustCreate(await request.json().catch(() => null), riyadhDay(Date.now()));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    // The account follows the client card: its firm, read through RLS.
    const { data: card, error: cardError } = await supabase
      .from("lawyer_clients")
      .select("id, firm_id")
      .eq("id", input.lawyerClientId)
      .maybeSingle();
    if (cardError) return errorResponse(cardError, "lawyer/trust POST card");
    if (!card) return NextResponse.json({ error: "الموكل غير موجود أو لا تملك صلاحية الوصول إليه." }, { status: 404 });
    const firmId = (card as { firm_id: string | null }).firm_id ?? null;

    const { data: bal, error: balError } = await supabase.rpc("client_trust_balance", { p_client: input.lawyerClientId });
    if (balError) {
      if (String(balError.code) === "42501") {
        return NextResponse.json(
          { error: "حساب أمانات هذا الموكل يسجّله صاحب بطاقته أو الشريك / المدير المالي في المكتب." },
          { status: 403 },
        );
      }
      return errorResponse(balError, "lawyer/trust POST balance");
    }
    const balance = Number(bal ?? 0);
    const after = trustBalanceAfter(balance, input.kind, input.amountHalalas);
    const goesNegative = needsNegativeConfirmation(balance, input.kind, input.amountHalalas);
    if (goesNegative && !input.confirmNegative) {
      return NextResponse.json(
        {
          error: "هذا الصرف يجعل رصيد أمانات الموكل بالسالب. تأكد من المبلغ، أو أكّد التسجيل إن كان صحيحاً.",
          code: "trust_negative",
          balanceHalalas: balance,
          afterHalalas: after,
        },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("client_trust_ledger")
      .insert({
        created_by: user.id,
        firm_id: firmId,
        lawyer_client_id: input.lawyerClientId,
        case_request_id: input.caseRequestId,
        kind: input.kind,
        amount_halalas: input.amountHalalas,
        occurred_on: input.occurredOn,
        description: input.description,
        reference: input.reference,
        negative_ack: goesNegative,
      })
      .select(TRUST_SELECT)
      .single();
    if (error || !data) return errorResponse(error, "lawyer/trust POST insert");
    const row = data as unknown as TrustRow;
    const names = await labelRows(supabase, [row]);
    return NextResponse.json({ data: toTrustDto(row, user.id, names(row)), balanceHalalas: after }, { status: 201 });
  } catch (err) {
    console.error("[lawyer/trust POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر حفظ حركة الأمانة." }, { status: 500 });
  }
}
