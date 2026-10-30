import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { recordEvent, RequestEvent } from "@/lib/events";
import { recordNotification } from "@/lib/notify";
import {
  CONSULTATION_SELECT, CONSULTATION_FORBIDDEN, hydrateConsultations, toConsultationDto,
  consultationDbErrorResponse, type ConsultationRow,
} from "../../_shared";
import { buildConsultationLinkPatch, convertConsultation } from "./convertConsultationCore";

/**
 * POST /api/v1/lawyer/consultations/[id]/convert — turn a consultation into
 * a case, exactly once (DECISION 4: `service_requests.source_consultation_id`
 * is UNIQUE — a second conversion is a 23505, not a duplicate case).
 *
 * The new case's `requester_user_id` is the CLIENT (the consultation's own
 * requester), not the caller — the RLS insert policy on service_requests
 * ("clients create their own service requests") requires
 * `requester_user_id = auth.uid()`, which the acting lawyer is not. So this
 * one insert runs through the service client, per house rule, only AFTER RLS
 * has scoped every id it uses (the consultation row above, the lawyer_client
 * check nowhere needed here since it is copied verbatim from a row RLS
 * already handed the caller).
 *
 * Idempotent (CODE-F13): a retry after a half-finished call — case inserted,
 * link not written — finds that case by source_consultation_id and writes the
 * link, answering 200 with the SAME caseRequestId (plus `repaired: true`). A
 * link that cannot be confirmed answers 500, never 200.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const body = (await request.json().catch(() => ({}))) as { title?: string };

    const { data: existing, error: readError } = await supabase
      .from("consultations")
      .select(CONSULTATION_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("[lawyer/consultations/[id]/convert POST] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل الاستشارة." }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "الاستشارة غير موجودة" }, { status: 404 });
    const row = existing as unknown as ConsultationRow;

    // Prove write access (RLS: only can_access_case_row(lawyer_user_id, firm_id)
    // may update this row — a client account that can read it cannot).
    const { data: writeCheck, error: writeCheckError } = await supabase
      .from("consultations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (writeCheckError) {
      console.error("[lawyer/consultations/[id]/convert POST] write check failed:", writeCheckError.message, writeCheckError.code);
      return NextResponse.json({ error: "تعذّر تحويل الاستشارة." }, { status: 500 });
    }
    if (!writeCheck) {
      return NextResponse.json(CONSULTATION_FORBIDDEN, { status: 403 });
    }

    const { data: requestRow } = await supabase
      .from("service_requests")
      .select("title, description, requester")
      .eq("id", row.request_id)
      .maybeSingle();
    const requestTitle = (requestRow?.title as string | null) || "استشارة";
    const requestDescription = (requestRow?.description as string | null) || "";
    const requesterJson = (requestRow?.requester as Record<string, unknown> | null) ?? {};

    const newId = crypto.randomUUID();
    const newTitle = (typeof body.title === "string" && body.title.trim()) || `قضية من استشارة: ${requestTitle}`;

    // CODE-F13: the case insert and the consultation link are two writes. The
    // decision of what to do between them — repair a half-finished earlier
    // call, recover from a 23505, refuse to call an unconfirmed link a success
    // — lives in convertConsultationCore (tested there). The unique index on
    // source_consultation_id stays the guard against a second case.
    const service = await createServiceClient();
    const nowIso = new Date().toISOString();
    const outcome = await convertConsultation(
      { linkedCaseId: row.converted_case_request_id ?? null, newCaseId: newId },
      {
        // Service client: the case's requester is the CLIENT, so the acting
        // lawyer may not be able to read it through RLS. The consultation id
        // it is matched on was already scoped by the read + write check above.
        findExistingCaseId: async () => {
          const { data, error } = await service
            .from("service_requests")
            .select("id")
            .eq("source_consultation_id", id)
            .maybeSingle();
          if (error) {
            console.error("[lawyer/consultations/[id]/convert POST] existing-case lookup failed:", error.message, error.code);
            return { id: null, failed: true };
          }
          return { id: (data?.id as string | undefined) ?? null, failed: false };
        },
        insertCase: async () => {
          const { error: insertError } = await service
            .from("service_requests")
            .insert({
              id: newId,
              type: "service",
              receiver: "lawyer",
              status: "assigned",
              title: newTitle,
              description: requestDescription,
              requester_user_id: row.requester_user_id ?? user.id,
              assigned_to: user.id,
              requester: requesterJson,
              payment: { amount: 0, status: "not_required" },
              source_path: `/dashboard/lawyer/consultations/${id}`,
              metadata: { convertedFromConsultationId: id, convertedFromRequestId: row.request_id },
              ...(row.firm_id ? { firm_id: row.firm_id } : {}),
              ...(row.lawyer_client_id ? { lawyer_client_id: row.lawyer_client_id } : {}),
              source_consultation_id: id,
            });
          if (!insertError) return { ok: true as const };
          console.error("[lawyer/consultations/[id]/convert POST] case insert failed:", insertError.message, insertError.code);
          return { ok: false as const, code: insertError.code };
        },
        // The link must come back with a row: an RLS-filtered update returns
        // no error and changes nothing, which used to pass as success.
        linkConsultation: async (caseRequestId) => {
          const { data, error } = await supabase
            .from("consultations")
            .update(buildConsultationLinkPatch(row, caseRequestId, nowIso))
            .eq("id", id)
            .select("id")
            .maybeSingle();
          if (error) console.error("[lawyer/consultations/[id]/convert POST] consultation link failed:", error.message, error.code);
          return !error && !!data;
        },
      },
    );

    if (outcome.kind === "already_converted" || outcome.kind === "conflict_unresolved") {
      return NextResponse.json(
        {
          error: "حُوِّلت هذه الاستشارة إلى قضية من قبل",
          ...(outcome.kind === "already_converted" ? { caseRequestId: outcome.caseRequestId } : {}),
        },
        { status: 409 },
      );
    }
    if (outcome.kind === "lookup_failed") {
      return NextResponse.json({ error: "تعذّر التحقق من تحويل سابق لهذه الاستشارة. أعد المحاولة." }, { status: 500 });
    }
    if (outcome.kind === "insert_failed") {
      const { status, message } = consultationDbErrorResponse({ code: outcome.code });
      return NextResponse.json({ error: message }, { status });
    }
    if (outcome.kind === "link_failed") {
      // The case exists; only the link is missing. A retry takes the repair
      // path and finishes the job without a second case.
      return NextResponse.json(
        {
          error: "أُنشئت القضية لكن تعذّر ربطها بالاستشارة. أعد المحاولة لإكمال الربط.",
          caseRequestId: outcome.caseRequestId,
        },
        { status: 500 },
      );
    }
    const caseId = outcome.caseRequestId;
    const repaired = outcome.kind === "repaired";

    const { data: finalRow, error: reReadError } = await supabase
      .from("consultations")
      .select(CONSULTATION_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (reReadError || !finalRow) {
      console.error("[lawyer/consultations/[id]/convert POST] re-read failed:", reReadError?.message, reReadError?.code);
      return NextResponse.json({ error: "تعذّر تحميل الاستشارة بعد التحويل." }, { status: 500 });
    }
    const updatedRow = finalRow as unknown as ConsultationRow;
    const extras = await hydrateConsultations(supabase, [updatedRow]);
    const extraInfo = extras.get(updatedRow.id);

    // Audit + notify — best-effort, and done by the call that WROTE the link
    // (CODE-F13): a link that failed returned above with nothing announced, so
    // the repairing retry is the one that tells the client.
    try {
      await recordEvent({
        supabase,
        requestId: caseId,
        event: RequestEvent.SERVICE_REQUEST_CREATED,
        actorUserId: user.id,
        metadata: { convertedFromConsultationId: id, ...(repaired ? { repairedLink: true } : {}) },
      });
    } catch (err) {
      console.error("[lawyer/consultations/[id]/convert POST] recordEvent (new request) threw:", err);
    }
    try {
      await recordEvent({
        supabase,
        requestId: row.request_id,
        event: RequestEvent.CONSULTATION_STATUS_CHANGED,
        actorUserId: user.id,
        metadata: { status: "completed", convertedToCase: caseId },
      });
    } catch (err) {
      console.error("[lawyer/consultations/[id]/convert POST] recordEvent (old request) threw:", err);
    }
    if (updatedRow.requester_user_id && updatedRow.requester_user_id !== user.id) {
      try {
        await recordNotification({
          userId: updatedRow.requester_user_id,
          title: "حُوِّلت استشارتك إلى قضية",
          body: extraInfo?.title ?? "استشارة",
          href: `/dashboard/client/cases/${caseId}`,
        });
      } catch (err) {
        console.error("[lawyer/consultations/[id]/convert POST] recordNotification threw:", err);
      }
    }

    return NextResponse.json({ data: toConsultationDto(updatedRow, extraInfo), caseRequestId: caseId, ...(repaired ? { repaired: true } : {}) });
  } catch (err) {
    console.error("[lawyer/consultations/[id]/convert POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
