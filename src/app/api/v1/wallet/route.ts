import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";

// ─── Shape mappers ──────────────────────────────────────────────────────────
// wallet_transactions.kind CHECK: credit | debit | pending | reversal
// The rows are mapped to the shape محفظتي renders here — not in the page — so
// every consumer of /api/v1/wallet gets the same shape.

type TxType = "credit" | "debit" | "system";

/** ٥٠ — Arabic-Indic digits, two decimals at most. */
function toArDigits(n: number): string {
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

/** ٥ أبريل ٢٠٢٦ */
function formatDateAr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** 'pending' is a reward not released yet, so it reads as a neutral row. */
function txType(kind: string): TxType {
  if (kind === "credit") return "credit";
  if (kind === "debit" || kind === "reversal") return "debit";
  return "system";
}

function mapTransaction(row: Record<string, unknown>) {
  const type = txType(String(row.kind ?? ""));
  const amount = Math.abs(Number(row.amount ?? 0));
  const sign = type === "debit" ? "−" : "+";
  return {
    id: String(row.id),
    type,
    amountAr: `${sign}${toArDigits(amount)} ر.س${type === "system" ? " معلقة" : ""}`,
    amountEn: `${sign}${amount.toLocaleString("en-US")} SAR`,
    descAr: String(row.description ?? ""),
    date: formatDateAr(String(row.created_at)),
  };
}

/**
 * How many transactions the history list shows. Unchanged — 50 is what this
 * route has always returned and what the «سجل المعاملات» tab is laid out for.
 */
const TX_PAGE = 50;

/**
 * How many rows the BALANCE is allowed to be summed over.
 *
 * ── THE DEFECT THIS CONSTANT EXISTS TO END ──────────────────────────────────
 *
 * The balance used to be summed over the same `.limit(50)` that fed the
 * history list. A client with 51 movements was shown, in a 5xl figure under
 * «رصيد المحفظة», the sum of his newest 50 — a number that is not his balance
 * and that no cap notice could have made true, because it was not a short
 * list, it was a WRONG TOTAL. A rendered ٠ is a claim about a client's money;
 * so is a rendered ٤٢٠ that is missing his oldest debit.
 *
 * There is no aggregate for this to call. `wallet_transactions` has no balance
 * column and no SUM rpc exists (adding one is a migration, which this pass
 * does not own), so the honest options are to sum every row or to withhold the
 * figure. This does the first up to a bound and the second past it.
 */
const BALANCE_SCAN_MAX = 1000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // TWO reads, not one, and the split is by what each column is FOR.
  //
  // The history list needs five columns for 50 rows. The balance needs two
  // columns for up to a thousand. Serving both from one wide 1000-row query
  // would ship `description` — free text, the widest column here — for 950
  // rows whose only contribution is a number to a running sum.
  //
  // Same `user_id` predicate on both, so the count returned by the scan is
  // equally the count of the list.
  const [pageResult, scanResult] = await Promise.all([
    supabase
      .from("wallet_transactions")
      .select("id, amount, kind, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(TX_PAGE),
    // No ORDER BY: a sum does not depend on the order of its terms, and the
    // guard below only uses this data when the count proves every row arrived
    // — so which arbitrary subset a clamp would have returned never matters.
    // Sorting a thousand rows to add them up would be work for nothing.
    supabase
      .from("wallet_transactions")
      .select("amount, kind", { count: "exact" })
      .eq("user_id", user.id)
      .limit(BALANCE_SCAN_MAX),
  ]);

  const txError = pageResult.error ?? scanResult.error;
  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

  const txRows = pageResult.data ?? [];
  const scanRows = scanResult.data ?? [];
  const txCount = scanResult.count;

  /**
   * Is the balance computable at all?
   *
   * Tested as `count <= rows.length` against the SCAN's rows, NOT as
   * `count <= BALANCE_SCAN_MAX`, and the difference is the whole point:
   * PostgREST enforces its own `max-rows` on the hosted project (a value this
   * code cannot see and does not set), so a `.limit(1000)` can come back as
   * 500 rows with no error and no signal. Comparing against what actually
   * arrived catches that clamp; comparing against the number we asked for
   * would sail straight past it and sum a silently halved ledger into a
   * confident figure.
   *
   * A missing count is also unknown, never "fine".
   */
  const balanceIsComputable =
    typeof txCount === "number" && txCount <= scanRows.length;

  // 'pending' rewards are not spendable yet, so they are reported separately
  // instead of being netted off. Both figures come out of the same window, so
  // both are withheld together — a pending pill that outlived its balance
  // would be a number with no stated basis sitting beside «—».
  let balance: number | null = null;
  let pendingBalance: number | null = null;
  if (balanceIsComputable) {
    let credit = 0;
    let pending = 0;
    for (const tx of scanRows) {
      const amount = Number(tx.amount ?? 0);
      if (tx.kind === "pending") pending += amount;
      else if (tx.kind === "credit") credit += amount;
      else credit -= amount;
    }
    balance = credit;
    pendingBalance = pending;
  } else {
    console.error(
      `[wallet GET] balance withheld — ledger exceeds the scan window: user=${user.id} rows=${scanRows.length} count=${txCount ?? "unknown"}`,
    );
  }

  // No coupon list (P7, 20261026_20): this route used to read every active
  // code from public.coupons with the user's session and send the whole
  // platform-wide list to every client. Coupon codes are server only now —
  // no session may read them — and are checked when typed at checkout
  // (POST /api/v1/coupons/validate). The key stays, empty, for the page.

  return NextResponse.json({
    data: {
      // `null`, not 0, when the ledger could not be summed. The page renders
      // «—» for it; a zero here would be the same false statement the cap
      // produced, just arrived at more honestly.
      balance,
      pendingBalance,
      // The newest TX_PAGE rows, plus the exact number that exist. No filter is
      // applied after the query — `user_id` is the only predicate, on both the
      // list and the count — so the two are comparable and the page can say
      // «يُعرض أحدث ٥٠ حركة من ٢٣٠».
      transactions: txRows.map(mapTransaction),
      transactionsTotal: typeof txCount === "number" ? txCount : null,
      // Always empty since P7 — see above.
      coupons: [],
    }
  });
}
