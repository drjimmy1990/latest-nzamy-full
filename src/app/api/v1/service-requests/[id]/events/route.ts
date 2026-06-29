import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordEvent, namespaceEvent, RequestEvent } from "@/lib/events";

/**
 * GET /api/v1/service-requests/[id]/events — Get timeline events for a request
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

  const { id: requestId } = await context.params;

  const { data, error } = await supabase
    .from("request_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/v1/service-requests/[id]/events — Add an event to a request
 * Body: { event, details? }
 */
export async function POST(
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

  const { id: requestId } = await context.params;
  const body = await request.json();

  if (!body.event) {
    return NextResponse.json(
      { error: "event is required" },
      { status: 400 },
    );
  }

  // Verify the request exists
  const { data: serviceRequest, error: reqError } = await supabase
    .from("service_requests")
    .select("id")
    .eq("id", requestId)
    .single();

  if (reqError || !serviceRequest) {
    return NextResponse.json(
      { error: "Service request not found" },
      { status: 404 },
    );
  }

  // F7 — record via the shared helper for a consistent insert shape. Force
  // namespacing through `namespaceEvent` so legacy free-text events (e.g.
  // `client_consultation_created`) are mapped to the canonical vocabulary
  // before being persisted. Unknown strings are still inserted (we never drop
  // audit data) but a warning is logged so unmapped events surface for triage.
  const namespaced = namespaceEvent(body.event, RequestEvent.SERVICE_REQUEST_CREATED);
  if (namespaced === body.event && !body.event.includes(".")) {
    console.warn(
      "[events POST] unmapped event string inserted verbatim — add it to namespaceEvent:",
      "event=", body.event,
      "request_id=", requestId,
    );
  }
  await recordEvent({
    supabase,
    requestId,
    event: namespaced,
    actorUserId: user.id,
    ...(typeof body.actor_name === "string" ? { actorName: body.actor_name } : {}),
  });

  // Re-fetch the latest event for this request so we can return the created row.
  const { data, error } = await supabase
    .from("request_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
