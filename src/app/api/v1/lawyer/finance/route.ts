import { NextResponse, NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth/assertRole";

// ─── Shape mappers ──────────────────────────────────────────────────────────
// payments.status CHECK: not_required | requires_payment | paid | failed | refunded
// UI InvoiceStatus: paid | pending | overdue | partial
function paymentStatusToInvoiceStatus(status: string): "paid" | "pending" | "overdue" | "partial" {
  switch (status) {
    case "paid":
    case "not_required":
      return "paid";
    case "failed":
    case "refunded":
      return "overdue";
    case "requires_payment":
      return "pending";
    default:
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
  const createdMonth = new Date(String(p.created_at)).getMonth() + 1;
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
    provider: p.provider,
    createdAt: p.created_at,
  };
}

/**
 * GET /api/v1/lawyer/finance
 * Auth required. Returns financial data for this lawyer.
 * Selects only real columns (B5): payments(id, request_id, provider, amount,
 * currency, status, metadata, created_at); wallet_transactions(id, amount, kind,
 * description, created_at). Scopes payments to this lawyer via service_requests
 * assigned_to = user.id. Maps results to the shapes finance/page.tsx expects.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const uid = user.id;

    // Request ids assigned to this lawyer (scopes payments via the NOT NULL
    // request_id FK on payments).
    const { data: myRequests } = await supabase
      .from("service_requests")
      .select("id")
      .eq("assigned_to", uid);

    const requestIds = (myRequests ?? []).map((r) => r.id);

    const [paymentsRaw, walletTxns, subscription] = await Promise.all([
      // Payments for requests assigned to this lawyer
      requestIds.length > 0
        ? Promise.resolve(
            supabase
              .from("payments")
              .select("id, request_id, provider, amount, currency, status, metadata, created_at")
              .in("request_id", requestIds)
              .order("created_at", { ascending: false })
              .limit(50),
          )
            .then(({ data }) => data ?? [])
            .catch(() => [])
        : Promise.resolve([]),

      // Wallet transactions (real columns only)
      Promise.resolve(
        supabase
          .from("wallet_transactions")
          .select("id, amount, kind, description, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50),
      )
        .then(({ data }) => data ?? [])
        .catch(() => []),

      // Current subscription
      Promise.resolve(
        supabase
          .from("subscriptions")
          .select("*, subscription_plans(*)")
          .eq("user_id", uid)
          .eq("status", "active")
          .limit(1)
          .single(),
      )
        .then(({ data }) => data ?? null)
        .catch(() => null),
    ]);

    // Map payments → Invoice shape expected by finance/page.tsx
    const invoices = (paymentsRaw as Array<Record<string, unknown>>).map(mapPaymentToInvoice);

    // Map wallet_transactions → Expense shape expected by finance/page.tsx
    const walletTransactions = (walletTxns as Array<Record<string, unknown>>).map((t) => {
      const createdMonth = new Date(String(t.created_at)).getMonth() + 1;
      return {
        id: String(t.id),
        desc: String(t.description ?? ""),
        amount: Number(t.amount ?? 0),
        category: "other",
        date: formatDateAr(String(t.created_at)),
        month: createdMonth,
        vatIncluded: false,
        kind: t.kind,
        createdAt: t.created_at,
      };
    });

    // Calculate totals (use raw paid amounts for revenue)
    const totalRevenue = invoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + (i.paidAmount ?? 0), 0);

    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthlyRevenue = (paymentsRaw as Array<Record<string, unknown>>)
      .filter((p) => (p.status === "paid" || p.status === "not_required") && String(p.created_at) >= thisMonthStart)
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

    return NextResponse.json({
      invoices,
      walletTransactions,
      subscription,
      totalRevenue,
      monthlyRevenue,
      totalInvoices: invoices.length,
      pendingInvoices: invoices.filter((i) => i.status === "pending").length,
    });
  } catch (err) {
    console.error("[lawyer/finance GET] Unexpected error:", err);
    return NextResponse.json({
      invoices: [],
      walletTransactions: [],
      subscription: null,
      totalRevenue: 0,
      monthlyRevenue: 0,
      totalInvoices: 0,
      pendingInvoices: 0,
    });
  }
}

/**
 * POST /api/v1/lawyer/finance
 * Auth required. Creates a manual invoice: a placeholder service_requests row
 * (assigned to the lawyer) plus a payments row referencing it.
 *
 * `payments` has no INSERT RLS policy, so we use createServiceClient.
 * `payments.request_id` is NOT NULL → we create a placeholder service_request
 * first to satisfy the FK.
 *
 * Body: { client, description, amount, feeType?, caseTitle?, clientType?, requestId? }
 * Returns { data: <invoice-shaped row> }.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const {
      client,
      description,
      amount,
      feeType,
      caseTitle,
      clientType,
      requestId,
    } = body as {
      client?: string;
      description?: string;
      amount?: number | string;
      feeType?: string;
      caseTitle?: string;
      clientType?: string;
      requestId?: string;
    };

    if (!client || !client.trim() || amount === undefined || amount === null) {
      return NextResponse.json({ error: "client and amount required" }, { status: 400 });
    }

    const feeNum = Number(amount);
    if (Number.isNaN(feeNum)) {
      return NextResponse.json({ error: "amount must be a number" }, { status: 400 });
    }

    const service = await createServiceClient();

    // 1) Create (or reuse) a placeholder service_request to satisfy
    //    payments.request_id NOT NULL FK.
    let reqId = requestId;
    if (!reqId) {
      const reqIdGen = crypto.randomUUID();
      const { data: reqRow, error: reqErr } = await service
        .from("service_requests")
        .insert({
          id: reqIdGen,
          requester_user_id: user.id,
          type: "service",
          title: `فاتورة: ${client.trim()}`,
          description: description || "",
          requester: { name: client.trim(), role: "client", tier: "free" },
          receiver: "lawyer",
          assigned_to: user.id,
          status: "completed",
          payment: { amount: feeNum, status: "not_required" },
          source_path: "",
          metadata: { invoice: true },
        })
        .select("id")
        .single();
      if (reqErr || !reqRow) {
        return NextResponse.json(
          { error: reqErr?.message || "Failed to create invoice request" },
          { status: 500 },
        );
      }
      reqId = reqRow.id;
    }

    // 2) Insert the payment row.
    const paymentId = crypto.randomUUID();
    const paymentMeta: Record<string, unknown> = {
      invoice: true,
      client: client.trim(),
      description: description || "أتعاب قانونية",
      issued_by: user.id,
      feeType: feeType || "full",
    };
    if (caseTitle) paymentMeta.caseTitle = caseTitle;
    if (clientType) paymentMeta.clientType = clientType;

    const { data: paymentRow, error: payErr } = await service
      .from("payments")
      .insert({
        id: paymentId,
        request_id: reqId,
        provider: "manual",
        amount: feeNum,
        currency: "SAR",
        status: "requires_payment",
        metadata: paymentMeta,
      })
      .select("id, request_id, provider, amount, currency, status, metadata, created_at")
      .single();

    if (payErr || !paymentRow) {
      return NextResponse.json(
        { error: payErr?.message || "Failed to create payment" },
        { status: 500 },
      );
    }

    // Map to Invoice shape
    return NextResponse.json({ data: mapPaymentToInvoice(paymentRow) });
  } catch (err) {
    console.error("[lawyer/finance POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/lawyer/finance
 * Auth required. Marks an issued invoice as collected in cash or by bank
 * transfer — the only two legs available until a payment provider is wired.
 *
 * `payments` has a SELECT RLS policy but no UPDATE policy, so the write goes
 * through createServiceClient and ownership is enforced here instead: the
 * payment must hang off a service_request assigned to this lawyer. No new
 * placeholder request is created — the update only reads the existing one.
 *
 * Body: { paymentId, method?: "cash" | "bank_transfer", paidAmount? }
 * `paidAmount` is the cumulative collected total; omit it to settle in full.
 * Returns { data: <invoice-shaped row> }.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await request.json();
    const { paymentId, method, paidAmount } = body as {
      paymentId?: string;
      method?: string;
      paidAmount?: number | string;
    };

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId required" }, { status: 400 });
    }

    const collectionMethod = method || "cash";
    if (collectionMethod !== "cash" && collectionMethod !== "bank_transfer") {
      return NextResponse.json(
        { error: "method must be cash or bank_transfer" },
        { status: 400 },
      );
    }

    const service = await createServiceClient();

    const { data: payment, error: readErr } = await service
      .from("payments")
      .select("id, request_id, provider, amount, currency, status, metadata, created_at")
      .eq("id", paymentId)
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!payment) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    // payments carries no lawyer column, so ownership is read off the
    // service_request the invoice hangs on.
    const { data: reqRow } = await service
      .from("service_requests")
      .select("assigned_to")
      .eq("id", payment.request_id)
      .maybeSingle();

    if (!reqRow || reqRow.assigned_to !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (payment.status !== "requires_payment") {
      return NextResponse.json({ error: "Invoice is not collectable" }, { status: 409 });
    }

    const total = Number(payment.amount ?? 0);
    const collected =
      paidAmount === undefined || paidAmount === null ? total : Number(paidAmount);
    if (Number.isNaN(collected) || collected <= 0 || collected > total) {
      return NextResponse.json(
        { error: "paidAmount must be greater than 0 and at most the invoice total" },
        { status: 400 },
      );
    }

    // `feeType` stays as issued — it is the fee arrangement, not the collection
    // state; how much came in is already carried by status + paidAmount.
    const fullyCollected = collected >= total;
    const meta = { ...((payment.metadata as Record<string, unknown> | null) ?? {}) };
    meta.paidAmount = collected;
    meta.paidMethod = collectionMethod;
    meta.paidAt = new Date().toISOString();
    meta.collected_by = user.id;

    const { data: updated, error: updErr } = await service
      .from("payments")
      .update({
        status: fullyCollected ? "paid" : "requires_payment",
        metadata: meta,
      })
      .eq("id", paymentId)
      .select("id, request_id, provider, amount, currency, status, metadata, created_at")
      .single();

    if (updErr || !updated) {
      return NextResponse.json(
        { error: updErr?.message || "Failed to update payment" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: mapPaymentToInvoice(updated) });
  } catch (err) {
    console.error("[lawyer/finance PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}