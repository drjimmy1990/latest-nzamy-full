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
 * `scheduled` — a cancelled, completed or unscheduled row holds no time.
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
  findOverlaps,
  isValidDuration,
  overlapMessageAr,
  overlapQueryWindow,
  type SlotCheck,
  type SlotConflict,
} from "@/lib/services/consultationSchedule";

export type OverlapRead =
  | { ok: true; conflicts: SlotConflict[] }
  | { ok: false };

export async function readScheduleConflicts(
  supabase: SupabaseClient,
  args: { lawyerUserId: string; startMs: number; durationMinutes: number; excludeId?: string | null },
): Promise<OverlapRead> {
  const { fromIso, toIso } = overlapQueryWindow(args.startMs, args.durationMinutes);
  const { data, error } = await supabase
    .from("consultations")
    .select("id, scheduled_at, duration_minutes")
    .eq("lawyer_user_id", args.lawyerUserId)
    .eq("status", "scheduled")
    .gt("scheduled_at", fromIso)
    .lt("scheduled_at", toIso)
    .limit(50);
  if (error) {
    console.error("[consultations schedule guard] overlap read failed:", error.message, error.code);
    return { ok: false };
  }
  const rows = (data ?? []) as Array<{ id: string; scheduled_at: string | null; duration_minutes: number | null }>;
  const conflicts = findOverlaps(
    args.startMs,
    args.durationMinutes,
    rows.filter((r) => r.scheduled_at).map((r) => ({ id: r.id, scheduledAt: r.scheduled_at as string, durationMinutes: r.duration_minutes })),
    args.excludeId,
  );
  return { ok: true, conflicts };
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
  return NextResponse.json(
    { error: overlapMessageAr(read.conflicts), code: CONSULTATION_OVERLAP_CODE, conflicts: read.conflicts },
    { status: 409 },
  );
}
