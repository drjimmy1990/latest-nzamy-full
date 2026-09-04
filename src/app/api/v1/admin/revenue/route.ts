import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";
import { buildMonthlyBuckets, type LedgerRow } from "@/lib/services/revenueMath";

/**
 * GET /api/v1/admin/revenue — owner item ١٨٣.
 *
 * The page used to render a hardcoded six-month series and four invented
 * KPIs («٣٠١٬٠٠٠ ر.س», «١٢٤٧» عميل مدفوع, …). This route answers with the
 * real ledger instead: `public.payments` where `status = 'paid'` (the
 * gateway path, currently gated off — see the payments_gateway flag) plus
 * `public.receipts` (the manual path the office actually uses today; see
 * 20260826_receipts.sql). Both are "money the office has actually received",
 * which is the only honest definition of revenue this platform can print.
 *
 * `public.subscriptions` is read too, but NOT folded into the revenue sum —
 * a subscription can be admin-granted with no payment behind it (see the
 * entitlements build), so counting `subscription_plans.price_monthly` as
 * money received would be inventing a figure, exactly what this pass exists
 * to remove. It only backs `activePaidSubscriptions`, a plain count.
 *
 * SERVICE-ROLE CLIENT, ON PURPOSE. `payments` grants SELECT only to the
 * request's participants (requester/assigned_to — see
 * 20260518_client_workflow_backend_ready.sql), `receipts` grants SELECT only
 * to the requester (20260826_receipts.sql), and `subscriptions` grants SELECT
 * only to `user_id = auth.uid()` (20260603_phase1_003_subscriptions_billing.sql).
 * None of the three has an admin-wide policy, so the RLS-scoped client an
 * admin's own session would use answers every one of these queries with zero
 * rows — not "no revenue", but a false negative from a policy gap. The same
 * gap is why /api/v1/admin/receipts, /api/v1/admin/payments and
 * /api/v1/admin/audit-log all read through requireAdmin() + the service-role
 * client rather than the caller's own RLS session; this route follows that
 * established pattern rather than inventing a different one.
 */

const MONTHS = 6;

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.isAdmin) {
    return NextResponse.json({ error: gate.error ?? "غير مصرح" }, { status: gate.status ?? 403 });
  }

  try {
    const admin = await createServiceClient();
    const reference = new Date();
    // Six calendar months back from the first of the current month, in UTC —
    // matches buildMonthlyBuckets()'s own month math exactly.
    const windowStart = new Date(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - (MONTHS - 1), 1),
    ).toISOString();

    const [paymentsRes, receiptsRes, subscriptionsRes, refundsRes] = await Promise.all([
      admin
        .from("payments")
        .select("amount, created_at")
        .eq("status", "paid")
        .gte("created_at", windowStart),
      admin
        .from("receipts")
        .select("amount, issued_at")
        .gte("issued_at", windowStart),
      admin
        .from("subscriptions")
        .select("id, tier", { count: "exact" })
        .eq("status", "active")
        .neq("tier", "free"),
      admin
        .from("payments")
        .select("amount")
        .eq("status", "refunded")
        .gte("created_at", windowStart),
    ]);

    if (paymentsRes.error) {
      console.error("[admin/revenue] payments read failed:", paymentsRes.error.message);
      return NextResponse.json({ error: "تعذّرت قراءة سجل المدفوعات." }, { status: 500 });
    }
    if (receiptsRes.error) {
      console.error("[admin/revenue] receipts read failed:", receiptsRes.error.message);
      return NextResponse.json({ error: "تعذّرت قراءة سندات القبض." }, { status: 500 });
    }
    if (subscriptionsRes.error) {
      console.error("[admin/revenue] subscriptions read failed:", subscriptionsRes.error.message);
      return NextResponse.json({ error: "تعذّرت قراءة الاشتراكات." }, { status: 500 });
    }
    if (refundsRes.error) {
      console.error("[admin/revenue] refunds read failed:", refundsRes.error.message);
      return NextResponse.json({ error: "تعذّرت قراءة المسترجعات." }, { status: 500 });
    }

    const ledgerRows: LedgerRow[] = [
      ...(paymentsRes.data ?? []).map((r) => ({ amount: Number(r.amount), occurredAt: r.created_at as string })),
      ...(receiptsRes.data ?? []).map((r) => ({ amount: Number(r.amount), occurredAt: r.issued_at as string })),
    ];

    const months = buildMonthlyBuckets(ledgerRows, reference, MONTHS);
    const refundsTotal = (refundsRes.data ?? []).reduce((acc, r) => acc + Number(r.amount ?? 0), 0);

    return NextResponse.json({
      data: months,
      total: months.length,
      activePaidSubscriptions: subscriptionsRes.count ?? subscriptionsRes.data?.length ?? 0,
      refundsTotal,
      refundsCount: (refundsRes.data ?? []).length,
    });
  } catch (err) {
    console.error("[admin/revenue] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت قراءة بيانات الإيرادات." }, { status: 500 });
  }
}
