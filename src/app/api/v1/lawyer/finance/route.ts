import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyer/finance
 * Auth required. Returns financial data for this lawyer.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = user.id;

  const [payments, walletTxns, subscription] = await Promise.all([
    // Payments received by this lawyer
    Promise.resolve(
      supabase
        .from("payments")
        .select("id, amount, status, payment_method, created_at, metadata")
        .eq("provider_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
    )
      .then(({ data }) => data ?? [])
      .catch(() => []),

    // Wallet transactions
    Promise.resolve(
      supabase
        .from("wallet_transactions")
        .select("id, amount, type, description, created_at")
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

  // Calculate totals
  const totalRevenue = payments
    .filter((p: { status: string }) => p.status === "completed")
    .reduce((sum: number, p: { amount: number }) => sum + (p.amount ?? 0), 0);

  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const monthlyRevenue = payments
    .filter((p: { status: string; created_at: string }) => p.status === "completed" && p.created_at >= thisMonthStart)
    .reduce((sum: number, p: { amount: number }) => sum + (p.amount ?? 0), 0);

  return NextResponse.json({
    invoices: payments,
    walletTransactions: walletTxns,
    subscription,
    totalRevenue,
    monthlyRevenue,
    totalInvoices: payments.length,
    pendingInvoices: payments.filter((p: { status: string }) => p.status === "pending").length,
  });
}
