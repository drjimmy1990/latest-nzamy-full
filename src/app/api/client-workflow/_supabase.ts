import type { WorkflowRequest } from "@/lib/workflowStore";
import { getPaymentGatewayStatus } from "@/lib/access-control";

type WorkflowRequestInput = Omit<WorkflowRequest, "createdAt" | "auditTrail"> & {
  auditEvent?: string;
};

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasWorkflowBackendConfig() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

function restUrl(path: string) {
  return `${supabaseUrl}/rest/v1/${path}`;
}

function headers(extra?: HeadersInit): HeadersInit {
  return {
    apikey: serviceRoleKey ?? "",
    Authorization: `Bearer ${serviceRoleKey ?? ""}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...(extra ?? {}),
  };
}

function eventFromRequest(input: WorkflowRequestInput, createdAt: string) {
  return {
    request_id: input.id,
    event: input.auditEvent ?? "created",
    actor_name: input.requester.name || "backend",
    created_at: createdAt,
  };
}

function paymentStatusForBackend(status: WorkflowRequest["payment"]["status"]) {
  if (status === "paid") return "paid";
  if (status === "pending") return "requires_payment";
  return "not_required";
}

export function mapRequestRow(row: Record<string, unknown>): WorkflowRequest {
  const events = Array.isArray(row.request_events) ? row.request_events : [];
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    type: row.type as WorkflowRequest["type"],
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    requester: {
      ...((row.requester ?? {}) as WorkflowRequest["requester"]),
      userId: typeof row.requester_user_id === "string" ? row.requester_user_id : undefined,
    },
    receiver: row.receiver as WorkflowRequest["receiver"],
    status: row.status as WorkflowRequest["status"],
    payment: (row.payment ?? { amount: 0, status: "not_required" }) as WorkflowRequest["payment"],
    sourcePath: String(row.source_path ?? ""),
    metadata: (row.metadata ?? {}) as WorkflowRequest["metadata"],
    auditTrail: events.map((event) => {
      const item = event as Record<string, unknown>;
      return {
        at: String(item.created_at),
        event: String(item.event),
        by: String(item.actor_name ?? "backend"),
      };
    }),
  };
}

export async function listRequests(options: { receiver?: string; requesterUserId?: string } = {}): Promise<WorkflowRequest[]> {
  const filters = [
    options.receiver ? `receiver=eq.${encodeURIComponent(options.receiver)}` : "",
    options.requesterUserId ? `requester_user_id=eq.${encodeURIComponent(options.requesterUserId)}` : "",
  ].filter(Boolean);
  const filterQuery = filters.length ? `&${filters.join("&")}` : "";
  const response = await fetch(
    restUrl(`service_requests?select=*,request_events(*)&order=created_at.desc${filterQuery}`),
    { headers: headers({ Prefer: "" }), cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Supabase list failed: ${response.status}`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.map(mapRequestRow);
}

export async function insertRequest(input: WorkflowRequestInput): Promise<WorkflowRequest> {
  // Defense-in-depth: reject stub-paid requests while the admin gateway is disabled.
  // The client gates this too, but never trust the client.
  const provider = (input.metadata?.paymentProvider as string | undefined) ?? "stub";
  if (input.payment.amount > 0 && provider === "stub") {
    const gateway = await getPaymentGatewayStatus();
    if (gateway.disabled) {
      throw new Error("payments_disabled");
    }
  }

  const createdAt = new Date().toISOString();
  const requesterUserId =
    input.requester.userId ??
    (typeof input.metadata?.requesterUserId === "string" ? input.metadata.requesterUserId : null);
  const row = {
    id: input.id,
    requester_user_id: requesterUserId,
    type: input.type,
    title: input.title,
    description: input.description,
    requester: input.requester,
    receiver: input.receiver,
    status: input.status,
    payment: input.payment,
    source_path: input.sourcePath,
    metadata: input.metadata ?? {},
    created_at: createdAt,
  };

  const requestResponse = await fetch(restUrl("service_requests"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(row),
  });
  if (!requestResponse.ok) throw new Error(`Supabase insert failed: ${requestResponse.status}`);

  await fetch(restUrl("request_events"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(eventFromRequest(input, createdAt)),
  });

  const paymentResponse = await fetch(restUrl("payments"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      id: String(input.metadata?.paymentIntentId ?? `${input.id}-payment`),
      request_id: input.id,
      provider: String(input.metadata?.paymentProvider ?? "stub"),
      amount: input.payment.amount,
      currency: "SAR",
      status: paymentStatusForBackend(input.payment.status),
      metadata: {
        serviceId: input.metadata?.serviceId ?? input.metadata?.requestedType ?? null,
        quoteSource: input.metadata?.quoteSource ?? null,
      },
      created_at: createdAt,
    }),
  });
  if (!paymentResponse.ok) throw new Error(`Supabase payment insert failed: ${paymentResponse.status}`);

  const inserted = ((await requestResponse.json()) as Array<Record<string, unknown>>)[0];
  return {
    ...mapRequestRow({ ...inserted, request_events: [] }),
    auditTrail: [{ at: createdAt, event: input.auditEvent ?? "created", by: input.requester.name || "backend" }],
  };
}

export async function patchRequest(
  id: string,
  patch: Partial<Omit<WorkflowRequest, "id" | "createdAt" | "auditTrail">>,
  auditEvent = "updated",
  by = "backend",
): Promise<WorkflowRequest> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.requester !== undefined) row.requester = patch.requester;
  if (patch.receiver !== undefined) row.receiver = patch.receiver;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.payment !== undefined) row.payment = patch.payment;
  if (patch.sourcePath !== undefined) row.source_path = patch.sourcePath;
  if (patch.metadata !== undefined) row.metadata = patch.metadata;

  const response = await fetch(restUrl(`service_requests?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(`Supabase patch failed: ${response.status}`);

  const at = new Date().toISOString();
  await fetch(restUrl("request_events"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ request_id: id, event: auditEvent, actor_name: by, created_at: at }),
  });

  const updated = ((await response.json()) as Array<Record<string, unknown>>)[0];
  return {
    ...mapRequestRow({ ...updated, request_events: [] }),
    auditTrail: [{ at, event: auditEvent, by }],
  };
}
