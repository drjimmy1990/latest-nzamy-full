import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { hijriLabelAr } from "@/lib/services/hijri";
import {
  parseIsoDate, isoDate, addDays, daysUntil, resolveHolidayDates, computeDueDate,
  pendingReminderOffsets, type HolidayRule,
} from "@/lib/services/deadlineEngine";

/**
 * /api/v1/lawyer/deadlines — Phase 5 (رادار المهل).
 *
 * Backed by `public.deadlines` (migration 20260904_phase5_deadline_radar.sql).
 * `deadlineEngine.ts` is the ONLY place a date is computed — this route reads
 * a rule (or a manual date), calls the engine once, and stores exactly what
 * it returned, together with how it got there (`days_count`,
 * `rolled_from_holiday`) so the screen can explain the number, not just show
 * it. A rule with `verified_by_owner = false` (every seeded platform rule
 * today) is a default, not legal advice — the screen, not this route, must
 * label it «قاعدة افتراضية — تحتاج مراجعتك»; this route only ever returns
 * `ruleVerified` honestly so that label can be drawn.
 *
 * POST also enqueues `notification_outbox` rows for the reminders this
 * deadline asked for (`reminderOffsetsDays`, default {7,3,1}) plus a
 * same-day "due" reminder when the due date is today or later. The table's
 * UNIQUE (deadline_id, recipient_user_id, channel, kind) means a duplicate
 * enqueue (a retried request, a re-run scheduler) is a no-op, not a double
 * notification — 23505 on that insert is expected and swallowed.
 */

