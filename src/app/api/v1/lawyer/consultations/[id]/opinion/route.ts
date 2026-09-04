import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { recordEvent, RequestEvent } from "@/lib/events";
import { recordNotification } from "@/lib/notify";
import { consultationTransitionIssue, type ConsultationStatus } from "@/lib/services/consultationVocabulary";
import {
  CONSULTATION_SELECT, CONSULTATION_FORBIDDEN, hydrateConsultations, toConsultationDto,
  consultationDbErrorResponse, type ConsultationRow,
} from "../../_shared";

/**
 * POST /api/v1/lawyer/consultations/[id]/opinion — deliver the written
 * opinion (DECISION 3 of the migration: `opinion_text` on the row IS the
 * delivered opinion by definition — drafts belong in consultation_notes).
 * Stores the opinion, stamps delivery, completes the consultation.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const body = (await request.json()) as { opinionText?: string };
    const opinionText = typeof body.opinionText === "string" ? body.opinionText.trim() : "";
    if (!opinionText) {
      return NextResponse.json({ error: "نص الرأي القانوني مطلوب." }, { status: 400 });
    }

    const { data: existing, error: readError } = await supabase
      .from("consultations")
      .select(CONSULTATION_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("[lawyer/consultations/[id]/opinion POST] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل الاستشارة." }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "الاستشارة غير موجودة" }, { status: 404 });
    const row = existing as unknown as ConsultationRow;

    if (row.status === "cancelled") {
      return NextResponse.json({ error: "الاستشارة ملغاة" }, { status: 400 });
    }
    if (row.status !== "completed") {
      const issue = consultationTransitionIssue(row.status as ConsultationStatus, "completed", { scheduledAt: row.scheduled_at });
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      opinion_text: opinionText,
      opinion_delivered_at: new Date().toISOString(),
      outcome: "opinion_delivered",
      status: "completed",
    };
    if (!row.ended_at) patch.ended_at = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("consultations")
      .update(patch)
      .eq("id", id)
      .select(CONSULTATION_SELECT)
      .maybeSingle();

    if (updateError) {
      console.error("[lawyer/consultations/[id]/opinion POST] update failed:", updateError.message, updateError.code);
      const { status, message } = consultationDbErrorResponse(updateError);
      return NextResponse.json({ error: message }, { status });
    }
    if (!updated) {
      return NextResponse.json(CONSULTATION_FORBIDDEN, { status: 403 });
    }
    const updatedRow = updated as unknown as ConsultationRow;
    const extras = await hydrateConsultations(supabase, [updatedRow]);
    const extraInfo = extras.get(updatedRow.id);

    // Side effects — best-effort, never fail the response. `{ count: "exact" }`
    // catches the silent-miss case (0 rows, no error) for a firm colleague who
    // is not literally `assigned_to` on the request — see the PATCH route's
    // identical comment on this same sync.
    try {
      const { error, count } = await supabase
        .from("service_requests")
        .update({ status: "completed" }, { count: "exact" })
        .eq("id", updatedRow.request_id);
      if (error || !count) {
        console.error("[lawyer/consultations/[id]/opinion POST] request sync failed:", error?.message ?? "0 rows matched", error?.code);
      }
    } catch (err) {
      console.error("[lawyer/consultations/[id]/opinion POST] request sync threw:", err);
    }

    try {
      await recordEvent({
        supabase,
        requestId: updatedRow.request_id,
        event: RequestEvent.CONSULTATION_STATUS_CHANGED,
        actorUserId: user.id,
        metadata: { status: "completed", opinionDelivered: true },
      });
    } catch (err) {
      console.error("[lawyer/consultations/[id]/opinion POST] recordEvent threw:", err);
    }

    if (updatedRow.requester_user_id && updatedRow.requester_user_id !== user.id) {
      try {
        await recordNotification({
          userId: updatedRow.requester_user_id,
          title: "سُلِّم الرأي القانوني لاستشارتك",
          body: extraInfo?.title ?? "استشارة",
          href: `/dashboard/client/consultation/${updatedRow.request_id}`,
        });
      } catch (err) {
        console.error("[lawyer/consultations/[id]/opinion POST] recordNotification threw:", err);
      }
    }

    return NextResponse.json({ data: toConsultationDto(updatedRow, extraInfo) });
  } catch (err) {
    console.error("[lawyer/consultations/[id]/opinion POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
