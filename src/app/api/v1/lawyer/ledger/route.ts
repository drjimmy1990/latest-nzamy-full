import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { recordActivity, RequestEvent } from "@/lib/events";
import {
  LEDGER_PAGE_SIZE,
  LEDGER_SELECT,
  ledgerDbError,
  parseLedgerCreate,
  parseLedgerFilters,
  toLedgerDto,
  type LedgerRow,
} from "@/lib/ledger/ledgerInput";
import { ledgerWriterNames } from "./_names";

/**
 * /api/v1/lawyer/ledger — سجل الصادر والوارد القانوني (N3.7, owner §٤٥ axis 1;
 * public.legal_ledger_entries, 20261025_33).
 *
 * Session client only. RLS returns the caller's own entries plus his active
 * firms' registers, and refuses an entry on a case he does not work on, or one
 * filed under a firm that is not the case's (case_row_scope_ok). The entry's
 * firm_id is read from the case here, never from the request.
 *
 * GET  ?direction=in|out&channel=…&caseId=…&archived=1&before=<ISO>
 *      → { data, nextCursor } — newest first; archived entries only with archived=1.
 * POST { caseRequestId, direction, channel, title, notes?, occurredAt? } → { data }
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const f = parseLedgerFilters((k) => request.nextUrl.searchParams.get(k));

    let query = supabase.from("legal_ledger_entries").select(LEDGER_SELECT);
    if (f.direction) query = query.eq("direction", f.direction);
    if (f.channel) query = query.eq("channel", f.channel);
    if (f.caseId) query = query.eq("case_request_id", f.caseId);
    if (!f.includeArchived) query = query.is("archived_at", null);
    if (f.before) query = query.lt("occurred_at", f.before);

    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(LEDGER_PAGE_SIZE);
    if (error) {
      console.error("[lawyer/ledger GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل سجل الصادر والوارد." }, { status: 500 });
    }
    const rows = (data ?? []) as unknown as LedgerRow[];
    const names = await ledgerWriterNames(rows);
    return NextResponse.json({
      data: rows.map((r) => toLedgerDto(r, user.id, r.created_by ? names.get(r.created_by) ?? null : null)),
      nextCursor: rows.length === LEDGER_PAGE_SIZE ? rows[rows.length - 1].occurred_at : null,
    });
  } catch (err) {
    console.error("[lawyer/ledger GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل سجل الصادر والوارد." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const parsed = parseLedgerCreate(await request.json().catch(() => null), Date.now());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    // The case's own firm. RLS on service_requests decides whether the caller
    // may read it; an unreadable case is refused here and again by the ledger
    // policy (case_row_scope_ok).
    const { data: caseRow, error: caseError } = await supabase
      .from("service_requests")
      .select("id, firm_id")
      .eq("id", input.caseRequestId)
      .maybeSingle();
    if (caseError) {
      console.error("[lawyer/ledger POST] case lookup failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: "تعذّر التحقق من القضية." }, { status: 500 });
    }
    if (!caseRow) return NextResponse.json({ error: "القضية غير موجودة أو لا تملك صلاحية الوصول إليها." }, { status: 404 });
    const firmId = (caseRow as { firm_id: string | null }).firm_id ?? null;

    const { data, error } = await supabase
      .from("legal_ledger_entries")
      .insert({
        case_request_id: input.caseRequestId,
        firm_id: firmId,
        created_by: user.id,
        direction: input.direction,
        channel: input.channel,
        title: input.title,
        notes: input.notes,
        occurred_at: input.occurredAt,
      })
      .select(LEDGER_SELECT)
      .single();
    if (error || !data) {
      console.error("[lawyer/ledger POST] insert failed:", error?.message, error?.code);
      const mapped = ledgerDbError(error);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    const row = data as unknown as LedgerRow;

    await recordActivity({
      supabase,
      kind: RequestEvent.LEDGER_ENTRY_ADDED,
      ownerUserId: user.id,
      firmId,
      actorUserId: user.id,
      caseRequestId: input.caseRequestId,
      subjectTable: "legal_ledger_entries",
      subjectId: row.id,
      payload: { title: input.title, direction: input.direction, channel: input.channel },
    });

    return NextResponse.json({ data: toLedgerDto(row, user.id, null) }, { status: 201 });
  } catch (err) {
    console.error("[lawyer/ledger POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر حفظ القيد." }, { status: 500 });
  }
}
