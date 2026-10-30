import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { assertCourtPractice } from "@/lib/auth/assertCourtPractice";
import { recordActivity, RequestEvent } from "@/lib/events";
import { appendHearingHistory, planHearingChange } from "@/lib/services/hearingChange";
import { riyadhToday } from "@/lib/riyadhDay";
import { HEARINGS_SELECT, resolveOwnCase, toDto, type HearingRow } from "../_shared";

/**
 * PATCH /api/v1/lawyer/hearings/[id] — CODE-F18.
 *
 * Body: { action: "edit" | "postpone" | "cancel" | "complete" | "reopen", reason?, date?, time?,
 *         title?, type?, location?, notes?, urgency?, durationMinutes?, caseRequestId? }
 *
 * The rules (which action from which status, which need a reason, what is
 * written) are `planHearingChange` in src/lib/services/hearingChange.ts. This
 * handler reads the row, applies the plan, appends one `metadata.history`
 * entry and records one activity event:
 *   edit                       → RequestEvent.HEARING_UPDATED { title, reason? }
 *   postpone/cancel/complete/  → RequestEvent.HEARING_STATUS_CHANGED
 *   reopen                       { title, status: postponed|cancelled|completed|scheduled, reason?, fromDate?, toDate? }
 *
 * Reminders: a cancelled / held row stops being `scheduled`, and a postponed
 * row's date/time move — `checkHearingDelivery` cancels every pending reminder
 * of either kind at delivery and the next queue run re-plans the moved one
 * (src/lib/hearingReminders.ts). Nothing to write to notification_outbox here.
 *
 * Own diary only, like GET: the row must carry owner_user_id = caller.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    // Art. 18: a legal consultant does not manage hearings.
    const refused = await assertCourtPractice(supabase, user.id);
    if (refused) return refused;

    const body = await request.json().catch(() => null);
    const { id } = await context.params;

    const { data: currentRow, error: readError } = await supabase
      .from("hearings")
      .select(HEARINGS_SELECT)
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (readError) {
      console.error("[lawyer/hearings PATCH] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر قراءة الموعد." }, { status: 500 });
    }
    if (!currentRow) return NextResponse.json({ error: "الموعد غير موجود." }, { status: 404 });
    const current = currentRow as HearingRow;

    const planned = planHearingChange(body, current, riyadhToday());
    if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: planned.status ?? 400 });
    const { change } = planned;

    let metadata: Record<string, unknown> = { ...(current.metadata ?? {}) };
    if (change.caseRequestId !== undefined) {
      if (change.caseRequestId === null) {
        // Unlinked: the stored name was the case's title — keep it as a plain
        // label so the card still says what the appointment was about.
      } else {
        const linked = await resolveOwnCase(supabase, user.id, change.caseRequestId);
        if (!linked.ok) return NextResponse.json({ error: linked.error }, { status: linked.status });
        metadata.caseName = linked.title;
      }
    }
    metadata = appendHearingHistory(metadata, { ...change.history, at: new Date().toISOString(), by: user.id });

    // `updated_at` guard: a second tab that saved in between makes this match
    // nothing, and the lawyer is told to reload rather than overwrite it.
    const { data: updated, error: updateError } = await supabase
      .from("hearings")
      .update({ ...change.update, metadata })
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .eq("updated_at", current.updated_at)
      .select(HEARINGS_SELECT)
      .maybeSingle();
    if (updateError) {
      console.error("[lawyer/hearings PATCH] update failed:", updateError.message, updateError.code);
      return NextResponse.json({ error: "تعذّر حفظ التغيير." }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "تغيّر هذا الموعد من مكان آخر — أعد تحميل الصفحة ثم حاول مرة أخرى." }, { status: 409 });
    }
    const row = updated as HearingRow;

    await recordActivity({
      supabase,
      kind: change.activity.kind === "updated" ? RequestEvent.HEARING_UPDATED : RequestEvent.HEARING_STATUS_CHANGED,
      ownerUserId: user.id,
      firmId: row.firm_id ?? null,
      actorUserId: user.id,
      caseRequestId: row.case_request_id ?? current.case_request_id,
      subjectTable: "hearings",
      subjectId: row.id,
      payload: {
        title: row.title,
        ...(change.activity.status ? { status: change.activity.status } : {}),
        ...(change.activity.reason ? { reason: change.activity.reason } : {}),
        ...(change.history.fromDate ? { fromDate: change.history.fromDate, toDate: change.history.toDate } : {}),
      },
    });

    return NextResponse.json({ data: toDto(row) });
  } catch (err) {
    console.error("[lawyer/hearings PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
