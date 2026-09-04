import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { recordEvent, RequestEvent } from "@/lib/events";
import { recordNotification } from "@/lib/notify";
import {
  CONSULTATION_SELECT, CONSULTATION_FORBIDDEN, hydrateConsultations, toConsultationDto,
  consultationDbErrorResponse, type ConsultationRow,
} from "../../_shared";

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

    if (row.converted_case_request_id) {
      return NextResponse.json(
        { error: "حُوِّلت هذه الاستشارة إلى قضية من قبل", caseRequestId: row.converted_case_request_id },
        { status: 409 },
      );
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

    const service = await createServiceClient();
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

    if (insertError) {
      console.error("[lawyer/consultations/[id]/convert POST] case insert failed:", insertError.message, insertError.code);
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "حُوِّلت هذه الاستشارة إلى قضية من قبل" }, { status: 409 });
      }
      const { status, message } = consultationDbErrorResponse(insertError);
      return NextResponse.json({ error: message }, { status });
    }

    // Record the conversion on the consultation row — best-effort: the case
    // itself is the transaction and already exists; if this write fails the
    // unique index on source_consultation_id still prevents a second case
    // from ever being created for this consultation.
    const nowIso = new Date().toISOString();
    const consultationPatch: Record<string, unknown> = {
      converted_case_request_id: newId,
      outcome: "converted_to_case",
      status: ["requested", "scheduled", "no_show"].includes(row.status) ? "completed" : row.status,
    };
    if (!row.ended_at) consultationPatch.ended_at = nowIso;
    try {
      const { error } = await supabase.from("consultations").update(consultationPatch).eq("id", id);
      if (error) console.error("[lawyer/consultations/[id]/convert POST] consultation update failed:", error.message, error.code);
    } catch (err) {
      console.error("[lawyer/consultations/[id]/convert POST] consultation update threw:", err);
    }

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

    // Audit + notify — best-effort.
    try {
      await recordEvent({
        supabase,
        requestId: newId,
        event: RequestEvent.SERVICE_REQUEST_CREATED,
        actorUserId: user.id,
        metadata: { convertedFromConsultationId: id },
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
        metadata: { status: "completed", convertedToCase: newId },
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
          href: `/dashboard/client/cases/${newId}`,
        });
      } catch (err) {
        console.error("[lawyer/consultations/[id]/convert POST] recordNotification threw:", err);
      }
    }

    return NextResponse.json({ data: toConsultationDto(updatedRow, extraInfo), caseRequestId: newId });
  } catch (err) {
    console.error("[lawyer/consultations/[id]/convert POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