const VALID_STATUS = new Set(["open", "done", "missed", "cancelled"]);
const VALID_PRIORITY = new Set(["urgent", "high", "normal"]);
const VALID_KIND = new Set(["statutory", "court_order", "internal", "contract"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RIYADH_06 = "T06:00:00+03:00";

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

function toDto(
  row: DeadlineRow,
  caseTitle: string | null,
  ruleTitleAr: string | null,
  ruleVerified: boolean | null,
) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    firmId: row.firm_id,
    caseRequestId: row.case_request_id,
    caseTitle,
    stageId: row.stage_id,
    hearingId: row.hearing_id,
    ruleId: row.rule_id,
    ruleTitleAr,
    ruleVerified,
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

/** Batch-fetches titles/rule labels for a page of rows in two RLS queries, never one per row. */
async function hydrate(supabase: SupabaseClient, rows: DeadlineRow[]) {
  const caseIds = [...new Set(rows.map((r) => r.case_request_id).filter((v): v is string => !!v))];
  const ruleIds = [...new Set(rows.map((r) => r.rule_id).filter((v): v is string => !!v))];

  const caseTitles = new Map<string, string>();
  if (caseIds.length > 0) {
    const { data } = await supabase.from("service_requests").select("id, title").in("id", caseIds);
    for (const r of (data ?? []) as { id: string; title: string | null }[]) {
      if (r.title) caseTitles.set(r.id, r.title);
    }
  }

  const rules = new Map<string, { titleAr: string; verified: boolean }>();
  if (ruleIds.length > 0) {
    const { data } = await supabase.from("deadline_rules").select("id, title_ar, verified_by_owner").in("id", ruleIds);
    for (const r of (data ?? []) as { id: string; title_ar: string; verified_by_owner: boolean }[]) {
      rules.set(r.id, { titleAr: r.title_ar, verified: r.verified_by_owner });
    }
  }

  return { caseTitles, rules };
}

function dbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "هذه المهلة مسجَّلة مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات المهلة غير صالحة." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ المهلة." };
}

/**
 * GET /api/v1/lawyer/deadlines?status=open|done|missed|cancelled|all&caseId&limit
 * Response: { data: Deadline[], total } — RLS-scoped, ordered due_date asc.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") || "open";
    const caseId = searchParams.get("caseId");
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

    if (statusParam !== "all" && !VALID_STATUS.has(statusParam)) {
      return NextResponse.json({ error: `status يجب أن يكون أحد: ${[...VALID_STATUS, "all"].join(", ")}` }, { status: 400 });
    }

    let query = supabase.from("deadlines").select(DEADLINE_SELECT, { count: "exact" });
    if (statusParam !== "all") query = query.eq("status", statusParam);
    if (caseId) query = query.eq("case_request_id", caseId);

    const { data, error, count } = await query.order("due_date", { ascending: true }).limit(limit);

    if (error) {
      console.error("[lawyer/deadlines GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل المهل." }, { status: 500 });
    }

    const rows = (data ?? []) as DeadlineRow[];
    const { caseTitles, rules } = await hydrate(supabase, rows);
    const dtos = rows.map((r) => {
      const rule = r.rule_id ? rules.get(r.rule_id) : undefined;
      return toDto(r, r.case_request_id ? caseTitles.get(r.case_request_id) ?? null : null, rule?.titleAr ?? null, rule ? rule.verified : null);
    });

    return NextResponse.json({ data: dtos, total: count ?? dtos.length });
  } catch (err) {
    console.error("[lawyer/deadlines GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

interface CreateBody {
  title?: string;
  triggerDate?: string;
  ruleId?: string;
  dueDate?: string;
  kind?: string;
  caseRequestId?: string;
  stageId?: string;
  hearingId?: string;
  priority?: string;
  reminderOffsetsDays?: number[];
  notes?: string;
}

function validOffsets(offsets: unknown): offsets is number[] {
  if (!Array.isArray(offsets)) return false;
  if (offsets.length > 6) return false;
  return offsets.every((o) => Number.isInteger(o) && o >= 0 && o <= 365);
}

/**
 * POST /api/v1/lawyer/deadlines
 * Body: CreateDeadlineInput. Either `ruleId` (the engine computes `dueDate`)
 * or a manual `dueDate` (>= triggerDate). Returns { data, computation }.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = (await request.json()) as CreateBody;
    const { title, triggerDate, ruleId, dueDate, kind, caseRequestId, stageId, hearingId, priority, reminderOffsetsDays, notes } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "عنوان المهلة مطلوب." }, { status: 400 });
    }
    if (!triggerDate || !ISO_DATE_RE.test(triggerDate) || !parseIsoDate(triggerDate)) {
      return NextResponse.json({ error: "تاريخ البداية مطلوب بصيغة YYYY-MM-DD." }, { status: 400 });
    }
    if (priority !== undefined && !VALID_PRIORITY.has(priority)) {
      return NextResponse.json({ error: `priority يجب أن يكون أحد: ${[...VALID_PRIORITY].join(", ")}` }, { status: 400 });
    }
    if (reminderOffsetsDays !== undefined && !validOffsets(reminderOffsetsDays)) {
      return NextResponse.json({ error: "أيام التذكير يجب أن تكون أعداداً صحيحة بين ٠ و٣٦٥، بحد أقصى ٦." }, { status: 400 });
    }
    if (kind !== undefined && !VALID_KIND.has(kind)) {
      return NextResponse.json({ error: `kind يجب أن يكون أحد: ${[...VALID_KIND].join(", ")}` }, { status: 400 });
    }

    if (caseRequestId) {
      const { data: caseRow } = await supabase.from("service_requests").select("id").eq("id", caseRequestId).maybeSingle();
      if (!caseRow) {
        return NextResponse.json({ error: "القضية غير موجودة أو لا يمكن الوصول إليها." }, { status: 400 });
      }
    }

    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/deadlines POST] firm_members lookup failed:", membershipError.message, membershipError.code);
    }
    const firmId = membership?.firm_id ?? null;

    let insertRow: Record<string, unknown>;
    let computation: {
      dueDate: string; daysCount: number; rolledFromHoliday: boolean;
      rolledPast: { date: string; reason: "weekend" | "holiday"; titleAr?: string }[];
      dueDateHijri: string | null; hijriResolved: boolean;
    } | null = null;

    if (ruleId) {
      const { data: rule, error: ruleError } = await supabase
        .from("deadline_rules")
        .select("id, period_days, count_from_next_day, roll_forward_if_holiday")
        .eq("id", ruleId)
        .maybeSingle();
      if (ruleError) {
        console.error("[lawyer/deadlines POST] rule lookup failed:", ruleError.message, ruleError.code);
      }
      if (!rule) {
        return NextResponse.json({ error: "القاعدة غير موجودة" }, { status: 404 });
      }

      const { data: holidayRows, error: holidayError } = await supabase
        .from("court_holidays")
        .select("id, title_ar, kind, greg_month, greg_day, hijri_month, hijri_day, length_days, start_date, end_date, approximate, active")
        .eq("active", true);
      if (holidayError) {
        console.error("[lawyer/deadlines POST] holidays lookup failed:", holidayError.message, holidayError.code);
      }
      const holidayRules: HolidayRule[] = ((holidayRows ?? []) as Array<Record<string, unknown>>).map((h) => ({
        id: h.id as string,
        titleAr: h.title_ar as string,
        kind: h.kind as HolidayRule["kind"],
        gregMonth: h.greg_month as number | null,
        gregDay: h.greg_day as number | null,
        hijriMonth: h.hijri_month as number | null,
        hijriDay: h.hijri_day as number | null,
        lengthDays: h.length_days as number,
        startDate: h.start_date as string | null,
        endDate: h.end_date as string | null,
        approximate: h.approximate as boolean,
        active: h.active as boolean,
      }));

      const triggerYear = parseIsoDate(triggerDate)!.getFullYear();
      // period_days can be as long as 3660 (~10y, the migration's own CHECK
      // ceiling) — size the holiday-resolution window to the rule's actual
      // period instead of a fixed 3y, plus a 2y buffer for roll-forward
      // chains that push the due date past a year boundary.
      const yearsSpan = Math.ceil((rule.period_days as number) / 365) + 2;
      const holidays = resolveHolidayDates(holidayRules, triggerYear, triggerYear + yearsSpan);
      const result = computeDueDate({
        triggerDate,
        periodDays: rule.period_days,
        countFromNextDay: rule.count_from_next_day,
        rollForwardIfHoliday: rule.roll_forward_if_holiday,
        holidays,
      });
      if (!result) {
        return NextResponse.json({ error: "تعذّر احتساب تاريخ الاستحقاق من هذه القاعدة." }, { status: 400 });
      }

      computation = {
        dueDate: result.dueDate, daysCount: result.daysCount, rolledFromHoliday: result.rolledFromHoliday,
        rolledPast: result.rolledPast, dueDateHijri: result.dueDateHijri, hijriResolved: result.hijriResolved,
      };
      insertRow = {
        due_date: result.dueDate,
        due_date_hijri: result.dueDateHijri,
        days_count: result.daysCount,
        computed_by_rule: true,
        rolled_from_holiday: result.rolledFromHoliday,
        kind: "statutory",
        rule_id: ruleId,
      };
    } else {
      if (!dueDate || !ISO_DATE_RE.test(dueDate) || !parseIsoDate(dueDate)) {
        return NextResponse.json({ error: "تاريخ الاستحقاق مطلوب بصيغة YYYY-MM-DD." }, { status: 400 });
      }
      if (dueDate < triggerDate) {
        return NextResponse.json({ error: "تاريخ الاستحقاق لا يسبق تاريخ البداية" }, { status: 400 });
      }
      const dueDateObj = parseIsoDate(dueDate)!;
      insertRow = {
        due_date: dueDate,
        due_date_hijri: hijriLabelAr(dueDateObj),
        days_count: null,
        computed_by_rule: false,
        rolled_from_holiday: false,
        kind: kind && VALID_KIND.has(kind) ? kind : "internal",
        rule_id: null,
      };
    }

    const finalDueDate = insertRow.due_date as string;
    const offsets = reminderOffsetsDays !== undefined ? reminderOffsetsDays : undefined;

    const { data, error } = await supabase
      .from("deadlines")
      .insert({
        owner_user_id: user.id,
        firm_id: firmId,
        case_request_id: caseRequestId || null,
        stage_id: stageId || null,
        hearing_id: hearingId || null,
        title: title.trim(),
        trigger_date: triggerDate,
        priority: priority ?? undefined,
        notes: notes?.trim() || "",
        reminder_offsets_days: offsets,
        ...insertRow,
      })
      .select(DEADLINE_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = dbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    const row = data as DeadlineRow;

    // Enqueue reminder + due-date rows. Best-effort: never fails the create.
    try {
      const effectiveOffsets = row.reminder_offsets_days ?? [7, 3, 1];
      const pending = pendingReminderOffsets(finalDueDate, effectiveOffsets);
      const outboxRows: Record<string, unknown>[] = pending.map((n) => ({
        deadline_id: row.id,
        recipient_user_id: user.id,
        channel: "in_app",
        kind: `deadline_reminder_${n}d`,
        scheduled_for: `${isoDate(addDays(parseIsoDate(finalDueDate)!, -n))}${RIYADH_06}`,
        payload: { title: row.title, dueDate: finalDueDate },
      }));
      const left = daysUntil(finalDueDate);
      if (left !== null && left >= 0) {
        outboxRows.push({
          deadline_id: row.id,
          recipient_user_id: user.id,
          channel: "in_app",
          kind: "deadline_due",
          scheduled_for: `${finalDueDate}${RIYADH_06}`,
          payload: { title: row.title, dueDate: finalDueDate },
        });
      }
      if (outboxRows.length > 0) {
        const { error: outboxError } = await supabase.from("notification_outbox").insert(outboxRows);
        if (outboxError && outboxError.code !== "23505") {
          console.error("[lawyer/deadlines POST] outbox enqueue failed:", outboxError.message, outboxError.code);
        }
      }
    } catch (outboxErr) {
      console.error("[lawyer/deadlines POST] outbox enqueue threw:", outboxErr);
    }

    const ruleInfo = ruleId
      ? ((await supabase.from("deadline_rules").select("title_ar, verified_by_owner").eq("id", ruleId).maybeSingle()).data as
          | { title_ar: string; verified_by_owner: boolean }
          | null)
      : null;
    const caseInfo = caseRequestId
      ? ((await supabase.from("service_requests").select("title").eq("id", caseRequestId).maybeSingle()).data as { title: string | null } | null)
      : null;

    return NextResponse.json({
      data: toDto(row, caseInfo?.title ?? null, ruleInfo?.title_ar ?? null, ruleInfo ? ruleInfo.verified_by_owner : null),
      computation,
    });
  } catch (err) {
    console.error("[lawyer/deadlines POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
