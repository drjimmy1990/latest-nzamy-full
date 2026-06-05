import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyer/activity
 * Auth required. Returns activity feed for this lawyer.
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

  // Get request events where lawyer is the actor
  const { data: events } = await supabase
    .from("request_events")
    .select("id, event_type, payload, created_at, request_id")
    .eq("actor_id", uid)
    .order("created_at", { ascending: false })
    .limit(30);

  // Get audit log entries
  const { data: auditEntries } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, metadata, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(20);

  // Merge and sort
  const activities = [
    ...(events ?? []).map((e) => ({
      id: e.id,
      type: "event" as const,
      action: e.event_type,
      payload: e.payload,
      entityId: e.request_id,
      createdAt: e.created_at,
    })),
    ...(auditEntries ?? []).map((a) => ({
      id: a.id,
      type: "audit" as const,
      action: a.action,
      payload: a.metadata,
      entityId: a.entity_id,
      createdAt: a.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   .slice(0, 30);

  return NextResponse.json(activities);
}
