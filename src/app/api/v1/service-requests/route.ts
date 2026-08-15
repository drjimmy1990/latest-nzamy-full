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
      // Keep the 200 and the empty data — existing callers rely on this
      // graceful fallback and only ever read `data`/`total`. `degraded: true`
      // is purely additive: it says plainly that this empty list is a
      // failure, not a genuine absence, for any caller that opts in to
      // checking it (see listMyServiceOrders in
      // src/lib/services/serviceOrders.ts). Named `degraded`, not `error`,
      // so it can never collide with an `.error` key a caller might already
      // destructure off a *failed* (non-200) response elsewhere.
      return NextResponse.json({ data: [], total: 0, degraded: true });
    }

    const mapped = (data ?? []).map((row) => toWorkflowRequest(row as Record<string, unknown>));
    return NextResponse.json({ data: mapped, total: count ?? 0 });
  } catch (err) {
    console.error("[service-requests GET] Unexpected error:", err);
    // Same failure shape as the Supabase-error branch above (an empty list
    // standing in for a real error, kept at 200 for the same existing-caller
    // reasons) — so it gets the same `degraded: true` marker. Leaving this
    // branch unflagged while the other one was flagged would read as "this
    // path is known-benign," which it isn't: it's the identical defect on a
    // rarer trigger (anything that throws outside the Supabase query itself).
    return NextResponse.json({ data: [], total: 0, degraded: true });
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

    // Task 6d follow-up — clamp the creation-time status. Without this, a
    // client could POST a row already `status: "completed"` and it would
    // never touch the PATCH gate at all: invisible to the status-filtered
    // admin queue from birth. (This is a queue-visibility bug only — the
    // "تم إكمال طلبك" notification and the /request-completed n8n dispatch
    // live exclusively in PATCH's status-transition branch, so a
    // pre-completed row does not also send a false completion notice.)
    // Every real caller was enumerated (workflowService.ts/
    // clientWorkflowRepository.ts create wrappers, called from
    // AddHearingModal.tsx, AddCaseModal.tsx, lawyer/contracts/page.tsx,
    // lawyer/consultations/page.tsx, client/requests/new/page.tsx,
    // client/find-lawyer/page.tsx, client/consultation/new/page.tsx) and
    // none of them ever sends `completed`, `assigned`, or `cancelled` at
    // creation — the full observed set is exactly this allowlist.
    const CREATE_STATUS_ALLOWLIST = new Set([
      "draft",
      "in_review",
      "pending_payment",
      "pending_assignment",
    ]);
    const requestedStatus =
      typeof requestData.status === "string" ? requestData.status : undefined;
    const status =
      requestedStatus && CREATE_STATUS_ALLOWLIST.has(requestedStatus)
        ? requestedStatus
        : "pending_assignment";

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
        status,
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

    // Task 9b — bind intake attachments (uploaded via uploadDocumentFile(file)
    // with no requestId — see useDraftState.ts attachFile) to the order that
    // was just created, so the admin fulfillment routes (which check
    // attachment.request_id === order.id, deliberately, to close a
    // cross-tenant leak) can actually see them.
    //
    // Read the ids off the persisted row (serviceRequest.metadata), not the
    // raw request body, so this can never drift from what the order actually
    // stores. `attachments` has SELECT and INSERT RLS policies only (no
    // UPDATE policy exists anywhere in supabase/migrations/*.sql) — the
    // RLS-scoped `supabase` client cannot write this column at all, so the
    // service-role client is required, exactly as the payments insert below
    // already does for the same reason.
    //
    // Because the service-role client bypasses RLS entirely, ownership must
    // be enforced here in the query itself:
    //   - owner_user_id = auth.uid() — never trust the documentId's implied
    //     ownership; an attacker who guesses/enumerates someone else's
    //     attachment id must not get it bound to their own order.
    //   - request_id IS NULL — never let an already-bound attachment be
    //     re-bound. Without this, resubmitting a documentId that belongs to
    //     a PRIOR order (e.g. that order's now-delivered deliverable) would
    //     silently move it here, 404-ing the original client's download
    //     forever (deliverable/route.ts requires request_id === order.id)
    //     with no way back once that order is completed/cancelled.
    // Best-effort: a binding failure must not fail the order creation — the
    // client would otherwise lose their whole submission over an attachment.
    const orderMetadata = (serviceRequest.metadata ?? {}) as Record<string, unknown>;
    const metaAttachments = Array.isArray(orderMetadata.attachments) ? orderMetadata.attachments : [];
    const documentIds = metaAttachments
      .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>).documentId : undefined))
      .filter((v): v is string => typeof v === "string" && /^\d+$/.test(v));

    if (documentIds.length > 0) {
      try {
        const adminClient = await createServiceClient();
        const { data: bound, error: bindError } = await adminClient
          .from("attachments")
          .update({ request_id: serviceRequest.id })
          .in("id", documentIds)
          .eq("owner_user_id", user.id)
          .is("request_id", null)
          .select("id");

        if (bindError) {
          console.error(
            "[service-requests POST] attachment binding failed:",
            bindError.message, bindError.details, bindError.hint, bindError.code,
          );
        } else if ((bound?.length ?? 0) !== documentIds.length) {
          // Not necessarily a bug: a documentId the caller doesn't own, or
          // one already bound to another order, is silently excluded by the
          // filters above rather than erroring — this just makes that
          // otherwise-invisible drop visible in logs.
          console.error(
            `[service-requests POST] attachment binding partial: order=${serviceRequest.id} requested=${documentIds.length} bound=${bound?.length ?? 0}`,
          );
        }
      } catch (bindErr) {
        console.error("[service-requests POST] attachment binding error:", bindErr);
      }
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
