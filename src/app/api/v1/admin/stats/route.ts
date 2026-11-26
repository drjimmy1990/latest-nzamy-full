import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { monthlyEquivalent } from "@/lib/payments/planRowPrice";
import { requireStaff } from "@/lib/access-control";
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
 *   - active_paid_subscriptions: active subscriptions on a tier other than
 *     free (C07: the subscriptions page's «مشترك نشط»)
 *   - active_subscriptions_by_plan: [{ plan_id, name_ar, tier, count, mrr,
 *     price_monthly }] — the real plans with their real prices (C07)
 *   - test_accounts_excluded / test_accounts_complete (l7 decision 3): every
 *     figure above leaves out the test accounts (profiles.is_demo or
 *     public.test_accounts, not staff — testAccountIds.ts)
 *
 * Requires: a staff role that may read (requireStaff("read"), C34).
 */
export async function GET() {
  // ── Staff gate (C34): the same gate as every other admin read ──────────────
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;

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
          plan_id,
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
    let activePaid = 0;
    const byPlan = new Map<string, { plan_id: string; name_ar: string | null; tier: string; count: number; mrr: number; price_monthly: number | null }>();

    for (const sub of activeSubsResult.data ?? []) {
      if (isTestAccountId(testAccounts.ids, sub.user_id)) continue;
      const tier = (sub.tier as string) ?? "unknown";
      activeSubsByTier[tier] = (activeSubsByTier[tier] ?? 0) + 1;

      // MRR: the cycle's own price over its months (yearly / 12, quarterly / 3,
      // semiannual / 6), else the monthly price. `subscription_plans ( * )` so
      // the read works before and after 20261026_10 adds the two new columns.
      const plan = sub.subscription_plans as unknown as Record<string, unknown> | null;
      const monthly = monthlyEquivalent(plan, sub.billing_cycle as string);
      mrr += monthly;
      if (tier !== "free") activePaid += 1;

      // C07: per real plan (name and price from subscription_plans).
      const planId = typeof sub.plan_id === "string" && sub.plan_id ? sub.plan_id : `tier:${tier}`;
      const entry = byPlan.get(planId) ?? {
        plan_id: planId,
        name_ar: typeof plan?.name_ar === "string" ? (plan.name_ar as string) : null,
        tier,
        count: 0,
        mrr: 0,
        price_monthly: typeof plan?.price_monthly === "number" ? (plan.price_monthly as number) : null,
      };
      entry.count += 1;
      entry.mrr += monthly;
      byPlan.set(planId, entry);
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
        active_paid_subscriptions: activePaid,
        active_subscriptions_by_plan: [...byPlan.values()]
          .map((p) => ({ ...p, mrr: Math.round(p.mrr * 100) / 100 }))
          .sort((a, b) => b.count - a.count),
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
