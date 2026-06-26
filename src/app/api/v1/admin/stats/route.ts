import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/admin/stats — Real admin dashboard KPIs
 *
 * Returns:
 *   - total_users: total profile count
 *   - users_by_type: { [user_type]: count }
 *   - active_subscriptions_by_tier: { [tier]: count }
 *   - mrr: estimated Monthly Recurring Revenue
 *   - total_credits_used: total AI credits consumed
 *   - recent_signups_7d: signups in last 7 days
 *
 * Requires: authenticated admin user
 */
export async function GET() {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "غير مصرح — يرجى تسجيل الدخول" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Run all queries in parallel ────────────────────────────────────────
    const [
      totalUsersResult,
      usersByTypeResult,
      activeSubsResult,
      creditsUsedResult,
      recentSignupsResult,
    ] = await Promise.all([
      // 1. Total users
      adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true }),

      // 2. Users grouped by user_type
      adminClient
        .from("profiles")
        .select("user_type"),

      // 3. Active subscriptions with plan prices
      adminClient
        .from("subscriptions")
        .select(
          `
          tier,
          billing_cycle,
          subscription_plans (
            price_monthly,
            price_yearly
          )
        `,
        )
        .eq("status", "active"),

      // 4. Total AI credits used (kind = 'usage', amounts are negative)
      adminClient
        .from("credit_transactions")
        .select("amount")
        .eq("kind", "usage"),

      // 5. Recent signups (last 7 days)
      adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    // ── Total users ────────────────────────────────────────────────────────
    const totalUsers = totalUsersResult.count ?? 0;

    // ── Users by type ──────────────────────────────────────────────────────
    const usersByType: Record<string, number> = {};
    for (const row of usersByTypeResult.data ?? []) {
      const type = (row.user_type as string) ?? "unknown";
      usersByType[type] = (usersByType[type] ?? 0) + 1;
    }

    // ── Active subscriptions by tier + MRR ─────────────────────────────────
    const activeSubsByTier: Record<string, number> = {};
    let mrr = 0;

    for (const sub of activeSubsResult.data ?? []) {
      const tier = (sub.tier as string) ?? "unknown";
      activeSubsByTier[tier] = (activeSubsByTier[tier] ?? 0) + 1;

      // MRR calculation: use monthly price, or yearly / 12
      const plan = sub.subscription_plans as unknown as Record<string, unknown> | null;
      if (plan) {
        const monthlyPrice = plan.price_monthly as number | null;
        const yearlyPrice = plan.price_yearly as number | null;
        const billingCycle = sub.billing_cycle as string;

        if (billingCycle === "yearly" && yearlyPrice) {
          mrr += yearlyPrice / 12;
        } else if (monthlyPrice) {
          mrr += monthlyPrice;
        }
      }
    }

    // ── Total credits used ─────────────────────────────────────────────────
    let totalCreditsUsed = 0;
    for (const tx of creditsUsedResult.data ?? []) {
      // Usage amounts are negative, we want the absolute sum
      totalCreditsUsed += Math.abs(tx.amount as number);
    }

    // ── Recent signups ─────────────────────────────────────────────────────
    const recentSignups7d = recentSignupsResult.count ?? 0;

    return NextResponse.json({
      data: {
        total_users: totalUsers,
        users_by_type: usersByType,
        active_subscriptions_by_tier: activeSubsByTier,
        mrr: Math.round(mrr * 100) / 100,
        total_credits_used: totalCreditsUsed,
        recent_signups_7d: recentSignups7d,
      },
    });
  } catch (err) {
    console.error("[admin/stats] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب الإحصائيات" },
      { status: 500 },
    );
  }
}
