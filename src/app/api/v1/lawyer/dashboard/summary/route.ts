import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyer/dashboard/summary
 * Auth required. Returns aggregated dashboard data for a lawyer.
 * Runs 7 queries in parallel; individual failures return defaults.
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

  const [
    activeCases,
    pendingConsultations,
    revenueThisMonth,
    pendingTasks,
    recentCases,
    upcomingDeadlines,
    recentActivity,
  ] = await Promise.all([
    // 1. Active cases count
    Promise.resolve(
      supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", uid)
        .in("status", ["assigned", "submitted", "in_review"]),
    )
      .then(({ count }) => count ?? 0)
      .catch(() => 0),

    // 2. Pending consultations count
    Promise.resolve(
      supabase
        .from("consultations")
        .select("id", { count: "exact", head: true })
        .eq("lawyer_user_id", uid)
        .in("status", ["pending", "confirmed"]),
    )
      .then(({ count }) => count ?? 0)
      .catch(() => 0),

    // 3. Revenue this month (sum of completed payments)
    Promise.resolve(
      supabase
        .from("payments")
        .select("amount, request_id")
        .eq("status", "succeeded")
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    )
      .then(({ data }) => {
        if (!data || data.length === 0) return 0;
        return data.reduce((sum: number, p: { amount: number }) => sum + (p.amount ?? 0), 0);
      })
      .catch(() => 0),

    // 4. Pending tasks (upcoming hearings as tasks proxy)
    Promise.resolve(
      supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", uid)
        .in("status", ["submitted", "in_review"]),
    )
      .then(({ count }) => count ?? 0)
      .catch(() => 0),

    // 5. Recent cases (last 4)
    Promise.resolve(
      supabase
        .from("service_requests")
        .select("id, title, status, updated_at, type, metadata")
        .eq("assigned_to", uid)
        .in("status", ["assigned", "submitted", "in_review", "completed"])
        .order("updated_at", { ascending: false })
        .limit(4),
    )
      .then(({ data }) => data ?? [])
      .catch(() => []),

    // 6. Upcoming deadlines (consultations + hearings in next 14 days)
    Promise.resolve(
      supabase
        .from("consultations")
        .select("id, scheduled_at, mode, requester_user_id")
        .eq("lawyer_user_id", uid)
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(5),
    )
      .then(({ data }) => data ?? [])
      .catch(() => []),

    // 7. Recent activity (from request_events)
    Promise.resolve(
      supabase
        .from("request_events")
        .select("id, event, created_at, request_id")
        .eq("actor_user_id", uid)
        .order("created_at", { ascending: false })
        .limit(8),
    )
      .then(({ data }) => data ?? [])
      .catch(() => []),
  ]);

  return NextResponse.json({
    activeCases,
    pendingConsultations,
    revenueThisMonth,
    pendingTasks,
    recentCases,
    upcomingDeadlines,
    recentActivity,
  });
}
