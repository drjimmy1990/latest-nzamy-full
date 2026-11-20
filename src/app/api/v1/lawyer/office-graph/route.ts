import { NextResponse } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { canSeeClientFees, firmRoleMap, withCardFees } from "@/lib/services/clientFeeVisibility";
import { readCardFees } from "../clients/_feeVisibility";
import {
  OFFICE_CASE_RECEIVERS,
  buildOfficeGraph,
  isCaseRow,
  officeCaseOrFilter,
  officeOwnRowsFilter,
  type OfficeCaseInput,
  type OfficeClientInput,
  type OfficeConsultationInput,
  type OfficeContractInput,
  type OfficeHearingInput,
  type OfficeInvoiceInput,
  type OfficeTaskInput,
} from "@/lib/services/officeGraph";

/**
 * GET /api/v1/lawyer/office-graph — «خريطة قضايا المكتب» (N3.11; rebuilt for
 * owner 13-Nov file 07, N07-44..52).
 *
 * READ-ONLY. Every query runs on the caller's own RLS client, exactly like
 * GET /api/v1/lawyer/conflict-check: his cases and his firm's (service_requests
 * "firm members read firm service requests"), his client cards and his
 * firm's (lawyer_clients), his and his firm's contracts and consultations.
 * Nothing is read with the service role and nothing is written — not
 * case_graphs, not anything else.
 *
 * Hearings, tasks and invoices are read ONLY for the cases drawn (by
 * case_request_id / request_id), never on their own: their RLS checks the row,
 * not its case, so a case the caller may not read (a restricted case) must not
 * reach the map through its hearings. Upcoming scheduled hearings and open
 * tasks only — the map is today's work, not the archive.
 *
 * Amounts: invoices only of the cases assigned to the caller (as
 * /api/v1/lawyer/finance) and his own case-less ones; a card's agreed fee, a
 * contract's value and a consultation's fee only when clientFeeVisibility.ts
 * allows (own row, or a partner / finance manager of that firm).
 *
 * The response carries names and ids only (officeGraph.ts drops every
 * identity number, phone and register an intake may hold, and every account
 * id). Each source is capped; `truncated` says when a cap cut it, and the
 * page says so. A satellite source that fails to read is left off the map and
 * named in `partial` — the page says which; the cases and clients reading
 * failing is a 500.
 */

const CASE_CAP = 300;
const CLIENT_CAP = 500;
const CONTRACT_CAP = 300;
const CONSULTATION_CAP = 300;
const HEARING_CAP = 400;
const TASK_CAP = 600;
const INVOICE_CAP = 600;
/** Case ids per `.in(...)` (PostgREST puts them in the query string) — as GET /api/v1/lawyer/finance. */
const ID_CHUNK = 150;
/** payments.status values that are an invoice at all (lawyer/finance INVOICEABLE_PAYMENT_STATUSES). */
const INVOICE_STATUSES = ["requires_payment", "paid", "failed"];
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

interface CaseRow {
  id: string;
  title: string | null;
  status: string;
  type: string;
  lawyer_client_id: string | null;
  requester_user_id: string | null;
  assigned_to: string | null;
  requester: { name?: unknown; role?: unknown } | null;
  metadata: Record<string, unknown> | null;
}

interface ClientRow {
  id: string;
  name: string;
  client_type: string;
  client_user_id: string | null;
  owner_user_id: string;
  firm_id: string | null;
  fee_total_sar: number | string | null;
  fee_paid_sar: number | string | null;
}

interface ContractRow {
  id: string;
  owner_user_id: string | null;
  firm_id: string | null;
  lawyer_client_id: string | null;
  client_user_id: string | null;
  request_id: string | null;
  title: string | null;
  contract_type: string;
  status: string;
  counterparty_name: string | null;
  value_sar: number | string | null;
  ends_on: string | null;
}

interface ConsultationRow {
  id: string;
  requester_user_id: string | null;
  lawyer_user_id: string | null;
  firm_id: string | null;
  lawyer_client_id: string | null;
  mode: string | null;
  specialty: string | null;
  scheduled_at: string | null;
  status: string;
  converted_case_request_id: string | null;
  fee_sar: number | string | null;
  fee_paid: boolean | null;
}

interface HearingRow {
  id: string;
  case_request_id: string;
  title: string | null;
  kind: string;
  hearing_date: string;
  hearing_time: string | null;
  court_name: string | null;
}

interface TaskRow {
  id: string;
  case_request_id: string;
  title: string | null;
  status: string;
  priority: string;
  due_date: string | null;
}

