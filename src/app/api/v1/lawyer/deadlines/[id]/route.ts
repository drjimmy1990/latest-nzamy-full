import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { recordActivity, RequestEvent } from "@/lib/events";
import { hijriLabelAr } from "@/lib/services/hijri";
import { parseIsoDate, daysUntil } from "@/lib/services/deadlineEngine";
import { enqueueDeadlineReminders, cancelPendingDeadlineReminders } from "@/lib/deadlineReminders";

/**
 * /api/v1/lawyer/deadlines/[id] — Phase 5 (رادار المهل).
 *
 * PATCH only. A rule-computed deadline (`computed_by_rule = true`) cannot
 * have its `due_date` edited here — the engine, not a hand edit, is what
 * produced that date; recreate it instead. Marking a deadline done/cancelled
 * cancels its still-pending `notification_outbox` rows so a reminder never
 * fires for a deadline the lawyer already closed. Re-dating a manual
 * deadline, or reopening one (status back to `open`), cancels then
 * re-queues: `cancelPendingDeadlineReminders` invalidates whatever kinds no
 * longer fit the new schedule, and `enqueueDeadlineReminders` — an upsert
 * keyed on the outbox's own UNIQUE (deadline_id, recipient_user_id, channel,
 * kind) — revives every kind the new schedule still wants (however it was
 * left: pending, cancelled, or sent) and inserts any kind that never had a
 * row at all. See that function's own header for why the upsert, not a
 * plain insert, is what makes this safe.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = new Set(["open", "done", "missed", "cancelled"]);
const VALID_PRIORITY = new Set(["urgent", "high", "normal"]);

interface DeadlineRow {
  id: string;
  owner_user_id: string;
  firm_id: string | null;
  case_request_id: string | null;
  stage_id: string | null;
  hearing_id: string | null;
  rule_id: string | null;
  title: string;
  kind: string;
  trigger_date: string;
  due_date: string;
  due_date_hijri: string | null;
  days_count: number | null;
  computed_by_rule: boolean;
  rolled_from_holiday: boolean;
  reminder_offsets_days: number[];
  priority: string;
  status: string;
  completed_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toDto(row: DeadlineRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    firmId: row.firm_id,
    caseRequestId: row.case_request_id,
    stageId: row.stage_id,
    hearingId: row.hearing_id,
    ruleId: row.rule_id,
    title: row.title,
    kind: row.kind,
    triggerDate: row.trigger_date,
    dueDate: row.due_date,
    dueDateHijri: row.due_date_hijri,
    daysCount: row.days_count,
    computedByRule: row.computed_by_rule,
    rolledFromHoliday: row.rolled_from_holiday,
    reminderOffsetsDays: row.reminder_offsets_days ?? [],
    priority: row.priority,
    status: row.status,
    completedAt: row.completed_at,
    notes: row.notes,
    daysLeft: daysUntil(row.due_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DEADLINE_SELECT =
  "id, owner_user_id, firm_id, case_request_id, stage_id, hearing_id, rule_id, title, kind, trigger_date, due_date, due_date_hijri, days_count, computed_by_rule, rolled_from_holiday, reminder_offsets_days, priority, status, completed_at, notes, created_at, updated_at";

function validOffsets(offsets: unknown): offsets is number[] {
  if (!Array.isArray(offsets)) return false;
  if (offsets.length > 6) return false;
  return offsets.every((o) => Number.isInteger(o) && o >= 0 && o <= 365);
}

function dbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "هذه المهلة مسجَّلة مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات المهلة غير صالحة." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر تحديث المهلة." };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const { data: existing, error: fetchError } = await supabase
      .from("deadlines")
      .select("id, trigger_date, due_date, computed_by_rule, status, owner_user_id, firm_id, case_request_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) {
      console.error("[lawyer/deadlines PATCH] lookup failed:", fetchError.message, fetchError.code);
    }
    if (!existing) {
      return NextResponse.json({ error: "المهلة غير موجودة" }, { status: 404 });
    }

    const body = (await request.json()) as {
      status?: string; priority?: string; notes?: string;
      reminderOffsetsDays?: number[]; dueDate?: string; title?: string;
    };
    const { status, priority, notes, reminderOffsetsDays, dueDate, title } = body;

    const patch: Record<string, unknown> = {};

    if (status !== undefined) {
      if (!VALID_STATUS.has(status)) {
        return NextResponse.json({ error: `status يجب أن يكون أحد: ${[...VALID_STATUS].join(", ")}` }, { status: 400 });
      }
      patch.status = status;
      if (status === "done" || status === "cancelled") {
        patch.completed_at = new Date().toISOString();
      } else {
        // Reopened (or corrected to missed) — clear any stale completed_at
        // left over from a prior done/cancelled state.
        patch.completed_at = null;
      }
    }
    if (priority !== undefined) {
      if (!VALID_PRIORITY.has(priority)) {
        return NextResponse.json({ error: `priority يجب أن يكون أحد: ${[...VALID_PRIORITY].join(", ")}` }, { status: 400 });
      }
      patch.priority = priority;
    }
    if (notes !== undefined) patch.notes = notes.trim();
    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json({ error: "عنوان المهلة مطلوب." }, { status: 400 });
      }
      patch.title = title.trim();
    }
    if (reminderOffsetsDays !== undefined) {
      if (!validOffsets(reminderOffsetsDays)) {
        return NextResponse.json({ error: "أيام التذكير يجب أن تكون أعداداً صحيحة بين ٠ و٣٦٥، بحد أقصى ٦." }, { status: 400 });
      }
      patch.reminder_offsets_days = reminderOffsetsDays;
    }
    if (dueDate !== undefined) {
      if (existing.computed_by_rule) {
        return NextResponse.json({ error: "هذه المهلة محسوبة من قاعدة — أعد إنشاءها بدل تعديل تاريخها" }, { status: 400 });
      }
      if (!ISO_DATE_RE.test(dueDate) || !parseIsoDate(dueDate)) {
        return NextResponse.json({ error: "تاريخ الاستحقاق مطلوب بصيغة YYYY-MM-DD." }, { status: 400 });
      }
      if (dueDate < existing.trigger_date) {
        return NextResponse.json({ error: "تاريخ الاستحقاق لا يسبق تاريخ البداية" }, { status: 400 });
      }
      patch.due_date = dueDate;
      patch.due_date_hijri = hijriLabelAr(parseIsoDate(dueDate)!);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("deadlines")
      .update(patch)
      .eq("id", id)
      .select(DEADLINE_SELECT)
      .single();

    if (error || !data) {
      const { status: httpStatus, message } = dbErrorResponse(error);
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    if (status === "done" || status === "cancelled") {
      await cancelPendingDeadlineReminders(supabase, id);
    } else {
      // Re-dating a manual deadline, or reopening one, invalidates whatever
      // was queued for the old schedule — requeue for the row as it stands
      // after this update.
      const redated = dueDate !== undefined && dueDate !== existing.due_date;
      const reopened = status === "open" && existing.status !== "open";
      if (redated || reopened) {
        const finalRow = data as DeadlineRow;
        await cancelPendingDeadlineReminders(supabase, id);
        await enqueueDeadlineReminders({
          supabase,
          deadlineId: id,
          recipientUserId: existing.owner_user_id,
          title: finalRow.title,
          dueDate: finalRow.due_date,
          offsets: finalRow.reminder_offsets_days,
        });
      }
    }

    // Best-effort activity row, only when the status actually changed.
    if (status !== undefined && status !== existing.status) {
      try {
        await recordActivity({
          supabase,
          kind: RequestEvent.DEADLINE_STATUS_CHANGED,
          ownerUserId: existing.owner_user_id,
          firmId: existing.firm_id ?? null,
          actorUserId: user.id,
          caseRequestId: existing.case_request_id ?? null,
          subjectTable: "deadlines",
          subjectId: id,
          payload: { title: (data as DeadlineRow).title, status },
        });
      } catch (activityErr) {
        console.error("[lawyer/deadlines PATCH] activity record failed:", activityErr);
      }
    }

    return NextResponse.json({ data: toDto(data as DeadlineRow) });
  } catch (err) {
    console.error("[lawyer/deadlines PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
