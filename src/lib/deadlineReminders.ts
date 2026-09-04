/**
 * deadlineReminders.ts — SERVER ONLY. The one place outbox rows are queued for
 * a deadline.
 * ─────────────────────────────────────────────────────────
 * Until 2026-09-04 two routes built these rows by hand (lawyer/deadlines POST
 * and the judgment hook in case-stages PATCH), and Phase 3 adds a third
 * writer (contract obligations). Three copies of "06:00 Riyadh, N days
 * before, plus the due day" is how one of them drifts. So: one function.
 *
 * Idempotent by construction — `notification_outbox` carries
 * unique (deadline_id, recipient_user_id, channel, kind); a duplicate is a
 * 23505 we ignore, never a second reminder. Never throws: a queue failure is
 * logged and reported in the result, and the deadline itself stays saved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysUntil, isoDate, parseIsoDate, pendingReminderOffsets } from "@/lib/services/deadlineEngine";

/** Reminders go out at 06:00 Riyadh on the day they are due. */
export const RIYADH_06 = "T06:00:00+03:00";
export const DEFAULT_REMINDER_OFFSETS: readonly number[] = [7, 3, 1];

/** «2026-09-24» − 3 days → «2026-09-21T06:00:00+03:00»; null on a bad date. */
export function reminderScheduledForIso(dueDate: string, offsetDays: number): string | null {
  const due = parseIsoDate(dueDate);
  if (!due || !Number.isInteger(offsetDays) || offsetDays < 0) return null;
  return `${isoDate(addDays(due, -offsetDays))}${RIYADH_06}`;
}

export interface EnqueueParams {
  supabase: SupabaseClient;
  deadlineId: string;
  recipientUserId: string;
  title: string;
  dueDate: string;
  /** Days before the due date; defaults to the deadline row's own {7,3,1}. */
  offsets?: number[] | null;
  /** For tests; defaults to now. */
  today?: Date;
}

export interface EnqueueResult {
  /** Rows handed to the database (duplicates already there are not counted as failures). */
  queued: number;
  error: string | null;
}

/**
 * Queue the in-app reminders still ahead of `dueDate` (7/3/1 days before by
 * default) and the due-day notice. Past offsets are skipped, not back-dated.
 */
export async function enqueueDeadlineReminders(params: EnqueueParams): Promise<EnqueueResult> {
  const { supabase, deadlineId, recipientUserId, title, dueDate } = params;
  const today = params.today ?? new Date();
  const offsets = Array.isArray(params.offsets) && params.offsets.length > 0 ? params.offsets : [...DEFAULT_REMINDER_OFFSETS];

  try {
    const rows: Record<string, unknown>[] = [];
    for (const n of pendingReminderOffsets(dueDate, offsets, today)) {
      if (n === 0) continue; // the due day is its own kind below
      const at = reminderScheduledForIso(dueDate, n);
      if (!at) continue;
      rows.push({
        deadline_id: deadlineId,
        recipient_user_id: recipientUserId,
        channel: "in_app",
        kind: `deadline_reminder_${n}d`,
        scheduled_for: at,
        payload: { title, dueDate },
      });
    }
    const left = daysUntil(dueDate, today);
    if (left !== null && left >= 0) {
      rows.push({
        deadline_id: deadlineId,
        recipient_user_id: recipientUserId,
        channel: "in_app",
        kind: "deadline_due",
        scheduled_for: `${dueDate}${RIYADH_06}`,
        payload: { title, dueDate },
      });
    }
    if (rows.length === 0) return { queued: 0, error: null };

    const { error } = await supabase.from("notification_outbox").insert(rows);
    if (error && error.code !== "23505") {
      console.error("[deadlineReminders] outbox enqueue failed:", error.message, error.code);
      return { queued: 0, error: error.message };
    }
    return { queued: rows.length, error: null };
  } catch (err) {
    console.error("[deadlineReminders] outbox enqueue threw:", err);
    return { queued: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Cancels every pending outbox row of a deadline (done / cancelled / re-dated). */
export async function cancelPendingDeadlineReminders(supabase: SupabaseClient, deadlineId: string): Promise<void> {
  const { error } = await supabase
    .from("notification_outbox")
    .update({ status: "cancelled" })
    .eq("deadline_id", deadlineId)
    .eq("status", "pending");
  if (error) console.error("[deadlineReminders] outbox cancel failed:", error.message, error.code);
}
