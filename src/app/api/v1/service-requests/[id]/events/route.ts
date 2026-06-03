import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase
    .from("request_events")
    .insert({
      request_id: requestId,
      event: body.event,
      details: body.details ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
