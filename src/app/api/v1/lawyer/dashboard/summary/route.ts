import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { stripInternalNotes } from "@/lib/services/internalNotes";

/** Shape `dashboard/lawyer/page.tsx` reads `recentActivity` as — keep it exact. */
interface RecentActivityRow {
  id: number;
  event: string;
  created_at: string;
  request_id: string;
}

/**
 * GET /api/v1/lawyer/dashboard/summary
 * Auth required (lawyer/firm/admin). Returns aggregated dashboard data.
 * Runs 7 queries in parallel; individual failures return defaults.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, userType, supabase } = auth;

    const uid = user.id;
    // Review round 3, fourth-door leak: assertRole's own doc comment says
    // "'admin' is always permitted" — it lets userType === "admin" through
    // regardless of the `allowed` list, and this route's own header comment
    // already documents "(lawyer/firm/admin)" as its caller set. So an admin
    // hitting this route is a real, already-intended case, not a
    // hypothetical — derive isAdmin from the userType assertRole already
    // resolved server-side (one query, already paid for) rather than pass
    // `false` unconditionally, which would wrongly hide an admin's own note
    // from them, or re-deriving it with a second profiles lookup, which
    // would just repeat work assertRole already did.
    const isAdmin = userType === "admin";

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
          .in("status", ["assigned", "in_review"]),
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
          .eq("status", "paid")
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
          .in("status", ["pending_assignment", "in_review"]),
      )
        .then(({ count }) => count ?? 0)
        .catch(() => 0),

      // 5. Recent cases (last 4)
      // Review round 3 — this select includes metadata, and assigned_to is
      // client-supplied at POST with no server-side check (see
      // service-requests/route.ts), so a lawyer/firm caller who self-assigned
      // an ai_workspace order at creation could otherwise read
      // metadata.internalNotes here once an admin delivers/cancels it
      // without an intervening claim. Same stripInternalNotes() helper used
      // by both service-requests routes and buildWebhookPayload.
      Promise.resolve(
        supabase
          .from("service_requests")
          .select("id, title, status, updated_at, type, metadata")
          .eq("assigned_to", uid)
          .in("status", ["assigned", "pending_assignment", "in_review", "completed"])
          .order("updated_at", { ascending: false })
          .limit(4),
      )
        .then(({ data }) =>
          (data ?? []).map((row) => ({
            ...row,
            metadata: stripInternalNotes(row.metadata as Record<string, unknown> | null | undefined, isAdmin),
          })),
        )
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
      // Same fix as /api/v1/lawyer/activity: filtering on actor_user_id alone
      // hid every admin-performed event, because the admin console claims and
      // delivers as the ADMIN — so a lawyer never saw his own order being
      // picked up or delivered. Scope by the REQUEST instead. The predicate is
      // an OR: `assigned_to` alone would be wrong (claiming reassigns it to
      // the admin) and `requester_user_id` alone would drop work a lawyer
      // receives rather than raises. It mirrors the "participants read request
      // events" policy that RLS enforces on this same client anyway.
      Promise.resolve(
        supabase
          .from("request_events")
          // the embed is only here so PostgREST can filter on it; it is
          // stripped below so the response shape stays exactly as before.
          .select("id, event, created_at, request_id, service_requests!inner(id)")
          .or(`requester_user_id.eq.${uid},assigned_to.eq.${uid}`, {
            referencedTable: "service_requests",
          })
          .order("created_at", { ascending: false })
          .limit(8)
          .returns<RecentActivityRow[]>(),
      )
        .then(({ data }) =>
          (data ?? []).map((row) => ({
            id: row.id,
            event: row.event,
            created_at: row.created_at,
            request_id: row.request_id,
          })),
        )
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
  } catch (err) {
    console.error("[lawyer/dashboard/summary GET] Unexpected error:", err);
    return NextResponse.json({
      activeCases: 0,
      pendingConsultations: 0,
      revenueThisMonth: 0,
      pendingTasks: 0,
      recentCases: [],
      upcomingDeadlines: [],
      recentActivity: [],
    });
  }
}
