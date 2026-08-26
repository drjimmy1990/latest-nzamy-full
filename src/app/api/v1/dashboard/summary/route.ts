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
    activeCasesResult,
    nextAppointment,
    recentMessages,
    subscription,
    communityPreview,
    walletBalance,
    unreadNotifications,
  ] = await Promise.all([
    // 1. Active cases — the three most recent, PLUS how many there really are.
    //
    // WHY THE COUNT — the row list is capped at 3 for the dashboard's preview
    // grid, and the landing page prints the number of open orders in
    // its welcome line and in the section badge. Printing the length of a
    // capped list tells a client with seven open orders that they have three,
    // which is a false statement about their own file. `count: "exact"`
    // counts every row matching the filters and ignores the limit.
    //
    // NAMED COLUMNS, not `select("*")` — the client dashboard is the only
    // consumer of this field and needs exactly these five. The wider select
    // also shipped the `requester` and `payment` blobs to the browser for no
    // reader at all.
    Promise.resolve(
      supabase
        .from("service_requests")
        .select("id, title, status, metadata, created_at", { count: "exact" })
        .eq("requester_user_id", uid)
        .in("status", ["pending_assignment", "assigned", "in_review"])
        .order("created_at", { ascending: false })
        .limit(3),
    )
      .then(({ data, count }) => ({
        rows: data ?? [],
        // A null count (PostgREST omitted the range header) must not become a
        // zero that contradicts the rows we are about to return.
        total: count ?? (data?.length ?? 0),
      }))
      .catch(() => ({ rows: [], total: 0 })),

    // 2. Next appointment
    Promise.resolve(
      supabase
        .from("consultations")
        .select("*")
        .eq("requester_user_id", uid)
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single(),
    )
      .then(({ data }) => data ?? null)
      .catch(() => null),

    // 3. Recent messages (rooms the user participates in)
    (async () => {
      const { data: parts } = await supabase
        .from("chat_participants")
        .select("room_id")
        .eq("user_id", uid);
      const roomIds = (parts ?? []).map((p) => p.room_id);
      if (roomIds.length === 0) return [];
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    })()
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
    activeCases: activeCasesResult.rows,
    // The real number of open orders, which `activeCases.length` is not: that
    // array is capped at 3 above.
    activeCasesTotal: activeCasesResult.total,
    nextAppointment,
    recentMessages,
    subscription,
    communityPreview,
    walletBalance,
    unreadNotifications,
  });
}
