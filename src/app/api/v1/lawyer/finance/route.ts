import { NextResponse, NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth/assertRole";
import {
  createInvoiceWith,
  PAYMENT_COLUMNS,
  recordCollectionWith,
  type FinanceReply,
} from "@/lib/finance/invoiceFinanceCore";

// ─── Shape mappers ──────────────────────────────────────────────────────────
// payments.status CHECK: not_required | requires_payment | paid | failed | refunded
// UI InvoiceStatus: paid | pending | overdue | partial

/**
 * Which `payments` rows are an invoice at all.
 *
 * `not_required` means no payment was ever due on that request — it used to map
 * to "paid", and the mapper then set paidAmount = amount, so a row nobody paid
 * was counted as cash in «المبالغ المحصّلة فعلياً». `refunded` means the office
 * gave money BACK — it used to map to "overdue", so a refund was printed in the
 * red «مستحقات متأخرة» banner as a debt to chase.
 *
 * Both are excluded rather than re-mapped: the UI's InvoiceStatus union lives in
 * src/constants/lawyerFinanceData.ts, which this change does not own, and there
 * is no honest slot in it for "nothing was owed" or "we paid it back". Dropping
 * the row is the truthful option — an omitted row is not a wrong number.
 *
 * Neither status is produced by any code path in the repo today (POST below
 * writes `requires_payment`; PATCH writes `paid`/`requires_payment`), so this is
 * a guard for the day a payment provider or a backfill starts writing them.
 */
const INVOICEABLE_PAYMENT_STATUSES = new Set(["requires_payment", "paid", "failed"]);

function paymentStatusToInvoiceStatus(status: string): "paid" | "pending" | "overdue" | "partial" {
  switch (status) {
    case "paid":
      return "paid";
    case "failed":
      return "overdue";
    case "requires_payment":
      return "pending";
    default:
      // Unreachable while the caller filters on INVOICEABLE_PAYMENT_STATUSES;
      // "pending" is the state that claims the least if that ever changes.
      return "pending";
  }
}

function formatDateAr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** payments row → the Invoice shape finance/page.tsx renders. */
function mapPaymentToInvoice(p: Record<string, unknown>) {
  const meta = (p.metadata as Record<string, unknown> | null) ?? {};
  const amount = Number(p.amount ?? 0);
  const invStatus = paymentStatusToInvoiceStatus(String(p.status ?? ""));
  const paidAmount = invStatus === "paid" ? amount : Number(meta.paidAmount ?? 0);
  // A part-collected invoice stays 'requires_payment' in the DB (payments.status
  // has no 'partial'), so the partial state is derived from the collected sum.
  const status =
    invStatus === "pending" && paidAmount > 0 && paidAmount < amount ? "partial" : invStatus;
  // Gregorian components of created_at. The `date` string beside them is Hijri
  // (ar-SA is Umm al-Qura, as it is on every other lawyer screen), so the page
  // spells the Gregorian year out in its chart axis labels rather than leaving
  // the reader to guess which calendar a bare month name belongs to.
  const created = new Date(String(p.created_at));
  const createdMonth = created.getMonth() + 1;
  return {
    id: String(p.id),
    client: String(meta.client ?? "عميل"),
    clientType: meta.clientType === "company" ? "company" : "individual",
    caseTitle: typeof meta.caseTitle === "string" ? meta.caseTitle : "—",
    desc: typeof meta.description === "string" ? meta.description : "أتعاب قانونية",
    totalFee: amount,
    paidAmount,
    feeType: meta.feeType === "partial" ? "partial" : "full",
    status,
    date: formatDateAr(String(p.created_at)),
    month: createdMonth,
    quarter: Math.ceil(createdMonth / 3) as 1 | 2 | 3 | 4,
    year: created.getFullYear(),
    provider: p.provider,
    createdAt: p.created_at,
  };
}

/**
 * PostgREST builds `.in(...)` into the query string, and this project has
 * already been bitten by that list overflowing (the library search broke at
 * ~396 UUIDs and returned an error the caller swallowed). A lawyer accumulates
 * one service_requests row per client added and per task created, so the list
 * grows without bound — it is chunked here instead of gambling on the ceiling.
 */
const REQUEST_ID_CHUNK = 150;

/** Upper bound on rows read per list, so one huge practice cannot time the route out. */
const MAX_ROWS = 500;

/**
 * The DB statuses that are an invoice, as an array for the query.
 *
 * `INVOICEABLE_PAYMENT_STATUSES` was applied ONLY in memory, after the fetch,
 * and that made two separate lies possible at once:
 *
 *  1. A count could not be reported. A DB count behind an in-memory filter
 *     describes a different set than the rows returned — the same reason
 *     /api/v1/admin/audit-log returns `total: null` under `?severity=`.
 *  2. Worse, and already true today: the cap was spent on rows that were then
 *     thrown away. 500 `not_required` rows came back, the filter dropped all
 *     of them, and the lawyer saw an empty invoice list while his invoices sat
 *     unread past the cap.
 *
 * Pushing it into the query fixes both. The in-memory `.filter()` is KEPT
 * rather than deleted: both read this one constant so they cannot disagree,
 * and it stops a future edit of the query from feeding a `refunded` row into
 * mapPaymentToInvoice() — which is precisely how a refund once appeared in the
 * red «مستحقات متأخرة» banner as a debt to chase.
 */
const INVOICEABLE_STATUS_LIST = [...INVOICEABLE_PAYMENT_STATUSES];

/**
 * GET /api/v1/lawyer/finance
 * Auth required. Returns financial data for this lawyer:
 * `{ invoices, invoicesTotal, walletTransactions, walletTransactionsTotal }`.
 *
 * Each list is capped at MAX_ROWS and each carries its own exact count, so the
 * page can say which of its figures cover the whole practice and which cover
 * only the newest N. Every «إجمالي» on that screen is summed from `invoices`
 * — over a capped list that number is not a total, and until the counts
 * existed there was no way for it to know.
 *
 * Selects only real columns: payments(id, request_id, provider, amount,
 * currency, status, metadata, created_at); wallet_transactions(id, amount,
 * kind, description, created_at). Scopes payments to this lawyer via
 * service_requests.assigned_to = user.id.
 *
 * A read that FAILS returns 500 with an error. It used to return HTTP 200 with
 * empty arrays and zeroed totals, which the page rendered as «لا توجد فواتير»
 * and ٠ ﷼ — a database outage was indistinguishable from an empty practice, and
 * a lawyer could conclude he had billed nothing. `subscription`, `totalRevenue`,
 * `monthlyRevenue`, `totalInvoices` and `pendingInvoices` used to be returned
 * here and were never read by the page (which recomputes its own totals with
 * different definitions); they are gone rather than left to drift, and the
 * subscriptions `.single()` that produced one of them — which errors PGRST116
 * for any lawyer without an active plan — is gone with them.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const uid = user.id;

    const readFailed = (what: string, detail: string) => {
      console.error(`[lawyer/finance GET] ${what} read failed:`, detail);
      return NextResponse.json({ error: "Failed to read finance data" }, { status: 500 });
    };

    // Request ids assigned to this lawyer (scopes payments via the NOT NULL
    // request_id FK on payments).
    const { data: myRequests, error: reqErr } = await supabase
      .from("service_requests")
      .select("id")
      .eq("assigned_to", uid);

    if (reqErr) return readFailed("service_requests", reqErr.message);

    const requestIds = (myRequests ?? []).map((r) => String(r.id));

    const chunks: string[][] = [];
    for (let i = 0; i < requestIds.length; i += REQUEST_ID_CHUNK) {
      chunks.push(requestIds.slice(i, i + REQUEST_ID_CHUNK));
    }

    const [paymentResults, walletResult] = await Promise.all([
      Promise.all(
        chunks.map((chunk) =>
          supabase
            .from("payments")
            .select(PAYMENT_COLUMNS, { count: "exact" })
            .in("request_id", chunk)
            .in("status", INVOICEABLE_STATUS_LIST)
            .order("created_at", { ascending: false })
            .limit(MAX_ROWS),
        ),
      ),
      supabase
        .from("wallet_transactions")
        .select("id, amount, kind, description, created_at", { count: "exact" })
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS),
    ]);

    const failedChunk = paymentResults.find((r) => r.error);
    if (failedChunk?.error) return readFailed("payments", failedChunk.error.message);
    if (walletResult.error) return readFailed("wallet_transactions", walletResult.error.message);

    // Each chunk is ordered and capped on its own, so the merged list has to be
    // re-sorted and re-capped before it can be called "the most recent N".
    //
    // KNOWN, PRE-EXISTING, AND DELIBERATELY NOT FIXED HERE: "the most recent
    // MAX_ROWS" is only exactly true while no SINGLE chunk exceeds its own cap.
    // A lawyer with more than 500 invoices inside one 150-request chunk loses
    // that chunk's 501st row even if it is newer than a row another chunk kept.
    // That is a wrong-ROWS defect, not an unreported-COUNT one, and fixing it
    // means paging every chunk to exhaustion or a server-side aggregate —
    // neither of which this pass owns. `invoicesTotal` below reports the true
    // number either way, so nothing on the screen can claim to be a total.
    const paymentsRaw = paymentResults
      .flatMap((r) => (r.data ?? []) as unknown as Record<string, unknown>[])
      // Belt to the query's braces — see INVOICEABLE_STATUS_LIST. Reads the
      // same constant the `.in("status", …)` above does, so the two cannot
      // drift apart, and a query edit that let a `refunded` row through still
      // never reaches mapPaymentToInvoice().
      .filter((p) => INVOICEABLE_PAYMENT_STATUSES.has(String(p.status ?? "")))
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      .slice(0, MAX_ROWS);

    const invoices = paymentsRaw.map(mapPaymentToInvoice);

    /**
     * How many invoiceable payments this lawyer actually has.
     *
     * The chunks partition a list of PRIMARY KEYS, so they are disjoint and
     * their counts add up to an exact total with no double-counting. One chunk
     * answering without a count makes the whole sum unknowable — reported as
     * `null` rather than as a sum of the chunks that did answer, which would
     * be a number smaller than the truth presented as the truth.
     *
     * Zero chunks (a lawyer with no assigned requests) is a real 0, not an
     * unknown: there is nothing to count.
     */
    const invoicesTotal = paymentResults.some((r) => typeof r.count !== "number")
      ? null
      : paymentResults.reduce((sum, r) => sum + (r.count ?? 0), 0);

    /**
     * wallet_transactions → the lawyer's PLATFORM WALLET ledger.
     *
     * These are not office expenses and are no longer sent as such. The amount
     * column is unsigned and the direction lives in `kind`
     * (credit | debit | pending | reversal), so `kind` is passed through and the
     * page renders the sign from it. The page used to sum every row as an
     * expense: an admin wallet deposit — the only kind anything in this repo
     * writes (src/lib/entitlements.ts) — was money IN booked as money OUT.
     * `category` and `vatIncluded` used to be hardcoded here ("other" / false);
     * the table has neither column, so they are gone rather than invented.
     */
    const walletTransactions = ((walletResult.data ?? []) as Array<Record<string, unknown>>).map(
      (t) => ({
        id: String(t.id),
        desc: String(t.description ?? ""),
        amount: Number(t.amount ?? 0),
        kind: String(t.kind ?? ""),
        date: formatDateAr(String(t.created_at)),
        createdAt: t.created_at,
      }),
    );

    /**
     * TWO totals, never one.
     *
     * `invoices` and `walletTransactions` are independent reads of unrelated
     * tables, each with its own MAX_ROWS cap, and either can be truncated
     * while the other is not. A single `total` would put an invoice count over
     * a wallet list on the screen that renders them in two different tabs.
     */
    return NextResponse.json({
      invoices,
      invoicesTotal,
      walletTransactions,
      walletTransactionsTotal:
        typeof walletResult.count === "number" ? walletResult.count : null,
    });
  } catch (err) {
    console.error("[lawyer/finance GET] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to read finance data" }, { status: 500 });
  }
}

