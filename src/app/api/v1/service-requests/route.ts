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
  try {
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
      console.error("[service-requests GET] Supabase error:", error.message, error.details, error.hint, error.code);
      // Return empty data so frontend falls back to local store gracefully
      return NextResponse.json({ data: [], total: 0 });
    }

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[service-requests GET] Unexpected error:", err);
    return NextResponse.json({ data: [], total: 0 });
  }
}

/**
 * POST /api/v1/service-requests — Create a service request
 * Creates the request, adds the initial event, and creates a payment record.
 */
export async function POST(request: NextRequest) {
  try {
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
    // Only include columns that exist in the service_requests table:
    // id, requester_user_id, type, title, description, requester, receiver,
    // assigned_to, status, payment, source_path, metadata, created_at, updated_at
    const { data: serviceRequest, error: reqError } = await supabase
      .from("service_requests")
      .insert({
        title: requestData.title,
        description: requestData.description ?? '',
        type: requestData.type ?? 'service',
        status: requestData.status ?? 'pending_assignment',
        requester_user_id: user.id,
        source_path: requestData.sourcePath ?? requestData.source_path ?? '',
        assigned_to: requestData.assignedTo ?? requestData.assigned_to ?? null,
        receiver: requestData.receiver ?? 'lawyer',
        requester: requestData.requester ?? {},
        payment: requestData.payment ?? { amount: 0, status: "not_required" },
        metadata: requestData.metadata ?? {},
      })
      .select()
      .single();

    if (reqError) {
      console.error("[service-requests POST] Supabase error:", reqError.message, reqError.details, reqError.hint, reqError.code);
      return NextResponse.json({ error: reqError.message, code: reqError.code, hint: reqError.hint }, { status: 500 });
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
    if (payment && typeof payment === "object" && payment.amount) {
      await supabase.from("payments").insert({
        request_id: serviceRequest.id,
        payer_user_id: user.id,
        ...payment,
      });
    }

    return NextResponse.json({ data: serviceRequest }, { status: 201 });
  } catch (err) {
    console.error("[service-requests POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
