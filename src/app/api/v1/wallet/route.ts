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

export async function GET() {
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

  // Calculate balance from transactions — 'pending' rewards are not spendable
  // yet, so they are reported separately instead of being netted off.
  let balance = 0;
  let pendingBalance = 0;
  for (const tx of transactions ?? []) {
    const amount = Number(tx.amount ?? 0);
    if (tx.kind === "pending") pendingBalance += amount;
    else if (tx.kind === "credit") balance += amount;
    else balance -= amount;
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
      balance,
      pendingBalance,
      transactions: (transactions ?? []).map(mapTransaction),
      coupons: (coupons ?? []).map((c) => mapCoupon(c, usageByCoupon.get(String(c.id)) ?? 0)),
    }
  });
}