/** A core reply as the HTTP response, invoice rows in the page's Invoice shape. */
function respond(reply: FinanceReply) {
  if (reply.status === 200) return NextResponse.json({ data: mapPaymentToInvoice(reply.row) });
  return NextResponse.json(reply.body, { status: reply.status });
}

/**
 * POST /api/v1/lawyer/finance
 * Auth required. Creates a manual invoice: a placeholder service_requests row
 * (assigned to the lawyer) plus a payments row referencing it.
 *
 * `payments` has no INSERT RLS policy, so the write goes through
 * createServiceClient. A supplied `requestId` must be assigned to this lawyer
 * (CODE-F01) — otherwise 403 `{ error: "Forbidden" }`, the same for a request
 * that does not exist, and nothing is written. See createInvoiceWith().
 *
 * Body: { client, description, amount, feeType?, caseTitle?, clientType?, requestId? }
 * Returns { data: <invoice-shaped row> }.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await request.json();
    const service = await createServiceClient();
    return respond(await createInvoiceWith({ admin: service }, { userId: user.id, body }));
  } catch (err) {
    console.error("[lawyer/finance POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/lawyer/finance
 * Auth required. Records ONE payment collected on an issued invoice, in cash
 * or by bank transfer — the only two legs available until a payment provider
 * is wired.
 *
 * The write is public.record_invoice_collection (20261030_10): it locks the
 * payments row, re-checks that the invoice hangs off a request assigned to
 * this lawyer, refuses a form whose paid snapshot is out of date and an amount
 * over the remainder, then ADDS the payment (CODE-F02 / LIVE-F36). It used to
 * store a cumulative total the browser had computed, so a second form open on
 * the same invoice erased the first payment. See recordCollectionWith().
 *
 * Body: { paymentId, method: "cash" | "bank_transfer", amountHalalas,
 *         expectedPaidHalalas, idempotencyKey } — all required.
 * Returns { data: <invoice-shaped row> }.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await request.json();
    const service = await createServiceClient();
    return respond(await recordCollectionWith({ admin: service }, { userId: user.id, body }));
  } catch (err) {
    console.error("[lawyer/finance PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
