import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/dashboard/summary — Aggregated dashboard data
 * Auth required.
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

  // Run all queries in parallel — each wrapped to return defaults on failure
  const [
    activeCases,
    nextAppointment,
    recentMessages,
    subscription,
    communityPreview,
    walletBalance,
    unreadNotifications,
  ] = await Promise.all([
    // 1. Active cases
    Promise.resolve(
      supabase
        .from("service_requests")
        .select("*")
        .eq("sender_id", uid)
        .in("status", ["pending", "in_progress", "assigned"])
        .order("created_at", { ascending: false })
        .limit(3),
    )
      .then(({ data }) => data ?? [])
      .catch(() => []),

    // 2. Next appointment
    Promise.resolve(
      supabase
        .from("consultations")
        .select("*")
        .eq("client_id", uid)
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single(),
    )
      .then(({ data }) => data ?? null)
      .catch(() => null),

    // 3. Recent messages (rooms the user participates in)
    Promise.resolve(
      supabase
        .from("chat_messages")
        .select("*, chat_rooms!inner(id, participant_ids)")
        .contains("chat_rooms.participant_ids", [uid])
        .order("created_at", { ascending: false })
        .limit(3),
    )
      .then(({ data }) => data ?? [])
      .catch(() => []),

    // 4. Active subscription + plan info
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

    // 5. Community preview (latest posts)
    Promise.resolve(
      supabase
        .from("community_posts")
        .select("id, title, category, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
    )
      .then(({ data }) => data ?? [])
      .catch(() => []),

    // 6. Wallet balance (sum of transaction amounts)
    Promise.resolve(
      supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("user_id", uid),
    )
      .then(({ data }) => {
        if (!data || data.length === 0) return 0;
        return data.reduce(
          (sum: number, t: { amount: number }) => sum + (t.amount ?? 0),
          0,
        );
      })
      .catch(() => 0),

    // 7. Unread notifications count
    Promise.resolve(
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .is("read_at", null),
    )
      .then(({ count }) => count ?? 0)
      .catch(() => 0),
  ]);

  return NextResponse.json({
    activeCases,
    nextAppointment,
    recentMessages,
    subscription,
    communityPreview,
    walletBalance,
    unreadNotifications,
  });
}