interface PaymentRow {
  id: string;
  request_id: string | null;
  lawyer_client_id?: string | null;
  amount: number | string | null;
  status: string;
  metadata: Record<string, unknown> | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** What was collected on an invoice — the lawyer/finance rule: all of it when paid, else metadata.paidAmount. */
function invoiceOf(r: PaymentRow): OfficeInvoiceInput {
  const amount = num(r.amount) ?? 0;
  const paid = r.status === "paid" ? amount : num(r.metadata?.paidAmount) ?? 0;
  return { id: r.id, caseId: r.request_id, lawyerClientId: r.lawyer_client_id ?? null, amount, paid };
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function GET() {
  try {
    // Lawyers, firm accounts, and active firm members of any account type (a
    // legal secretary is not a "lawyer" account) — the case-file gate.
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const uid = user.id;

    // The caller's firms: his active memberships and the firms he owns.
    const [membersRes, ownedRes] = await Promise.all([
      supabase.from("firm_members").select("firm_id, role").eq("user_id", uid).eq("status", "active"),
      supabase.from("firm_profiles").select("id").eq("owner_user_id", uid),
    ]);
    if (membersRes.error || ownedRes.error) {
      const e = membersRes.error ?? ownedRes.error;
      console.error("[lawyer/office-graph GET] firm lookup failed:", e?.message, e?.code);
      return NextResponse.json({ error: "تعذّرت قراءة قضايا المكتب وموكّليه." }, { status: 500 });
    }
    const memberRows = (membersRes.data ?? []) as Array<{ firm_id: string | null; role: string | null }>;
    const ownedIds = ((ownedRes.data ?? []) as Array<{ id: string }>).map((r) => r.id);
    const firmIds = [...memberRows.map((r) => r.firm_id).filter((v): v is string => !!v), ...ownedIds];
    const firmRoles = firmRoleMap(memberRows, ownedIds);
    const feesVisible = (owner: string | null, firmId: string | null) => !!owner && canSeeClientFees(uid, { owner_user_id: owner, firm_id: firmId }, firmRoles);

    const [casesRes, clientsRes, contractsRes, consultationsRes] = await Promise.all([
      supabase
        .from("service_requests")
        .select("id, title, status, type, lawyer_client_id, requester_user_id, assigned_to, requester, metadata", { count: "exact" })
        .eq("type", "service")
        .in("receiver", [...OFFICE_CASE_RECEIVERS])
        // His own work only — see officeCaseOrFilter (RLS also admits the
        // open marketplace to a verified lawyer).
        .or(officeCaseOrFilter(user.id, firmIds))
        .order("created_at", { ascending: false })
        .limit(CASE_CAP),
      supabase
        .from("lawyer_clients")
        // O1 (20261201_10): no fee columns — the session cannot read them; the
        // fees come through lawyer_client_fees below.
        .select("id, name, client_type, client_user_id, owner_user_id, firm_id", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(CLIENT_CAP),
      supabase
        .from("contracts")
        .select("id, owner_user_id, firm_id, lawyer_client_id, client_user_id, request_id, title, contract_type, status, counterparty_name, value_sar, ends_on", { count: "exact" })
        .or(officeOwnRowsFilter("owner_user_id", uid, firmIds))
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .limit(CONTRACT_CAP),
      supabase
        .from("consultations")
        .select("id, requester_user_id, lawyer_user_id, firm_id, lawyer_client_id, mode, specialty, scheduled_at, status, converted_case_request_id, fee_sar, fee_paid", { count: "exact" })
        .or(officeOwnRowsFilter("lawyer_user_id", uid, firmIds))
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(CONSULTATION_CAP),
    ]);

    if (casesRes.error || clientsRes.error) {
      const e = casesRes.error ?? clientsRes.error;
      console.error("[lawyer/office-graph GET] read failed:", e?.message, e?.code);
      return NextResponse.json({ error: "تعذّرت قراءة قضايا المكتب وموكّليه." }, { status: 500 });
    }

    const partial: string[] = [];
    const caseRows = ((casesRes.data ?? []) as CaseRow[]).filter((r) => isCaseRow(r.type, r.metadata));

    // N07-49 merges a platform case into the card linked to the account that
    // filed it. `requester_user_id` is the FILER: on a case added from the
    // dashboard it is the lawyer, a colleague or the firm owner, never the
    // client. So an account counts as the client's only when it is none of
    // those: not the caller, not the case's assignee, not a lawyer/firm filer
    // (requester.role is the filer's user type), not one of the caller's firm
    // colleagues or firm owners. If the colleague list cannot be read, no
    // account is trusted — the merge falls back to card and name.
    let staff: Set<string> | null = new Set([uid]);
    if (firmIds.length > 0) {
      const [colleaguesRes, ownersRes] = await Promise.all([
        supabase.from("firm_members").select("user_id").in("firm_id", firmIds).eq("status", "active"),
        supabase.from("firm_profiles").select("owner_user_id").in("id", firmIds),
      ]);
      if (colleaguesRes.error || ownersRes.error) {
        const e = colleaguesRes.error ?? ownersRes.error;
        console.error("[lawyer/office-graph GET] colleague lookup failed:", e?.message, e?.code);
        staff = null;
      } else {
        for (const r of (colleaguesRes.data ?? []) as Array<{ user_id: string | null }>) if (r.user_id) staff.add(r.user_id);
        for (const r of (ownersRes.data ?? []) as Array<{ owner_user_id: string | null }>) if (r.owner_user_id) staff.add(r.owner_user_id);
      }
    }
    const clientAccount = (account: string | null, assignedTo: string | null, role: unknown): string | null => {
      if (!account || !staff || staff.has(account) || account === assignedTo) return null;
      if (role === "lawyer" || role === "firm") return null;
      return account;
    };

    const cases: OfficeCaseInput[] = caseRows.map((r) => ({
      id: r.id,
      title: r.title ?? "",
      status: r.status,
      lawyerClientId: r.lawyer_client_id,
      requesterUserId: clientAccount(r.requester_user_id, r.assigned_to, r.requester?.role),
      requester: r.requester,
      metadata: r.metadata,
    }));
    const clientBase = (clientsRes.data ?? []) as Array<Omit<ClientRow, "fee_total_sar" | "fee_paid_sar">>;
    const clientRows: ClientRow[] = withCardFees(clientBase, await readCardFees(supabase, uid, clientBase.map((c) => c.id)));
    const clients: OfficeClientInput[] = clientRows.map((c) => {
      const visible = feesVisible(c.owner_user_id, c.firm_id);
      return {
        id: c.id,
        name: c.name,
        clientType: c.client_type,
        clientUserId: c.client_user_id,
        feeTotalSar: visible ? num(c.fee_total_sar) : null,
        feePaidSar: visible ? num(c.fee_paid_sar) : null,
      };
    });

    let contracts: OfficeContractInput[] = [];
    if (contractsRes.error) {
      console.error("[lawyer/office-graph GET] contracts read failed:", contractsRes.error.message, contractsRes.error.code);
      partial.push("العقود");
    } else {
      contracts = ((contractsRes.data ?? []) as ContractRow[]).map((c) => ({
        id: c.id,
        title: c.title ?? "",
        status: c.status,
        contractType: c.contract_type,
        lawyerClientId: c.lawyer_client_id,
        clientUserId: c.client_user_id,
        requestId: c.request_id,
        counterpartyName: c.counterparty_name,
        valueSar: feesVisible(c.owner_user_id, c.firm_id) ? num(c.value_sar) : null,
        endsOn: c.ends_on,
      }));
    }

    let consultations: OfficeConsultationInput[] = [];
    if (consultationsRes.error) {
      console.error("[lawyer/office-graph GET] consultations read failed:", consultationsRes.error.message, consultationsRes.error.code);
      partial.push("الاستشارات");
    } else {
      consultations = ((consultationsRes.data ?? []) as ConsultationRow[]).map((c) => ({
        id: c.id,
        status: c.status,
        mode: c.mode,
        specialty: c.specialty,
        scheduledAt: c.scheduled_at,
        lawyerClientId: c.lawyer_client_id,
        requesterUserId: clientAccount(c.requester_user_id, c.lawyer_user_id, null),
        convertedCaseId: c.converted_case_request_id,
        feeSar: feesVisible(c.lawyer_user_id, c.firm_id) ? num(c.fee_sar) : null,
        feePaid: c.fee_paid === true,
      }));
    }

    // ── the drawn cases' own hearings, tasks and invoices ─────────────────
    const caseIds = cases.map((c) => c.id);
    const idChunks = chunks(caseIds, ID_CHUNK);
    // Invoices: the cases assigned to the caller only — the same set as
    // GET /api/v1/lawyer/finance. Payments RLS would also hand the filer of a
    // case (a secretary, say) its amounts, which no other screen shows him.
    const invoiceChunks = chunks(caseRows.filter((r) => r.assigned_to === uid).map((r) => r.id), ID_CHUNK);
    const today = new Date(Date.now() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);

    const [hearingReads, taskReads, paymentReads, ownInvoicesRes] = await Promise.all([
      Promise.all(idChunks.map((ids) =>
        supabase
          .from("hearings")
          .select("id, case_request_id, title, kind, hearing_date, hearing_time, court_name", { count: "exact" })
          .in("case_request_id", ids)
          .eq("status", "scheduled")
          .gte("hearing_date", today)
          .order("hearing_date", { ascending: true })
          .limit(HEARING_CAP),
      )),
      Promise.all(idChunks.map((ids) =>
        supabase
          .from("tasks")
          .select("id, case_request_id, title, status, priority, due_date", { count: "exact" })
          .in("case_request_id", ids)
          .in("status", ["todo", "in_progress"])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(TASK_CAP),
      )),
      Promise.all(invoiceChunks.map((ids) =>
        supabase
          .from("payments")
          .select("id, request_id, amount, status, metadata", { count: "exact" })
          .in("request_id", ids)
          .in("status", INVOICE_STATUSES)
          .order("created_at", { ascending: false })
          .limit(INVOICE_CAP),
      )),
      // An invoice issued on a client card with no case (N01-9, 20261124_40).
      supabase
        .from("payments")
        .select("id, request_id, lawyer_client_id, amount, status, metadata", { count: "exact" })
        .is("request_id", null)
        .eq("owner_user_id", uid)
        .not("lawyer_client_id", "is", null)
        .in("status", INVOICE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(INVOICE_CAP),
    ]);

    const failedRead = (what: string, reads: Array<{ error: { message: string; code?: string } | null }>) => {
      const bad = reads.find((r) => r.error);
      if (!bad) return false;
      console.error(`[lawyer/office-graph GET] ${what} read failed:`, bad.error?.message, bad.error?.code);
      return true;
    };
    const overCap = (reads: Array<{ count: number | null }>, cap: number) => reads.some((r) => (r.count ?? 0) > cap);

    let hearings: OfficeHearingInput[] = [];
    if (failedRead("hearings", hearingReads)) partial.push("الجلسات");
    else {
      hearings = hearingReads.flatMap((r) => (r.data ?? []) as HearingRow[]).map((h) => ({
        id: h.id,
        caseId: h.case_request_id,
        title: h.title ?? "",
        kind: h.kind,
        date: h.hearing_date,
        time: h.hearing_time,
        courtName: h.court_name ?? "",
      }));
    }

    let tasks: OfficeTaskInput[] = [];
    if (failedRead("tasks", taskReads)) partial.push("المهام");
    else {
      tasks = taskReads.flatMap((r) => (r.data ?? []) as TaskRow[]).map((t) => ({
        id: t.id,
        caseId: t.case_request_id,
        title: t.title ?? "",
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
      }));
    }

    let invoices: OfficeInvoiceInput[] = [];
    // Before 20261124_40 the column does not exist (42703): no invoice can be
    // case-less yet, so that read is an honest nothing, not a failure.
    const ownMissing = ownInvoicesRes.error?.code === "42703";
    if (failedRead("payments", paymentReads) || (ownInvoicesRes.error && !ownMissing)) {
      if (ownInvoicesRes.error && !ownMissing) console.error("[lawyer/office-graph GET] payments (own) read failed:", ownInvoicesRes.error.message);
      partial.push("الأتعاب");
    } else {
      invoices = [
        ...paymentReads.flatMap((r) => (r.data ?? []) as PaymentRow[]),
        ...(ownMissing ? [] : ((ownInvoicesRes.data ?? []) as PaymentRow[])),
      ].map(invoiceOf);
    }

    const graph = buildOfficeGraph(cases, clients, { contracts, consultations, hearings, tasks, invoices });
    return NextResponse.json({
      data: graph,
      truncated: {
        cases: (casesRes.count ?? 0) > CASE_CAP,
        clients: (clientsRes.count ?? 0) > CLIENT_CAP,
        contracts: !contractsRes.error && (contractsRes.count ?? 0) > CONTRACT_CAP,
        consultations: !consultationsRes.error && (consultationsRes.count ?? 0) > CONSULTATION_CAP,
        hearings: overCap(hearingReads, HEARING_CAP),
        tasks: overCap(taskReads, TASK_CAP),
        invoices: overCap(paymentReads, INVOICE_CAP) || (!ownMissing && (ownInvoicesRes.count ?? 0) > INVOICE_CAP),
      },
      caps: { cases: CASE_CAP, clients: CLIENT_CAP },
      partial,
    });
  } catch (err) {
    console.error("[lawyer/office-graph GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت قراءة قضايا المكتب وموكّليه." }, { status: 500 });
  }
}
