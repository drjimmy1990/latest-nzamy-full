/**
 * deadlineReminders.ts — SERVER ONLY. The one place outbox rows are queued for
 * a deadline.
 * ─────────────────────────────────────────────────────────
 * Until 2026-09-04 two routes built these rows by hand (lawyer/deadlines POST
 * and the judgment hook in case-stages PATCH), and Phase 3 adds a third
 * writer (contract obligations). Three copies of "06:00 Riyadh, N days
 * before, plus the due day" is how one of them drifts. So: one function.
 *
 * Idempotent by upsert, not by ignoring a conflict — `notification_outbox`
 * carries unique (deadline_id, recipient_user_id, channel, kind), and every
 * row here is written with `.upsert(..., { onConflict: <that key> })`, every
 * field (including `status: "pending"`) explicitly set. A kind that has no
 * row yet is inserted; a kind that already has one — pending, cancelled, or
 * even already `sent` — is revived in place with the freshly computed
 * schedule, which is exactly what re-arming a reminder after a re-date or a
 * reopen needs. A plain `.insert()` with the old "23505 means duplicate,
 * ignore it" handling could not do this: a single conflicting row inside a
 * multi-row INSERT aborts the *whole* statement, so a batch that mixed one
 * already-existing kind with several genuinely new ones would silently drop
 * all of them while still reporting success. Never throws: a queue failure
 * is logged and reported in the result, and the deadline itself stays saved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysUntil, isoDate, parseIsoDate, pendingReminderOffsets } from "./services/deadlineEngine.ts";

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
  /** Rows handed to the database (a revived existing row counts the same as a new one). */
  queued: number;
  error: string | null;
}

/** The outbox's own unique key — every upsert here targets exactly this. */
const OUTBOX_CONFLICT_KEY = "deadline_id,recipient_user_id,channel,kind";

/**
 * Queue the in-app reminders still ahead of `dueDate` (7/3/1 days before by
 * default) and the due-day notice. Past offsets are skipped, not back-dated.
 * A kind that already has a row for this deadline (any status) is revived
 * to `pending` with the fresh schedule rather than left alone — see the
 * module header for why that is the point of upserting here, not a side
 * effect.
 */
export async function enqueueDeadlineReminders(params: EnqueueParams): Promise<EnqueueResult> {
  const { supabase, deadlineId, recipientUserId, title, dueDate } = params;
  const today = params.today ?? new Date();
  const offsets = Array.isArray(params.offsets) && params.offsets.length > 0 ? params.offsets : [...DEFAULT_REMINDER_OFFSETS];

  try {
    // Every row — offset-based or the due-day row — carries the identical
    // key set below. That is load-bearing: PostgREST builds one upsert
    // statement from the batch, and `status: "pending"` (reset alongside
    // attempts/last_error/sent_at) is what actually re-arms a row that was
    // previously cancelled or already sent — omitting it on any row would
    // leave that one kind's `DO UPDATE` touch only `scheduled_for`/`payload`
    // and silently leave its old status in place.
    const baseRow = (kind: string, scheduledFor: string) => ({
      deadline_id: deadlineId,
      recipient_user_id: recipientUserId,
      channel: "in_app",
      kind,
      scheduled_for: scheduledFor,
      payload: { title, dueDate },
      status: "pending",
      attempts: 0,
      last_error: null,
      sent_at: null,
    });

    const rows: Record<string, unknown>[] = [];
    for (const n of pendingReminderOffsets(dueDate, offsets, today)) {
      if (n === 0) continue; // the due day is its own kind below
      const at = reminderScheduledForIso(dueDate, n);
      if (!at) continue;
      rows.push(baseRow(`deadline_reminder_${n}d`, at));
    }
    const left = daysUntil(dueDate, today);
    if (left !== null && left >= 0) {
      rows.push(baseRow("deadline_due", `${dueDate}${RIYADH_06}`));
    }
    if (rows.length === 0) return { queued: 0, error: null };

    // «لا يُرسَل التنبيه نفسه مرّتين»: a kind that was already SENT for this
    // exact schedule is left alone. A sent kind whose schedule has moved (the
    // deadline was re-dated) is a different reminder and IS revived; a
    // cancelled kind is always revived. The read is RLS-scoped to what the
    // caller may see; if it fails we fall through to the upsert unchanged.
    let toWrite = rows;
    try {
      const { data: existing, error: readError } = await supabase
        .from("notification_outbox")
        .select("kind, status, scheduled_for")
        .eq("deadline_id", deadlineId)
        .eq("recipient_user_id", recipientUserId);
      if (readError) {
        console.error("[deadlineReminders] outbox read failed:", readError.message, readError.code);
      } else {
        const sentAt = new Map<string, number>();
        for (const r of (existing ?? []) as { kind: string; status: string; scheduled_for: string }[]) {
          if (r.status === "sent") sentAt.set(r.kind, Date.parse(r.scheduled_for));
        }
        toWrite = rows.filter((r) => {
          const prev = sentAt.get(r.kind as string);
          return prev === undefined || Number.isNaN(prev) || prev !== Date.parse(r.scheduled_for as string);
        });
      }
    } catch (readErr) {
      console.error("[deadlineReminders] outbox read threw:", readErr);
    }
    if (toWrite.length === 0) return { queued: 0, error: null };

    const { error } = await supabase
      .from("notification_outbox")
      .upsert(toWrite, { onConflict: OUTBOX_CONFLICT_KEY });
    if (error) {
      console.error("[deadlineReminders] outbox enqueue failed:", error.message, error.code);
      return { queued: 0, error: error.message };
    }
    return { queued: toWrite.length, error: null };
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
