import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordEvent, RequestEvent } from "@/lib/events";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";

/**
 * Map a raw service_requests row (snake_case) to the WorkflowRequest shape
 * (camelCase). `events` are attached separately by the GET [id] route and are
 * left untouched here.
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

  // F7 — fetch attachments for this request.
  // attachments schema: id, request_id, owner_user_id, file_name, storage_path,
  // mime_type, size_bytes, created_at. Map to the camelCase contract the
  // dashboard detail page expects.
  const { data: attachmentsRows } = await supabase
    .from("attachments")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });

  const attachments = (attachmentsRows ?? []).map((row) => {
    const a = row as Record<string, unknown>;
    return {
      id: a.id,
      name: a.file_name ?? "",
      file_size: a.size_bytes ?? null,
      storage_path: a.storage_path ?? "",
      ...(a.mime_type != null ? { mime_type: a.mime_type } : {}),
      created_at: a.created_at ?? null,
    };
  });

  return NextResponse.json({
    data: {
      ...toWorkflowRequest(serviceRequest as unknown as Record<string, unknown>),
      events: events ?? [],
      attachments,
    },
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

  // Auto-create audit event (namespaced vocabulary via recordEvent).
  const eventName = patch.status
    ? RequestEvent.SERVICE_REQUEST_STATUS_CHANGED
    : RequestEvent.SERVICE_REQUEST_UPDATED;
  await recordEvent({
    supabase,
    requestId: id,
    event: eventName,
    actorUserId: user.id,
  });

  // Best-effort push to n8n (inert unless N8N_WEBHOOK_BASE_URL is set): dispatch.ts
  // routes to /request-assigned or /request-completed by the new status. Never breaks the update.
  try {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, display_name, user_type")
      .eq("id", user.id)
      .single();
    await dispatchToN8n(
      eventName,
      buildWebhookPayload({
        event: eventName,
        timestamp: new Date().toISOString(),
        request: data as unknown as Record<string, unknown>,
        actor: actorProfile as unknown as Record<string, unknown> | null,
      }),
    );
  } catch (e) {
    console.error("[service-requests PATCH] n8n dispatch failed:", (e as Error).message);
  }

  return NextResponse.json({ data: toWorkflowRequest(data as unknown as Record<string, unknown>) });
}
