import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyer/clients
 * Auth required. Returns clients who have service requests assigned to this lawyer.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const uid = user.id;

    // Get all service requests assigned to this lawyer
    const { data: requests, error: reqError } = await supabase
      .from("service_requests")
      .select("requester_user_id, status, type, created_at")
      .eq("assigned_to", uid);

    if (reqError || !requests || requests.length === 0) {
      return NextResponse.json([]);
    }

    // Group by sender_id to get unique clients with stats
    const clientMap = new Map<string, { requestCount: number; activeCount: number; lastActivity: string }>();
    for (const req of requests) {
      const existing = clientMap.get(req.requester_user_id) || { requestCount: 0, activeCount: 0, lastActivity: "" };
      existing.requestCount++;
      if (["assigned", "in_progress", "pending"].includes(req.status)) {
        existing.activeCount++;
      }
      if (!existing.lastActivity || req.created_at > existing.lastActivity) {
        existing.lastActivity = req.created_at;
      }
      clientMap.set(req.requester_user_id, existing);
    }

    // Fetch profiles for these client IDs
    const clientIds = Array.from(clientMap.keys());
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email, phone, avatar_url, user_type")
      .in("id", clientIds);

    const clients = (profiles ?? []).map((profile) => {
      const stats = clientMap.get(profile.id) || { requestCount: 0, activeCount: 0, lastActivity: "" };
      return {
        id: profile.id,
        name: profile.display_name || "عميل نظامي",
        email: profile.email,
        phone: profile.phone,
        avatar: profile.avatar_url,
        userType: profile.user_type,
        ...stats,
      };
    });

    return NextResponse.json(clients);
  } catch (err) {
    console.error("[lawyer/clients GET] Unexpected error:", err);
    return NextResponse.json([]);
  }
}
