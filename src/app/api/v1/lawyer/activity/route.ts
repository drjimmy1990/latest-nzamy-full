import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyer/activity
 * Auth required. Returns activity feed for this lawyer.
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

    // Get request events where lawyer is the actor
    const { data: events } = await supabase
      .from("request_events")
      .select("id, event, created_at, request_id")
      .eq("actor_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(30);

    // Get audit log entries
    const { data: auditEntries } = await supabase
      .from("admin_audit_events")
      .select("id, action, target_type, target_id, metadata, created_at")
      .eq("actor_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);

    // Merge and sort
    const activities = [
      ...(events ?? []).map((e) => ({
        id: e.id,
        type: "event" as const,
        action: e.event,
        entityId: e.request_id,
        createdAt: e.created_at,
      })),
      ...(auditEntries ?? []).map((a) => ({
        id: a.id,
        type: "audit" as const,
        action: a.action,
        metadata: a.metadata,
        entityId: a.target_id,
        createdAt: a.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
     .slice(0, 30);

    return NextResponse.json(activities);
  } catch (err) {
    console.error("[lawyer/activity GET] Unexpected error:", err);
    return NextResponse.json([]);
  }
}
