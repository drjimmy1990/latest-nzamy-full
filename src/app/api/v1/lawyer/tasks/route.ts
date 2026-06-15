import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyer/tasks
 * Auth required. Returns tasks for this lawyer derived from request events.
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

  // Get active service requests assigned to this lawyer as implicit tasks
  const { data: requests } = await supabase
    .from("service_requests")
    .select("id, title, status, type, created_at, updated_at, metadata")
    .eq("assigned_to", uid)
    .in("status", ["assigned", "submitted", "in_review"])
    .order("created_at", { ascending: false })
    .limit(50);

  // Get recent events for these requests
  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: events } = requestIds.length > 0
    ? await supabase
        .from("request_events")
        .select("id, request_id, event, created_at")
        .in("request_id", requestIds)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };

  // Map requests to task-like objects
  const tasks = (requests ?? []).map((req) => {
    const reqEvents = (events ?? []).filter((e) => e.request_id === req.id);
    return {
      id: req.id,
      title: req.title || "مهمة بدون عنوان",
      status: req.status,
      type: req.type,
      priority: "medium",
      createdAt: req.created_at,
      updatedAt: req.updated_at,
      eventsCount: reqEvents.length,
      lastEvent: reqEvents[0] || null,
    };
  });

  return NextResponse.json(tasks);
}

/**
 * PATCH /api/v1/lawyer/tasks
 * Update a task (service request) status.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { taskId, status } = body;

  if (!taskId || !status) {
    return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("service_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("assigned_to", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
