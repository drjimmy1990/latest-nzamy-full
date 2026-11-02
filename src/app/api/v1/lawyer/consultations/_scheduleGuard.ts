/**
 * _scheduleGuard.ts — the server-side overlap check for a consultation slot
 * (owner finding LIVE-F35: two 60-minute consultations at 13:30 and 14:00 on
 * the same account were both saved with no warning).
 *
 * POLICY: WARN AND CONFIRM, NOT BLOCK. The owner has not ruled on whether an
 * overlap is refused or allowed (no entry in the 30-Oct corrections). Until he
 * does, an overlapping slot is answered with 409 `consultation_overlap` and the
 * list of the slots it collides with; the same request sent again with
 * `confirmOverlap: true` is saved. Moving to a hard block later is one line in
 * each caller.
 *
 * Scope: the consultations of ONE lawyer (`lawyer_user_id`) that are
 * `scheduled` — a cancelled, completed or unscheduled row holds no time —
 * AND, since owner q357, the same lawyer's `scheduled` hearings that carry an
 * hour (`owner_user_id`). The check runs both ways: a consultation slot is
 * checked against hearings here (overlapRefusal), and a hearing slot against
 * consultations and other hearings (hearingOverlapRefusal, called by the
 * hearing routes). The rule itself is src/lib/services/scheduleClash.ts.
 * Read through the caller's RLS client, which can read the lawyer's own rows.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONSULTATION_OVERLAP_CODE,
  DEFAULT_CONSULTATION_MINUTES,
  DURATION_BAD_AR,
  checkDayTimeSlot,
  checkInstantSlot,
  isValidDuration,
  overlapQueryWindow,
  type SlotCheck,
} from "@/lib/services/consultationSchedule";
import {
  DEADLINE_HEARING_KIND,
  HEARING_OVERLAP_CODE,
  clashMessageAr,
  consultationItems,
  findScheduleClashes,
  hearingItems,
  hearingQueryDays,
  type ConsultationSlotRow,
  type HearingSlotRow,
  type ScheduleConflict,
} from "@/lib/services/scheduleClash";

export type OverlapRead =
  | { ok: true; conflicts: ScheduleConflict[] }
  | { ok: false };

/**
 * The lawyer's scheduled consultations AND timed scheduled hearings that share
 * a minute with the slot. `excludeId` is a consultation's own id (a
 * reschedule), `excludeHearingId` a hearing's own id (an edit/postpone).
 */
export async function readScheduleConflicts(
  supabase: SupabaseClient,
  args: { lawyerUserId: string; startMs: number; durationMinutes: number; excludeId?: string | null; excludeHearingId?: string | null },
): Promise<OverlapRead> {
  const { fromIso, toIso } = overlapQueryWindow(args.startMs, args.durationMinutes);
  const { fromDay, toDay } = hearingQueryDays(args.startMs, args.durationMinutes);
  const [consultations, hearings] = await Promise.all([
    supabase
      .from("consultations")
      .select("id, scheduled_at, duration_minutes")
      .eq("lawyer_user_id", args.lawyerUserId)
      .eq("status", "scheduled")
      .gt("scheduled_at", fromIso)
      .lt("scheduled_at", toIso)
      .limit(50),
    supabase
      .from("hearings")
      .select("id, hearing_date, hearing_time, duration_minutes, kind")
      .eq("owner_user_id", args.lawyerUserId)
      .eq("status", "scheduled")
      .neq("kind", DEADLINE_HEARING_KIND)
      .not("hearing_time", "is", null)
      .gte("hearing_date", fromDay)
      .lte("hearing_date", toDay)
      .limit(50),
  ]);
  if (consultations.error || hearings.error) {
    const e = consultations.error ?? hearings.error;
    console.error("[schedule guard] overlap read failed:", e?.message, e?.code);
    return { ok: false };
  }
  const items = [
    ...consultationItems((consultations.data ?? []) as ConsultationSlotRow[]),
    ...hearingItems((hearings.data ?? []) as HearingSlotRow[]),
  ];
  const exclude = args.excludeHearingId
    ? { kind: "hearing" as const, id: args.excludeHearingId }
    : args.excludeId ? { kind: "consultation" as const, id: args.excludeId } : null;
  return { ok: true, conflicts: findScheduleClashes(args.startMs, args.durationMinutes, items, exclude) };
}

