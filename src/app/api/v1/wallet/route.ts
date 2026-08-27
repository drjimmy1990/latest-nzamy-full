import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ─── Shape mappers ──────────────────────────────────────────────────────────
// wallet_transactions.kind CHECK: credit | debit | pending | reversal
// coupons.discount_type CHECK: percentage | fixed | points_grant | plan_upgrade
// The rows are mapped to the shape محفظتي renders here — not in the page — so
// every consumer of /api/v1/wallet gets the same shape.

type TxType = "credit" | "debit" | "system";
type CouponType = "admin" | "provider" | "referral";

const DAY_MS = 24 * 60 * 60 * 1000;

const COUPON_STYLE: Record<CouponType, { labelAr: string; labelEn: string; color: string }> = {
  admin: { labelAr: "مكافأة المنصة", labelEn: "Platform Reward", color: "from-emerald-500 to-teal-400" },
  provider: { labelAr: "عرض محامي", labelEn: "Lawyer Promo", color: "from-indigo-500 to-blue-400" },
  referral: { labelAr: "خصم إحالة", labelEn: "Referral Discount", color: "from-amber-500 to-amber-400" },
};

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

function couponDiscountAr(row: Record<string, unknown>): string {
  const value = Number(row.discount_value ?? 0);
  switch (String(row.discount_type ?? "")) {
    case "percentage":
      return `${toArDigits(value)}٪`;
    case "fixed":
      return `${toArDigits(value)} ر.س`;
    case "points_grant":
      return `${toArDigits(Number(row.points_granted ?? 0))} نقطة`;
    default:
      return "ترقية";
  }
}

function couponDescAr(row: Record<string, unknown>): string {
  const value = Number(row.discount_value ?? 0);
  switch (String(row.discount_type ?? "")) {
    case "percentage":
      return `خصم ${toArDigits(value)}٪ على خدمتك القادمة`;
    case "fixed":
      return `خصم ${toArDigits(value)} ر.س على خدمتك القادمة`;
    case "points_grant":
      return `${toArDigits(Number(row.points_granted ?? 0))} نقطة تُضاف إلى رصيدك`;
    default:
      return "ترقية إلى باقة اشتراك أعلى";
  }
}

function mapCoupon(row: Record<string, unknown>, usageCount: number) {
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const type: CouponType = meta.type === "provider" || meta.type === "referral" ? meta.type : "admin";
  const style = COUPON_STYLE[type];
  const validUntil = row.valid_until ? new Date(String(row.valid_until)) : null;
  const perUserLimit = Number(row.max_uses_per_user ?? 1);
  return {
    code: String(row.code ?? ""),
    labelAr: style.labelAr,
    labelEn: style.labelEn,
    descAr: typeof meta.descAr === "string" ? meta.descAr : couponDescAr(row),
    discount: couponDiscountAr(row),
    // Open-ended coupons carry no expiry line at all — «ينتهي …» needs a date.
    expiry: validUntil ? formatDateAr(validUntil.toISOString()) : "",
    daysRemaining: validUntil
      ? Math.max(0, Math.ceil((validUntil.getTime() - Date.now()) / DAY_MS))
      : 0,
    type,
    providerName: type === "provider" && typeof meta.providerName === "string" ? meta.providerName : undefined,
    used: perUserLimit > 0 && usageCount >= perUserLimit,
    color: style.color,
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
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Get active coupons
  const { data: coupons } = await supabase
    .from("coupons")
    .select("*")
    .eq("active", true)
    .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`);

  // How many times this user already redeemed each of them
  const usageByCoupon = new Map<string, number>();
  if ((coupons ?? []).length > 0) {
    const { data: usage } = await supabase
      .from("coupon_usage")
      .select("coupon_id")
      .eq("user_id", user.id);
    for (const row of usage ?? []) {
      const key = String(row.coupon_id);
      usageByCoupon.set(key, (usageByCoupon.get(key) ?? 0) + 1);
    }
  }

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
      // NO count on `coupons`: that query has no `.limit()` of its own, so
      // there is no cap of ours to report. It is still subject to PostgREST's
      // server-side max-rows like every uncapped read in this app, which is a
      // platform-wide question and not this route's to answer alone.
      coupons: (coupons ?? []).map((c) => mapCoupon(c, usageByCoupon.get(String(c.id)) ?? 0)),
    }
  });
}
