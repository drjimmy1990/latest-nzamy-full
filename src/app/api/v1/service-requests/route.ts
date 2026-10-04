import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPaymentGatewayStatus } from "@/lib/access-control";
import { recordEvent, RequestEvent } from "@/lib/events";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";
import { recordNotification } from "@/lib/notify";
import { stripInternalNotes } from "@/lib/services/internalNotes";
import { checkOrderIntake, intakeErrorMessageAr } from "@/lib/services/intakeGuard";
import { validateServiceRequestCreate } from "@/lib/services/serviceRequestIntake";
import { resolveServiceRequestEntityScope } from "@/lib/auth/serviceRequestEntityScope";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";

async function resolveActiveEntityIds(supabase: SupabaseClient, userId: string) {
  const [firmResult, businessResult, ownedFirmResult, ownedBusinessResult] = await Promise.all([
    supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("firm_profiles")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (firmResult.error) {
    console.error(
      "[service-requests] firm membership lookup failed:",
      firmResult.error.message,
      firmResult.error.code,
    );
  }
  if (businessResult.error) {
    console.error(
      "[service-requests] business membership lookup failed:",
      businessResult.error.message,
      businessResult.error.code,
    );
  }
  if (ownedFirmResult.error) {
    console.error(
      "[service-requests] owned firm lookup failed:",
      ownedFirmResult.error.message,
      ownedFirmResult.error.code,
    );
  }
  if (ownedBusinessResult.error) {
    console.error(
      "[service-requests] owned business lookup failed:",
      ownedBusinessResult.error.message,
      ownedBusinessResult.error.code,
    );
  }

  const memberFirmId = !firmResult.error
    ? (firmResult.data?.firm_id as string | undefined) ?? null
    : null;
  const memberBusinessId = !businessResult.error
    ? (businessResult.data?.business_id as string | undefined) ?? null
    : null;

  return {
    firmId:
      memberFirmId ??
      (!ownedFirmResult.error
        ? (ownedFirmResult.data?.id as string | undefined) ?? null
        : null),
    businessId:
      memberBusinessId ??
      (!ownedBusinessResult.error
        ? (ownedBusinessResult.data?.id as string | undefined) ?? null
        : null),
  };
}

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

    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const receiver = searchParams.get("receiver");
    const requesterUserId = searchParams.get("requester_user_id");
    const status = searchParams.get("status");
    // Phase 2 (20260903_phase2_clients_and_firm_membership.sql) — «قضايا هذا
    // الموكّل» on the client file: every case linked to one lawyer_clients card.
    const lawyerClientId = searchParams.get("lawyer_client_id");

    let query = supabase
      .from("service_requests")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // When filtering by receiver, also include rows the current user created
    // themselves (requester_user_id = auth.uid()), so a lawyer who adds their
    // own cases via AddCaseModal can see them in /dashboard/lawyer/cases.
    // Without this OR, cases with receiver = "lawyer" that were inserted by
    // the lawyer's own uid were invisible: the RLS allowed them but the
    // query's WHERE receiver = ? alone matched, yet the page got back 0 rows
    // because RLS then added AND (requester_user_id = uid OR assigned_to = uid)
    // correctly — the real root was the INSERT writing requester_user_id from
    // auth (correct), but GetByReceiver never scoped to the user's own uid.
    if (receiver) {
      query = query.or(
        `receiver.eq.${receiver},requester_user_id.eq.${user.id}`
      );
    } else {
      const entityIds = await resolveActiveEntityIds(supabase, user.id);
      // Entity rows are protected by RLS. Adding the old personal WHERE here
      // would remove colleagues' rows after RLS had correctly admitted them.
      if (!entityIds.firmId && !entityIds.businessId) {
        query = query.or(
          `requester_user_id.eq.${user.id},assigned_to.eq.${user.id}`
        );
      }
    }

    if (requesterUserId) {
      query = query.eq("requester_user_id", requesterUserId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (lawyerClientId) {
      query = query.eq("lawyer_client_id", lawyerClientId);
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

    // Critical fix (review round 2) — this list is exactly what
    // listMyServiceOrders() / طلباتي (src/app/ai/orders/page.tsx) reads for a
    // client's own orders, and `toWorkflowRequest` used to spread `row`
    // wholesale, metadata.internalNotes included. Closing that leak only in
    // the [id] detail route left it wide open here. Same admin-vs-not
    // resolution as that route (profiles.user_type, not RLS/participation,
    // since an admin who claimed an ai_workspace order legitimately sees
    // their own note), but resolved ONCE for the whole page instead of once
    // per row — a per-row profile lookup would turn one list fetch into
    // N+1 queries. Only pays for that one lookup when at least one row on
    // this page actually carries the field.
    const rows = (data ?? []) as Record<string, unknown>[];
    const anyInternalNotes = rows.some((row) => {
      const m = row.metadata;
      return !!m && typeof m === "object" && "internalNotes" in (m as Record<string, unknown>);
    });
    let isAdmin = false;
    if (anyInternalNotes) {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = (callerProfile?.user_type as string | undefined) === "admin";
    }
    const mapped = rows.map((row) =>
      toWorkflowRequest({
        ...row,
        metadata: stripInternalNotes(row.metadata as Record<string, unknown> | null | undefined, isAdmin),
      }),
    );
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

    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Support both wrapped { request: {...} } and flat payloads
    const requestData = body.request ?? body;

    // UAT-LIVE-CASE-001 — shape contract for the row's OWN columns, before
    // anything is read, charged or written. Distinct from checkOrderIntake
    // below, which validates `metadata.intake` for the four AI services only
    // and passes every other caller through: this route took `title` verbatim
    // into a `text not null` column with no emptiness or length check, so an
    // untitled case persisted and the one form that could produce it invented
    // a title instead of refusing. Placed here rather than immediately before
    // the insert so a malformed body cannot first trip the payment-gateway
    // gate, the entity-scope resolution or the lawyer_clients lookup and come
    // back with an unrelated reason. See src/lib/services/serviceRequestIntake.ts.
    const shape = validateServiceRequestCreate(requestData);
    if (!shape.ok) {
      return NextResponse.json({ error: shape.error }, { status: shape.status });
    }

    // B12 — payment-gateway gate: if a paid request is being created, ensure the
    // payments gateway is enabled. Free requests (amount === 0 / not_required)
    // are unaffected.
    //
    // Read off `requestData`, NOT `body`: the row's own `payment` column is
    // written from `requestData.payment` below, and the payments-table insert
    // reads this same object — so the gate has to look at exactly the object
    // that gets persisted. Reading `body.payment` here while the insert read
    // `requestData.payment` meant a wrapped `{ request: { payment: {...} } }`
    // payload skipped the gate and still wrote a paid row. Latent — every
    // current caller posts flat — but the two must stay in sync by
    // construction, not by coincidence.
    const payment = requestData.payment;
    const isPaidRequest =
      payment && typeof payment === "object" && Number(payment.amount) > 0;

    let persistedPayment = {
      amount: 0,
      currency: "SAR",
      status: "not_required",
      provider: null as string | null,
    };

    if (isPaidRequest) {
      const gateway = await getPaymentGatewayStatus();
      if (gateway.disabled) {
        return NextResponse.json(
          { error: "الدفع غير متاح حالياً" },
          { status: 402 },
        );
      }

      // Never trust provider/status/currency supplied by the browser. The only
      // currently supported paid mode is the explicitly enabled staging stub,
      // and even there every positive amount remains pending until a future
      // signed provider webhook implements confirmation.
      persistedPayment = {
        amount: Number(payment.amount),
        currency: "SAR",
        status: "pending",
        provider: gateway.provider,
      };
    }

    // Server-side intake contract. The four AI wizards each validate before
    // submitting, but that check lived only in the browser: `metadata` was
    // stored verbatim below, so a direct POST could persist a contracts draft
    // with unnamed parties, a review with no contract file, or a wargaming
    // critique with no memo — an order the admin has no way to fulfil.
    // checkOrderIntake re-runs the very same validators the wizard ran (see
    // src/lib/services/intakeGuard.ts). Anything that is not one of the four AI
    // services — consultation bookings, case requests, contract requests, every
    // other createWorkflowRequest caller — carries no `metadata.intake` and
    // passes through untouched.
    const intakeCheck = checkOrderIntake(requestData.metadata);
    if (intakeCheck.kind === "invalid") {
      console.error(
        `[service-requests POST] intake rejected: service=${intakeCheck.service} errors=${intakeCheck.errors.join(" | ")}`,
      );
      return NextResponse.json(
        { error: intakeErrorMessageAr(intakeCheck.errors) },
        { status: 400 },
      );
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
    let status =
      requestedStatus && CREATE_STATUS_ALLOWLIST.has(requestedStatus)
        ? requestedStatus
        : "pending_assignment";

    // A client can never confirm its own payment. All paid requests remain
    // pending until a future signed, idempotent provider webhook exists.
    if (isPaidRequest) {
      status = "pending_payment";
    }

    // Entity ownership is resolved from active member/owner rows only. The
    // client may request a *kind* of entity context but can never supply an id.
    // resolveServiceRequestEntityScope then selects at most one side, so a
    // seconded lawyer who belongs to both a firm and a company never exposes a
    // single request to both teams.
    const [entityIds, actorProfileResult] = await Promise.all([
      resolveActiveEntityIds(supabase, user.id),
      supabase
        .from("profiles")
        .select("id, display_name, user_type")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    if (actorProfileResult.error) {
      console.error(
        "[service-requests POST] actor profile lookup failed:",
        actorProfileResult.error.message,
        actorProfileResult.error.code,
      );
    }
    const actorProfile = actorProfileResult.error ? null : actorProfileResult.data;
    const entityScope = resolveServiceRequestEntityScope({
      ...entityIds,
      requestedScope: requestData.entityScope ?? requestData.entity_scope,
      sourcePath: requestData.sourcePath ?? requestData.source_path,
      userType:
        actorProfile && typeof actorProfile.user_type === "string"
          ? actorProfile.user_type
          : null,
    });
    if (entityScope.error) {
      return NextResponse.json(
        {
          error:
            entityScope.error === "invalid_scope"
              ? "سياق الجهة غير صالح."
              : "لا تملك عضوية نشطة في الجهة المطلوبة.",
        },
        { status: entityScope.error === "invalid_scope" ? 400 : 403 },
      );
    }
    const { firmId, businessId } = entityScope;

    // Optional link to a lawyer_clients card (رقم الموكّل). Only ever written
    // when the RLS client can itself read that row — this is the ownership
    // check, not a courtesy: `lawyer_clients` SELECT is
    // owner-or-active-firm-member, so a read that fails here means the caller
    // has no right to attach a case to that card, whether it exists at all or
    // belongs to someone else.
    let lawyerClientId: string | null = null;
    // Already shape-checked (present ⇒ a uuid) by validateServiceRequestCreate
    // above; what is left here is the ownership check, which needs the database.
    const requestedLawyerClientId = shape.value.lawyerClientId;
    if (requestedLawyerClientId) {
      const { data: clientRow, error: clientLookupError } = await supabase
        .from("lawyer_clients")
        .select("id")
        .eq("id", requestedLawyerClientId)
        .maybeSingle();
      if (clientLookupError) {
        console.error(
          "[service-requests POST] lawyer_clients lookup failed:",
          clientLookupError.message,
          clientLookupError.code,
        );
      }
      if (!clientRow) {
        return NextResponse.json(
          { error: "الموكّل المحدَّد غير موجود أو لا تملك صلاحيته." },
          { status: 400 },
        );
      }
      lawyerClientId = clientRow.id as string;
    }

    // Create the service request
    // Only include columns that exist in the service_requests table:
    // id, requester_user_id, type, title, description, requester, receiver,
    // assigned_to, status, payment, source_path, metadata, created_at,
    // updated_at, firm_id / business_id (resolved from active membership,
    // never from the body), lawyer_client_id (optional, only after the
    // read-permission check above)
    // B1 — service_requests.id is text PK with NO default; always supply one.
    const { data: serviceRequest, error: reqError } = await supabase
      .from("service_requests")
      .insert({
        id: requestData.id ?? crypto.randomUUID(),
        title: shape.value.title,
        description: shape.value.description,
        type: shape.value.type,
        status,
        requester_user_id: user.id,
        source_path: requestData.sourcePath ?? requestData.source_path ?? '',
        assigned_to: requestData.assignedTo ?? requestData.assigned_to ?? null,
        receiver: shape.value.receiver,
        requester: shape.value.requester,
        payment: persistedPayment,
        metadata: requestData.metadata ?? {},
        // Phase 2 columns, sent ONLY when they carry a value. Both exist on
        // production only after migration 20260903_phase2 has been run; a solo
        // lawyer or a request with no picked client inserts exactly the column
        // set it inserted before, so deploying this code ahead of that
        // migration cannot break the eleven intake paths that end here. A
        // firm member (firmId set) or a picked card (lawyerClientId set) can
        // only exist once the migration is in, so the extra columns are only
        // ever sent to a database that has them.
        ...(firmId ? { firm_id: firmId } : {}),
        ...(businessId ? { business_id: businessId } : {}),
        ...(lawyerClientId ? { lawyer_client_id: lawyerClientId } : {}),
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
    // `documentId` is typed as `string` throughout (OrderAttachment,
    // Document.id) but that's a TS-level promise, not a runtime one:
    // attachments.id is a Postgres bigserial, and PostgREST serialises int8
    // as a JSON *number*. POST /api/v1/documents returns `data` straight
    // from Supabase with no cast, so `doc.id` (and therefore this
    // `documentId`) may arrive here as a number despite its declared type.
    // Accept both and coerce, rather than type-guarding on `string` alone —
    // deliverable/route.ts's `/^\d+$/.test(...)` already tolerates this
    // silently via JS's implicit ToString() coercion; do the same explicitly
    // here so a numeric documentId doesn't get silently dropped before the
    // regex ever runs.
    const orderMetadata = (serviceRequest.metadata ?? {}) as Record<string, unknown>;
    const metaAttachments = Array.isArray(orderMetadata.attachments) ? orderMetadata.attachments : [];
    const documentIds = metaAttachments
      .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>).documentId : undefined))
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map((v) => String(v))
      .filter((v) => /^\d+$/.test(v));

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
    const notifTitle = status === "pending_payment" ? "طلبك بانتظار إتمام السداد" : "تم استلام طلبك";
    const notifBody = status === "pending_payment"
      ? `طلبك «${serviceRequest.title ?? ""}» تم إنشاؤه وبانتظار استكمال عملية الدفع.`
      : `طلبك «${serviceRequest.title ?? ""}» قيد المعالجة وسنعلمك بأي تحديث.`;

    await recordNotification({
      userId: user.id,
      title: notifTitle,
      body: notifBody,
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
          provider: persistedPayment.provider,
          amount: persistedPayment.amount,
          currency: persistedPayment.currency,
          status: "pending",
          metadata: {
            payer_user_id: user.id,
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
