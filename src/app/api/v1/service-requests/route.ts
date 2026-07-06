import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPaymentGatewayStatus } from "@/lib/access-control";
import { recordEvent, RequestEvent } from "@/lib/events";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";
import { recordNotification } from "@/lib/notify";

/**
 * Map a raw service_requests row (snake_case) to the WorkflowRequest shape
 * (camelCase) expected by the frontend. Keeps `events` separate (only set by
 * the [id] GET route).
 */
function toWorkflowRequest(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    createdAt: row.created_at ?? null,
    sourcePath: row.source_path ?? "",
    assignedTo: row.assigned_to ?? null,
    auditTrail: [],
  };
}

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

    const mapped = (data ?? []).map((row) => toWorkflowRequest(row as Record<string, unknown>));
    return NextResponse.json({ data: mapped, total: count ?? 0 });
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

    // B12 — payment-gateway gate: if a paid request is being created, ensure the
    // payments gateway is enabled. Free requests (amount === 0 / not_required)
    // are unaffected.
    const payment = body.payment;
    const isPaidRequest =
      payment && typeof payment === "object" && Number(payment.amount) > 0;

    if (isPaidRequest) {
      const gateway = await getPaymentGatewayStatus();
      if (gateway.status === "disabled") {
        return NextResponse.json(
          { error: "الدفع غير متاح حالياً" },
          { status: 402 },
        );
      }
    }

    // Create the service request
    // Only include columns that exist in the service_requests table:
    // id, requester_user_id, type, title, description, requester, receiver,
    // assigned_to, status, payment, source_path, metadata, created_at, updated_at
    // B1 — service_requests.id is text PK with NO default; always supply one.
    const { data: serviceRequest, error: reqError } = await supabase
      .from("service_requests")
      .insert({
        id: requestData.id ?? crypto.randomUUID(),
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

    // Create the initial event (namespaced vocabulary via recordEvent).
    const requestEvent = body.request_event ?? body.auditEvent;
    const actorName =
      typeof requestData.requester?.name === "string"
        ? requestData.requester.name
        : undefined;
    if (requestEvent) {
      // Map legacy free-text values to the namespaced vocabulary.
      const rawEvent =
        typeof requestEvent.event === "string" ? requestEvent.event : "created";
      const eventName =
        rawEvent === "created" || rawEvent === "service_request.created"
          ? RequestEvent.SERVICE_REQUEST_CREATED
          : rawEvent;
      await recordEvent({
        supabase,
        requestId: serviceRequest.id,
        event: eventName,
        actorUserId: user.id,
        ...(actorName ? { actorName } : {}),
      });
    } else {
      // Always record a created event for traceability.
      await recordEvent({
        supabase,
        requestId: serviceRequest.id,
        event: RequestEvent.SERVICE_REQUEST_CREATED,
        actorUserId: user.id,
        ...(actorName ? { actorName } : {}),
      });
    }

    // Best-effort push to n8n (inert unless N8N_WEBHOOK_BASE_URL is set) so the
    // "new request" notification workflow (/new-request) fires. Never breaks the create.
    try {
      const { data: actorProfile } = await supabase
        .from("profiles")
        .select("id, display_name, user_type")
        .eq("id", user.id)
        .single();
      await dispatchToN8n(
        RequestEvent.SERVICE_REQUEST_CREATED,
        buildWebhookPayload({
          event: RequestEvent.SERVICE_REQUEST_CREATED,
          timestamp: new Date().toISOString(),
          request: serviceRequest as unknown as Record<string, unknown>,
          actor: actorProfile as unknown as Record<string, unknown> | null,
        }),
      );
    } catch (e) {
      console.error("[service-requests POST] n8n dispatch failed:", (e as Error).message);
    }

    // In-app confirmation notification to the requester (best-effort).
    await recordNotification({
      userId: user.id,
      title: "تم استلام طلبك",
      body: `طلبك «${serviceRequest.title ?? ""}» قيد المعالجة وسنعلمك بأي تحديث.`,
      href: "/dashboard",
    });

    // B2/D7 — Create the payment record if this is a paid request. The payments
    // table has NO INSERT RLS policy, so we use the service-role client. The
    // table has columns: id, request_id, provider, amount, currency, status,
    // metadata, created_at (NO payer_user_id column). We store the payer in
    // metadata for now. Wrap in try/catch: log on failure but do NOT fail the
    // whole request — the service_request is the primary record.
    if (isPaidRequest) {
      try {
        const adminClient = await createServiceClient();
        const { error: payError } = await adminClient.from("payments").insert({
          id: crypto.randomUUID(),
          request_id: serviceRequest.id,
          provider: payment.provider ?? "stub",
          amount: payment.amount,
          currency: payment.currency ?? "SAR",
          status: payment.status ?? "pending",
          metadata: {
            payer_user_id: user.id,
            ...(payment.metadata ?? {}),
          },
        });
        if (payError) {
          console.error(
            "[service-requests POST] payment insert failed:",
            payError.message,
            payError.details,
            payError.hint,
            payError.code,
          );
        }
      } catch (payErr) {
        console.error("[service-requests POST] payment insert error:", payErr);
      }
    }

    return NextResponse.json(
      { data: toWorkflowRequest(serviceRequest as unknown as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    console.error("[service-requests POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
