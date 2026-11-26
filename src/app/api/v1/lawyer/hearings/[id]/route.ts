import { NextResponse, NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { assertCourtPractice } from "@/lib/auth/assertCourtPractice";
import { recordActivity, RequestEvent } from "@/lib/events";
import { appendHearingHistory, planHearingChange } from "@/lib/services/hearingChange";
import { riyadhToday } from "@/lib/riyadhDay";
import { recordNotification } from "@/lib/notify";
import { HEARINGS_SELECT, hearingNamesFor, parseHearingAssignee, resolveOwnCase, toDto, type HearingRow } from "../_shared";

/**
 * N01-18: what the hearing's ASSIGNEE (a colleague the owner named) may do —
 * record the outcome. Editing the appointment itself, cancelling it and
 * re-assigning it stay with its owner.
 */
const ASSIGNEE_ACTIONS: ReadonlySet<string> = new Set(["complete", "postpone", "reopen"]);
import { DEADLINE_HEARING_KIND, hearingDurationMinutes, hearingStartMs } from "@/lib/services/scheduleClash";
import { hearingOverlapRefusal } from "@/app/api/v1/lawyer/consultations/_scheduleGuard";

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
 * Own diary, like GET: the row must carry owner_user_id = caller, or (N01-18)
 * assignee_user_id = caller — then only the outcome actions (ASSIGNEE_ACTIONS)
 * are allowed (403 otherwise). RLS admits the assignee only while he is an
 * ACTIVE member of the row's firm. `assigneeUserId` (owner, action "edit"
 * only): absent leaves it, null/"" or the owner clears it, a colleague must
 * pass parseHearingAssignee (400).
 *
 * Owner q357: when the row will be a timed, scheduled hearing and its day,
 * hour or duration changes (edit, postpone, reopen), it is checked against
 * the lawyer's consultations and other hearings — 409 `hearing_overlap`
 * (told apart from this route's other 409s by `code`) until the same body is
 * sent with `confirmOverlap: true`.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
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
      .or(`owner_user_id.eq.${user.id},assignee_user_id.eq.${user.id}`)
      .maybeSingle();
    if (readError) {
      console.error("[lawyer/hearings PATCH] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر قراءة الموعد." }, { status: 500 });
    }
    if (!currentRow) return NextResponse.json({ error: "الموعد غير موجود." }, { status: 404 });
    const current = currentRow as HearingRow;
    const isOwner = current.owner_user_id === user.id;
    const action = (body as { action?: unknown } | null)?.action;
    const assigneeField = (body as { assigneeUserId?: unknown } | null)?.assigneeUserId;
    if (!isOwner && (typeof action !== "string" || !ASSIGNEE_ACTIONS.has(action) || assigneeField !== undefined)) {
      return NextResponse.json(
        { error: "يسجّل المحامي المُكلَّف نتيجة الجلسة فقط؛ تعديل الموعد أو إلغاؤه أو إسناده لصاحبه." },
        { status: 403 },
      );
    }

    const planned = planHearingChange(body, current, riyadhToday());
    if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: planned.status ?? 400 });
    const { change } = planned;

    // N01-18: re-assigning is part of the owner's edit, bounded by the row's own firm.
    let assigneeUpdate: { assignee_user_id: string | null } | null = null;
    if (isOwner && action === "edit" && assigneeField !== undefined) {
      const parsed = await parseHearingAssignee(supabase, {
        assigneeId: assigneeField, ownerId: user.id, firmId: current.firm_id ?? null,
      });
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      if (parsed.value !== (current.assignee_user_id ?? null)) assigneeUpdate = { assignee_user_id: parsed.value };
    }

    // q357: overlap check on the row as it will be after this change.
    {
      const u = change.update;
      const nextDate = typeof u.hearing_date === "string" ? u.hearing_date : current.hearing_date;
      const nextTime = "hearing_time" in u ? (u.hearing_time as string | null) : current.hearing_time;
      const nextDuration = "duration_minutes" in u ? (u.duration_minutes as number | null) : current.duration_minutes;
      const nextStatus = typeof u.status === "string" ? u.status : current.status;
      const nextKind = typeof u.kind === "string" ? u.kind : current.kind;
      const slotChanged = nextDate !== current.hearing_date
        || (nextTime ?? "").slice(0, 5) !== (current.hearing_time ?? "").slice(0, 5)
        || nextDuration !== current.duration_minutes
        || nextStatus !== current.status
        || nextKind !== current.kind;
      // A «موعد طعن / نهائي» (kind deadline) marks a day, it holds no hour: not checked.
      const startMs = nextStatus === "scheduled" && slotChanged && nextKind !== DEADLINE_HEARING_KIND
        ? hearingStartMs(nextDate, nextTime)
        : null;
      if (startMs !== null) {
        const refusal = await hearingOverlapRefusal(supabase, {
          lawyerUserId: user.id,
          startMs,
          durationMinutes: hearingDurationMinutes(nextDuration),
          excludeHearingId: current.id,
          confirmOverlap: (body as { confirmOverlap?: unknown } | null)?.confirmOverlap === true,
        });
        if (refusal) return refusal;
      }
    }

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
      .update({ ...change.update, ...(assigneeUpdate ?? {}), metadata })
      .eq("id", id)
      .eq("owner_user_id", current.owner_user_id ?? user.id)
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
      // The row's owner, so the event sits in his log; the actor is the caller
      // (the "activity insertable by actor" policy admits either).
      ownerUserId: current.owner_user_id ?? user.id,
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

    if (assigneeUpdate?.assignee_user_id) {
      await recordNotification({
        userId: assigneeUpdate.assignee_user_id,
        title: "أُسندت إليك جلسة",
        body: `${row.title} — ${row.hearing_date}${row.hearing_time ? ` ${row.hearing_time.slice(0, 5)}` : ""}`,
        href: "/dashboard/lawyer/hearings",
      });
    }
    const names = await hearingNamesFor(supabase, user.id, [row]);
    return NextResponse.json({ data: toDto(row, user.id, names) });
  } catch (err) {
    console.error("[lawyer/hearings PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
