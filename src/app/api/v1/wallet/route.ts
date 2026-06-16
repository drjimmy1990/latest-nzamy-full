import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get wallet transactions
  const { data: transactions, error: txError } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

  // Calculate balance from transactions
  const balance = (transactions || []).reduce((sum, tx) => {
    return tx.kind === 'credit' || tx.kind === 'refund' ? sum + (tx.amount || 0) : sum - (tx.amount || 0);
  }, 0);

  // Get active coupons
  const { data: coupons } = await supabase
    .from("coupons")
    .select("*")
    .eq("active", true)
    .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`);

  return NextResponse.json({
    data: {
      balance,
      pendingBalance: 0,
      transactions: transactions || [],
      coupons: coupons || [],
    }
  });
}
