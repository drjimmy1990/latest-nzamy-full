import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildWebhookPayload } from "@/lib/n8n/payload";
import { RequestEvent, type RequestEventName } from "@/lib/events";

/**
 * POST /api/v1/n8n/trigger
 *
 * F7 — n8n readiness. Assembles a webhook payload for a service request and
 * LOGS it. Does NOT make any outbound HTTP call — n8n is not yet wired. This
 * endpoint exists so the frontend can call it now and the payload shape is
 * stable by the time n8n is connected.
 *
 * Body: { requestId: string, event?: string }
 * Response (200): { data: WebhookPayload, delivered: false, note: string }
 * Errors: 400 (missing requestId), 401 (unauth), 404 (row not found).
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

  let body: { requestId?: string; event?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestId = body.requestId;
  if (!requestId || typeof requestId !== "string") {
    return NextResponse.json(
      { error: "requestId is required" },
      { status: 400 },
    );
  }

  // Fetch the service_requests row (RLS-bound user client — only visible if
  // the user is a participant).
  const { data: serviceRequest, error: reqError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (reqError || !serviceRequest) {
    return NextResponse.json(
      { error: "Service request not found" },
      { status: 404 },
    );
  }

  // Fetch the actor's profile for name/role.
  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("id, display_name, user_type")
    .eq("id", user.id)
    .single();

  // Resolve the event name. Default to a status-derived namespaced event.
  const event: RequestEventName =
    body.event && typeof body.event === "string"
      ? (body.event as RequestEventName)
      : (serviceRequest.status === "completed"
          ? RequestEvent.SERVICE_REQUEST_COMPLETED
          : serviceRequest.status === "cancelled"
            ? RequestEvent.SERVICE_REQUEST_CANCELLED
            : RequestEvent.SERVICE_REQUEST_UPDATED);

  const timestamp = new Date().toISOString();
  const payload = buildWebhookPayload({
    event,
    timestamp,
    request: serviceRequest as unknown as Record<string, unknown>,
    actor: actorProfile as unknown as Record<string, unknown> | null,
  });

  // Log the assembled payload — this is the "delivery" surface until n8n is wired.
  console.log("[n8n trigger] payload:", JSON.stringify(payload));

  return NextResponse.json(
    {
      data: payload,
      delivered: false,
      note: "n8n not yet wired — payload assembled only",
    },
    { status: 200 },
  );
}