import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/service-requests/[id] — Get request detail with events
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const { data: serviceRequest, error } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !serviceRequest) {
    return NextResponse.json(
      { error: "Service request not found" },
      { status: 404 },
    );
  }

  // Fetch events for this request
  const { data: events } = await supabase
    .from("request_events")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    data: { ...serviceRequest, events: events ?? [] },
  });
}

/**
 * PATCH /api/v1/service-requests/[id] — Update request status/fields
 * Auto-creates an audit event for the status change.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();

  const rawPatch = body.patch ?? body;
  const keyMap: Record<string, string> = {
    sourcePath: 'source_path',
    assignedTo: 'assigned_to',
    auditEvent: '__skip__',
  };
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawPatch)) {
    if (keyMap[k] === '__skip__') continue;
    patch[keyMap[k] ?? k] = v;
  }

  const { data, error } = await supabase
    .from("service_requests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-create audit event
  await supabase.from("request_events").insert({
    request_id: id,
    event: patch.status ? "status_change" : "updated",
    actor_user_id: user.id,
  });

  return NextResponse.json({ data });
}
