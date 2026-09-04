import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { recordEvent, RequestEvent } from "@/lib/events";
import { recordNotification } from "@/lib/notify";
import {
  isConsultationStatus, isConsultationMode, isConsultationOutcome, consultationTransitionIssue,
  type ConsultationStatus,
} from "@/lib/services/consultationVocabulary";
import {
  CONSULTATION_SELECT, CONSULTATION_FORBIDDEN, hydrateConsultations, toConsultationDto,
  consultationDbErrorResponse, type ConsultationRow,
} from "../_shared";

/**
 * /api/v1/lawyer/consultations/[id] — Phase 3, lawyer/firm side.
 *
 * GET is participant-scoped by RLS ("consultations select" — owner or active
 * firm member). PATCH is lawyer/firm-only by RLS ("consultations update" —
 * `can_access_case_row(lawyer_user_id, firm_id)`, no requester branch): a
 * client account can read a row here but never write it, which is why the
 * update below distinguishes "not found" (404, before the write) from
 * "found but the write matched 0 rows" (403 — RLS silently refused it).
 */

function loadRow(supabase: SupabaseClient, id: string) {
  return supabase.from("consultations").select(CONSULTATION_SELECT).eq("id", id).maybeSingle();
}

/** GET /api/v1/lawyer/consultations/[id] — { data } or 404. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data, error } = await loadRow(supabase, id);
    if (error) {
      console.error("[lawyer/consultations/[id] GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل الاستشارة." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "الاستشارة غير موجودة" }, { status: 404 });

    const row = data as unknown as ConsultationRow;
    const extras = await hydrateConsultations(supabase, [row]);
    return NextResponse.json({ data: toConsultationDto(row, extras.get(row.id)) });
  } catch (err) {
    console.error("[lawyer/consultations/[id] GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

interface PatchBody {
  status?: string;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  mode?: string;
  specialty?: string | null;
  outcome?: string | null;
  feeSar?: number | null;
  feePaid?: boolean;
  cancelledReason?: string | null;
  lawyerClientId?: string | null;
}

const NOTIFY_TITLE: Partial<Record<ConsultationStatus, string>> = {
  scheduled: "تمت جدولة استشارتك",
  completed: "اكتملت استشارتك",
  cancelled: "أُلغيت استشارتك",
  no_show: "لم تُعقد استشارتك",
};

/**
 * PATCH /api/v1/lawyer/consultations/[id]
 * Body: UpdateConsultationInput. Validates every field against the vocabulary
 * before writing; on an actual status change, best-effort keeps
 * `service_requests.status` in step, records a `request_events` row and
 * notifies the client — none of which can fail the response (Response is
 * always the freshly re-mapped consultation).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { data: existing, error: readError } = await loadRow(supabase, id);
    if (readError) {
      console.error("[lawyer/consultations/[id] PATCH] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل الاستشارة." }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "الاستشارة غير موجودة" }, { status: 404 });
    const row = existing as unknown as ConsultationRow;

    const body = (await request.json()) as PatchBody;
    const patch: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!isConsultationStatus(body.status)) {
        return NextResponse.json({ error: "قيمة status غير صالحة." }, { status: 400 });
      }
      const issue = consultationTransitionIssue(row.status as ConsultationStatus, body.status, {
        scheduledAt: body.scheduledAt !== undefined ? body.scheduledAt : row.scheduled_at,
      });
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
      patch.status = body.status;
    }

    if (body.mode !== undefined) {
      if (!isConsultationMode(body.mode)) {
        return NextResponse.json({ error: "قيمة mode غير صالحة." }, { status: 400 });
      }
      patch.mode = body.mode;
    }

    if (body.outcome !== undefined) {
      if (body.outcome !== null && !isConsultationOutcome(body.outcome)) {
        return NextResponse.json({ error: "قيمة outcome غير صالحة." }, { status: 400 });
      }
      patch.outcome = body.outcome;
    }

    if (body.durationMinutes !== undefined) {
      if (body.durationMinutes !== null && (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 5 || body.durationMinutes > 480)) {
        return NextResponse.json({ error: "مدة الاستشارة يجب أن تكون بين ٥ و٤٨٠ دقيقة." }, { status: 400 });
      }
      patch.duration_minutes = body.durationMinutes;
    }

    if (body.feeSar !== undefined) {
      if (body.feeSar !== null && (typeof body.feeSar !== "number" || !Number.isFinite(body.feeSar) || body.feeSar < 0)) {
        return NextResponse.json({ error: "قيمة الأتعاب يجب أن تكون رقماً موجباً." }, { status: 400 });
      }
      patch.fee_sar = body.feeSar;
    }

    if (body.feePaid !== undefined) {
      if (typeof body.feePaid !== "boolean") {
        return NextResponse.json({ error: "قيمة feePaid غير صالحة." }, { status: 400 });
      }
      patch.fee_paid = body.feePaid;
    }

    if (body.specialty !== undefined) {
      if (body.specialty !== null && typeof body.specialty !== "string") {
        return NextResponse.json({ error: "قيمة specialty غير صالحة." }, { status: 400 });
      }
      patch.specialty = body.specialty;
    }

    if (body.cancelledReason !== undefined) {
      if (body.cancelledReason !== null && typeof body.cancelledReason !== "string") {
        return NextResponse.json({ error: "قيمة cancelledReason غير صالحة." }, { status: 400 });
      }
      patch.cancelled_reason = body.cancelledReason;
    }

    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null) {
        patch.scheduled_at = null;
      } else if (typeof body.scheduledAt === "string" && !Number.isNaN(Date.parse(body.scheduledAt))) {
        patch.scheduled_at = body.scheduledAt;
      } else {
        return NextResponse.json({ error: "موعد الاستشارة غير صالح." }, { status: 400 });
      }
    }

    if (body.lawyerClientId !== undefined) {
      if (body.lawyerClientId === null) {
        patch.lawyer_client_id = null;
      } else if (typeof body.lawyerClientId === "string" && body.lawyerClientId.trim()) {
        const { data: clientRow, error: clientError } = await supabase
          .from("lawyer_clients")
          .select("id")
          .eq("id", body.lawyerClientId.trim())
          .maybeSingle();
        if (clientError) {
          console.error("[lawyer/consultations/[id] PATCH] lawyer_clients lookup failed:", clientError.message, clientError.code);
        }
        if (!clientRow) {
          return NextResponse.json({ error: "بطاقة الموكّل غير موجودة" }, { status: 400 });
        }
        patch.lawyer_client_id = clientRow.id;
      } else {
        return NextResponse.json({ error: "قيمة lawyerClientId غير صالحة." }, { status: 400 });
      }
    }

    if (patch.status === "completed" && !row.ended_at) {
      patch.ended_at = new Date().toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد تعديل مطلوب." }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("consultations")
      .update(patch)
      .eq("id", id)
      .select(CONSULTATION_SELECT)
      .maybeSingle();

    if (updateError) {
      console.error("[lawyer/consultations/[id] PATCH] update failed:", updateError.message, updateError.code);
      const { status, message } = consultationDbErrorResponse(updateError);
      return NextResponse.json({ error: message }, { status });
    }
    if (!updated) {
      return NextResponse.json(CONSULTATION_FORBIDDEN, { status: 403 });
    }
    const updatedRow = updated as unknown as ConsultationRow;

    const extras = await hydrateConsultations(supabase, [updatedRow]);
    const extraInfo = extras.get(updatedRow.id);

    const statusChanged = body.status !== undefined && body.status !== row.status;
    if (statusChanged) {
      // (a) keep the request in step — best-effort, never fails the response.
      // `{ count: "exact" }` matters here: the service_requests UPDATE policy
      // is `requester_user_id = auth.uid() or assigned_to = auth.uid()`, so a
      // firm colleague acting on a colleague's consultation (RLS lets them —
      // Phase 1 "consultations update" is can_access_case_row) but who is not
      // literally `assigned_to` matches 0 rows with `error === null`; without
      // the count check that silent miss would never be logged.
      try {
        if (updatedRow.status === "completed") {
          const { error, count } = await supabase
            .from("service_requests")
            .update({ status: "completed" }, { count: "exact" })
            .eq("id", updatedRow.request_id);
          if (error || !count) {
            console.error("[lawyer/consultations/[id] PATCH] request sync (completed) failed:", error?.message ?? "0 rows matched", error?.code);
          }
        } else if (updatedRow.status === "cancelled") {
          const { error, count } = await supabase
            .from("service_requests")
            .update({ status: "cancelled" }, { count: "exact" })
            .eq("id", updatedRow.request_id);
          if (error || !count) {
            console.error("[lawyer/consultations/[id] PATCH] request sync (cancelled) failed:", error?.message ?? "0 rows matched", error?.code);
          }
        } else if (updatedRow.status === "scheduled") {
          const { error, count } = await supabase
            .from("service_requests")
            .update({ status: "assigned" }, { count: "exact" })
            .eq("id", updatedRow.request_id)
            .eq("status", "pending_assignment");
          if (error) {
            console.error("[lawyer/consultations/[id] PATCH] request sync (scheduled) failed:", error.message, error.code);
          }
          // count === 0 here is also the ordinary case where the request was
          // not `pending_assignment` (already `assigned`/`in_review`) — not
          // logged as a failure, unlike the two branches above.
        }
      } catch (err) {
        console.error("[lawyer/consultations/[id] PATCH] request sync threw:", err);
      }

      // (b) audit event — best-effort.
      try {
        await recordEvent({
          supabase,
          requestId: updatedRow.request_id,
          event: RequestEvent.CONSULTATION_STATUS_CHANGED,
          actorUserId: user.id,
          metadata: { status: updatedRow.status },
        });
      } catch (err) {
        console.error("[lawyer/consultations/[id] PATCH] recordEvent threw:", err);
      }

      // (c) notify the client — best-effort.
      const notifyTitle = NOTIFY_TITLE[updatedRow.status as ConsultationStatus];
      if (notifyTitle && updatedRow.requester_user_id && updatedRow.requester_user_id !== user.id) {
        try {
          await recordNotification({
            userId: updatedRow.requester_user_id,
            title: notifyTitle,
            body: extraInfo?.title ?? "استشارة",
            href: `/dashboard/client/consultation/${updatedRow.request_id}`,
          });
        } catch (err) {
          console.error("[lawyer/consultations/[id] PATCH] recordNotification threw:", err);
        }
      }
    }

    return NextResponse.json({ data: toConsultationDto(updatedRow, extraInfo) });
  } catch (err) {
    console.error("[lawyer/consultations/[id] PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