/**
 * POST /api/v1/service-requests, `type: "consultation"` only — the slot the
 * lawyer's booking modal sends as `metadata.day` + `metadata.time` (Riyadh
 * wall clock; the database trigger converts it with `at time zone
 * 'Asia/Riyadh'`), or an explicit `metadata.scheduledAt`.
 *
 *   - neither: an unscheduled request («بانتظار الجدولة») — allowed;
 *   - a date without a time, or a time without a date: refused (the trigger
 *     used to drop it silently and save an unscheduled row);
 *   - a slot not strictly after now (Riyadh): refused (LIVE-F34);
 *   - a duration outside 5..480: refused (the trigger nulled it silently);
 *   - an overlap with the lawyer's own scheduled consultations, when the
 *     booking is assigned to the caller: 409 until confirmed (LIVE-F35).
 *
 * The client booking wizards send none of these keys, so they pass untouched.
 */
export async function consultationBookingRefusal(
  supabase: SupabaseClient,
  args: { userId: string; metadata: unknown; assignedToSelf: boolean; confirmOverlap: boolean; nowMs: number },
): Promise<NextResponse | null> {
  const meta = (args.metadata && typeof args.metadata === "object" ? args.metadata : {}) as Record<string, unknown>;
  const hasDayTime = (meta.day !== undefined && meta.day !== "" && meta.day !== null)
    || (meta.time !== undefined && meta.time !== "" && meta.time !== null);

  let slot: SlotCheck;
  if (hasDayTime) {
    slot = checkDayTimeSlot(meta.day, meta.time, args.nowMs);
  } else if (meta.scheduledAt !== undefined && meta.scheduledAt !== null && meta.scheduledAt !== "") {
    slot = checkInstantSlot(meta.scheduledAt, args.nowMs, true);
  } else {
    slot = { kind: "unscheduled" };
  }
  if (slot.kind === "invalid") return NextResponse.json({ error: slot.error }, { status: 400 });

  let duration = DEFAULT_CONSULTATION_MINUTES;
  if (meta.duration !== undefined && meta.duration !== null && meta.duration !== "") {
    const n = typeof meta.duration === "string" ? Number(meta.duration) : meta.duration;
    if (!isValidDuration(n)) return NextResponse.json({ error: DURATION_BAD_AR }, { status: 400 });
    duration = n;
  }

  if (slot.kind !== "slot" || !args.assignedToSelf) return null;
  return overlapRefusal(supabase, {
    lawyerUserId: args.userId,
    startMs: slot.startMs,
    durationMinutes: duration,
    confirmOverlap: args.confirmOverlap,
  });
}

/**
 * null when the slot may be saved; otherwise the response to return.
 * A failed read refuses (503) rather than saving blind.
 */
export async function overlapRefusal(
  supabase: SupabaseClient,
  args: { lawyerUserId: string; startMs: number; durationMinutes: number; excludeId?: string | null; confirmOverlap: boolean },
): Promise<NextResponse | null> {
  const read = await readScheduleConflicts(supabase, args);
  if (!read.ok) {
    return NextResponse.json({ error: "تعذّر التحقق من تعارض المواعيد. حاول مرة أخرى." }, { status: 503 });
  }
  if (read.conflicts.length === 0 || args.confirmOverlap) return null;
  // The code stays `consultation_overlap` even when the clash is a hearing:
  // mutateConsultationSlot matches that exact string to offer «حفظ رغم التعارض».
  return NextResponse.json(
    { error: clashMessageAr(read.conflicts), code: CONSULTATION_OVERLAP_CODE, conflicts: read.conflicts },
    { status: 409 },
  );
}

/**
 * The hearing routes' half (owner q357): a timed, scheduled hearing checked
 * against the lawyer's consultations and other hearings. null when it may be
 * saved; a 409 `hearing_overlap` until the lawyer confirms; 503 on a failed read.
 */
export async function hearingOverlapRefusal(
  supabase: SupabaseClient,
  args: { lawyerUserId: string; startMs: number; durationMinutes: number; excludeHearingId?: string | null; confirmOverlap: boolean },
): Promise<NextResponse | null> {
  const read = await readScheduleConflicts(supabase, args);
  if (!read.ok) {
    return NextResponse.json({ error: "تعذّر التحقق من تعارض المواعيد. حاول مرة أخرى." }, { status: 503 });
  }
  if (read.conflicts.length === 0 || args.confirmOverlap) return null;
  return NextResponse.json(
    { error: clashMessageAr(read.conflicts), code: HEARING_OVERLAP_CODE, conflicts: read.conflicts },
    { status: 409 },
  );
}
