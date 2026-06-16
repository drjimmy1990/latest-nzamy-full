import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/service-requests — List service requests
 * Query params:
 *   - receiver (filter by receiver)
 *   - requester_user_id (filter by requester)
 *   - status (filter by status)
 *   - limit (default: 20)
 *   - offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const receiver = searchParams.get("receiver");
  const requesterUserId = searchParams.get("requester_user_id");
  const status = searchParams.get("status");

  let query = supabase
    .from("service_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (receiver) {
    query = query.eq("receiver", receiver);
  }

  if (requesterUserId) {
    query = query.eq("requester_user_id", requesterUserId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count });
}

/**
 * POST /api/v1/service-requests — Create a service request
 * Creates the request, adds the initial event, and creates a payment record.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Support both wrapped { request: {...} } and flat payloads
  const requestData = body.request ?? body;

  // Create the service request
  const { data: serviceRequest, error: reqError } = await supabase
    .from("service_requests")
    .insert({
      title: requestData.title,
      description: requestData.description ?? null,
      type: requestData.type ?? 'service',
      priority: requestData.priority ?? 'medium',
      status: requestData.status ?? 'pending_assignment',
      requester_user_id: user.id,
      budget: requestData.budget ?? null,
      category: requestData.category ?? null,
      source_path: requestData.sourcePath ?? requestData.source_path ?? null,
      assigned_to: requestData.assignedTo ?? requestData.assigned_to ?? null,
      receiver: requestData.receiver ?? null,
      requester: requestData.requester ?? null,
      payment: requestData.payment ?? null,
      metadata: requestData.metadata ?? {},
    })
    .select()
    .single();

  if (reqError) {
    return NextResponse.json({ error: reqError.message }, { status: 500 });
  }

  // Create the initial event
  const requestEvent = body.request_event ?? body.auditEvent;
  if (requestEvent) {
    await supabase.from("request_events").insert({
      request_id: serviceRequest.id,
      event: requestEvent.event ?? "created",
      actor_user_id: user.id,
    });
  }

  // Create the payment record if provided
  const payment = body.payment;
  if (payment) {
    await supabase.from("payments").insert({
      request_id: serviceRequest.id,
      payer_user_id: user.id,
      ...payment,
    });
  }

  return NextResponse.json({ data: serviceRequest }, { status: 201 });
}
