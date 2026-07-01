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
    const invoices = (paymentsRaw as Array<Record<string, unknown>>).map((p) => {
      const meta = (p.metadata as Record<string, unknown> | null) ?? {};
      const amount = Number(p.amount ?? 0);
      const invStatus = paymentStatusToInvoiceStatus(String(p.status ?? ""));
      const paidAmount = invStatus === "paid" ? amount : Number(meta.paidAmount ?? 0);
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
        status: invStatus,
        date: formatDateAr(String(p.created_at)),
        month: createdMonth,
        quarter: Math.ceil(createdMonth / 3) as 1 | 2 | 3 | 4,
        provider: p.provider,
        createdAt: p.created_at,
      };
    });

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
    const meta = (paymentRow.metadata as Record<string, unknown> | null) ?? {};
    const createdMonth = new Date(String(paymentRow.created_at)).getMonth() + 1;
    const invStatus = paymentStatusToInvoiceStatus(String(paymentRow.status));

    return NextResponse.json({
      data: {
        id: paymentRow.id,
        client: String(meta.client ?? client),
        clientType: meta.clientType === "company" ? "company" : "individual",
        caseTitle: typeof meta.caseTitle === "string" ? meta.caseTitle : "—",
        desc: String(meta.description ?? description ?? "أتعاب قانونية"),
        totalFee: Number(paymentRow.amount),
        paidAmount: invStatus === "paid" ? Number(paymentRow.amount) : 0,
        feeType: meta.feeType === "partial" ? "partial" : "full",
        status: invStatus,
        date: formatDateAr(String(paymentRow.created_at)),
        month: createdMonth,
        quarter: Math.ceil(createdMonth / 3) as 1 | 2 | 3 | 4,
        provider: paymentRow.provider,
        createdAt: paymentRow.created_at,
      },
    });
  } catch (err) {
    console.error("[lawyer/finance POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}