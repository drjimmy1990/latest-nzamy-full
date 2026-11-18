import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { monthlyEquivalent } from "@/lib/payments/planRowPrice";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { isTestAccountId, readTestAccountIds } from "@/lib/testAccounts/testAccountIds";

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
 *   - test_accounts_excluded / test_accounts_complete (l7 decision 3): every
 *     figure above leaves out the test accounts (profiles.is_demo or
 *     public.test_accounts, not staff — testAccountIds.ts)
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

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
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
    // l7 decision 3: test accounts never count in the admin KPIs
    const testAccounts = await readTestAccountIds(adminClient);
    const testIds = [...testAccounts.ids];
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const noRows = Promise.resolve({ count: 0 as number | null });

    // ── Run all queries in parallel ────────────────────────────────────────
    const [
      totalUsersResult,
      usersByTypeResult,
      activeSubsResult,
      creditsUsedResult,
      recentSignupsResult,
      testUsersResult,
      testRecentResult,
    ] = await Promise.all([
      // 1. Total users
      adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true }),

      // 2. Users grouped by user_type
      adminClient
        .from("profiles")
        .select("id, user_type"),

      // 3. Active subscriptions with plan prices
      adminClient
        .from("subscriptions")
        .select(
          `
          user_id,
          tier,
          billing_cycle,
          subscription_plans ( * )
        `,
        )
        .eq("status", "active"),

      // 4. Total AI credits used (kind = 'usage', amounts are negative)
      adminClient
        .from("credit_transactions")
        .select("user_id, amount")
        .eq("kind", "usage"),

      // 5. Recent signups (last 7 days)
      adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7d),

      // 6–7. the test accounts among them (subtracted below)
      testIds.length
        ? adminClient.from("profiles").select("id", { count: "exact", head: true }).in("id", testIds)
        : noRows,
      testIds.length
        ? adminClient
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .in("id", testIds)
            .gte("created_at", since7d)
        : noRows,
    ]);

    // ── Total users ────────────────────────────────────────────────────────
    const totalUsers = Math.max(0, (totalUsersResult.count ?? 0) - (testUsersResult.count ?? 0));

    // ── Users by type ──────────────────────────────────────────────────────
    const usersByType: Record<string, number> = {};
    for (const row of usersByTypeResult.data ?? []) {
      if (isTestAccountId(testAccounts.ids, row.id)) continue;
      const type = (row.user_type as string) ?? "unknown";
      usersByType[type] = (usersByType[type] ?? 0) + 1;
    }

    // ── Active subscriptions by tier + MRR ─────────────────────────────────
    const activeSubsByTier: Record<string, number> = {};
    let mrr = 0;

    for (const sub of activeSubsResult.data ?? []) {
      if (isTestAccountId(testAccounts.ids, sub.user_id)) continue;
      const tier = (sub.tier as string) ?? "unknown";
      activeSubsByTier[tier] = (activeSubsByTier[tier] ?? 0) + 1;

      // MRR: the cycle's own price over its months (yearly / 12, quarterly / 3,
      // semiannual / 6), else the monthly price. `subscription_plans ( * )` so
      // the read works before and after 20261026_10 adds the two new columns.
      const plan = sub.subscription_plans as unknown as Record<string, unknown> | null;
      mrr += monthlyEquivalent(plan, sub.billing_cycle as string);
    }

    // ── Total credits used ─────────────────────────────────────────────────
    let totalCreditsUsed = 0;
    for (const tx of creditsUsedResult.data ?? []) {
      if (isTestAccountId(testAccounts.ids, tx.user_id)) continue;
      // Usage amounts are negative, we want the absolute sum
      totalCreditsUsed += Math.abs(tx.amount as number);
    }

    // ── Recent signups ─────────────────────────────────────────────────────
    const recentSignups7d = Math.max(0, (recentSignupsResult.count ?? 0) - (testRecentResult.count ?? 0));

    return NextResponse.json({
      data: {
        total_users: totalUsers,
        users_by_type: usersByType,
        active_subscriptions_by_tier: activeSubsByTier,
        mrr: Math.round(mrr * 100) / 100,
        total_credits_used: totalCreditsUsed,
        recent_signups_7d: recentSignups7d,
        test_accounts_excluded: testAccounts.ids.size,
        test_accounts_complete: testAccounts.complete,
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
