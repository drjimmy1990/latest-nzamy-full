import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { assertCourtPractice } from "@/lib/auth/assertCourtPractice";
import { recordActivity, RequestEvent } from "@/lib/events";
import type { AutoDeadlineResult, AutoDeadlineSummary, LinkedStageDeadline } from "@/lib/services/caseStagesService";
import {
  type UiDegree, VALID_UI_DEGREES, degreeToDb, degreeFromDb,
} from "@/lib/services/caseStageVocabulary";
import {
  type HolidayKind, type HolidayRule,
  computeDueDate, resolveHolidayDates, parseIsoDate,
} from "@/lib/services/deadlineEngine";
import { enqueueDeadlineReminders, cancelPendingDeadlineReminders } from "@/lib/deadlineReminders";
import {
  DEGREE_TO_AUTO_RULE_CODE, STAGE_DEADLINE_ENGINE_VERSION,
  type ExistingAutoDeadline, type StageTriggerEvent, type ComputationRecord,
  readStageTrigger, effectiveTriggerDate, inferLegacyTrigger, resolveStagePatch,
  planStageDeadlineSync, recomputedMetadata, syncCancelledMetadata,
} from "@/lib/services/stageDeadlineSync";

/**
 * /api/v1/lawyer/case-stages/[caseId] — Phase 1 (خطة_البناء_الكاملة §5), the
 * last of the five surfaces.
 *
 * Backed by `public.case_stages` (migration 20260903_phase1_case_tables.sql).
 * A case has no record today of which court DEGREE (ابتدائي/استئناف/نقض/تنفيذ)
 * it is currently at — one status field covers the whole lifetime of a case,
 * so a lawyer arguing an appeal and a lawyer still at first instance look
 * identical in the data. This route is the one place that gets read and
 * written now.
 *
 * NOT to be confused with two same-sounding, unrelated things already in the
 * codebase: `Case.degree` in `src/constants/lawyerCasesData.ts` (a single
 * heuristic — primary/labor/criminal/admin/appeal/supreme — guessed from the
 * free-text court name, used only to group the case LIST page into Kanban
 * columns) and `CASE_STAGES` in `lawyer/cases/[id]/page.tsx` (a 4-step
 * تقديم/قيد التداول/مراجعة/إغلاق workflow-progress bar derived from `status`).
 * Neither reads or writes `public.case_stages`; this route touches neither.
 *
 * caseId in the path is `case_request_id` (service_requests.id, text) — the
 * same anchor hearings/tasks/activity_events/case_graphs already use, because
 * `public.cases` has zero writers (verified this wave).
 *
 * ── PHASE 5 HOOK — رادار المهل (خطة_البناء_الكاملة §9) ──────────────────────
 * PATCH keeps the stage's statutory deadline in step with its outcome:
 * `first_instance` → the `appeal_general` platform rule, `appeal` →
 * `cassation` (`cassation`/`execution` have no next filing window here).
 *
 * Owner package 2026-10-30 (LIVE-F15, LIVE-F25, CODE-F03, CODE-F04) changed
 * what starts and moves that clock — the decisions live in
 * `stageDeadlineSync.ts`, this route only reads rows and carries them out:
 *   • only a FINAL outcome closes a degree; «قيد النظر» clears `closed_on`
 *     and never creates a deadline (an auto deadline it left open is
 *     cancelled, with the reason);
 *   • the clock starts from an event the lawyer chooses — the judgment's
 *     date, the day its copy was received, or the notification — stored in
 *     `case_stages.metadata.deadline_trigger`; no event, no deadline;
 *   • a corrected date/event RECOMPUTES the linked open deadline (old values
 *     kept in `deadlines.metadata.history`, reminders re-queued, an activity
 *     row with from/to); a deadline the lawyer already closed is kept and the
 *     response says so;
 *   • every auto deadline records its inputs in `deadlines.metadata.computation`.
 * The due date is computed the same way the deadlines POST route does
 * (`deadlineEngine.ts` against `court_holidays`), and reminders go through
 * `enqueueDeadlineReminders` for the cron (`/api/v1/cron/deadlines`). The hook
 * is best-effort: a failure in it is logged and reported in `autoDeadline`,
 * never fails the PATCH that recorded the outcome.
 */

interface StageRow {
  id: string;
  case_request_id: string;
  degree: string;
  court_name: string;
  court_case_no: string | null;
  circuit: string | null;
  judge_name: string | null;
  opened_on: string | null;
  closed_on: string | null;
  outcome: string | null;
  position: number;
  notes: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(row: StageRow, linkedDeadline?: LinkedStageDeadline | null) {
  const trigger = readStageTrigger(row.metadata);
  return {
    id: row.id,
    caseRequestId: row.case_request_id,
    degree: degreeFromDb(row.degree),
    courtName: row.court_name || undefined,
    courtCaseNo: row.court_case_no || undefined,
    circuit: row.circuit || undefined,
    judgeName: row.judge_name || undefined,
    openedOn: row.opened_on,
    closedOn: row.closed_on,
    outcome: row.outcome,
    position: row.position,
    notes: row.notes || undefined,
    triggerEvent: trigger?.event ?? null,
    triggerDate: effectiveTriggerDate(trigger, row.closed_on),
    ...(linkedDeadline !== undefined ? { linkedDeadline } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STAGE_SELECT =
  "id, case_request_id, degree, court_name, court_case_no, circuit, judge_name, opened_on, closed_on, outcome, position, notes, metadata, created_at, updated_at";

const AUTO_DEADLINE_SELECT = "id, status, rule_id, trigger_date, due_date, created_at, metadata, owner_user_id, title, due_date_hijri, days_count, rolled_from_holiday";

type AutoDeadlineRow = ExistingAutoDeadline & {
  owner_user_id: string;
  title: string;
  due_date_hijri: string | null;
  days_count: number | null;
  rolled_from_holiday: boolean;
};

/** The newest open auto deadline per stage, else the newest one at all. */
function linkedByStage(rows: AutoDeadlineRow[]): Map<string, LinkedStageDeadline> {
  const out = new Map<string, LinkedStageDeadline>();
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  for (const r of sorted) {
    const stageId = (r as unknown as { stage_id: string }).stage_id;
    const current = out.get(stageId);
    if (!current || (current.status !== "open" && r.status === "open")) {
      out.set(stageId, { id: r.id, status: r.status, triggerDate: r.trigger_date, dueDate: r.due_date });
    }
  }
  return out;
}

/**
 * GET /api/v1/lawyer/case-stages/[caseId]
 * Ordered by `position` then `opened_on` — a stage opened without a date yet
 * (still being filed) still needs a stable place in the list, which
 * `opened_on` alone (nulls first/last either way) can't give it. Each stage
 * carries its linked auto deadline, so the outcome form can show what a
 * date correction will move (LIVE-F25).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { caseId } = await context.params;

    const { data, error, count } = await supabase
      .from("case_stages")
      .select(STAGE_SELECT, { count: "exact" })
      .eq("case_request_id", caseId)
      .order("position", { ascending: true })
      .order("opened_on", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("[lawyer/case-stages GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as StageRow[];
    // Best-effort: a failed read leaves `linkedDeadline` undefined (unknown),
    // never null (which would mean "none").
    let linked: Map<string, LinkedStageDeadline> | null = null;
    if (rows.length > 0) {
      const { data: dl, error: dlError } = await supabase
        .from("deadlines")
        .select(`stage_id, ${AUTO_DEADLINE_SELECT}`)
        .in("stage_id", rows.map((r) => r.id))
        .eq("computed_by_rule", true);
      if (dlError) console.error("[lawyer/case-stages GET] linked deadlines read failed:", dlError.message, dlError.code);
      else linked = linkedByStage((dl ?? []) as unknown as AutoDeadlineRow[]);
    }
    return NextResponse.json({
      data: rows.map((r) => toDto(r, linked ? linked.get(r.id) ?? null : undefined)),
      total: count ?? rows.length,
    });
  } catch (err) {
    console.error("[lawyer/case-stages GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/case-stages/[caseId]
 * Body: { degree, courtName?, courtCaseNo?, circuit?, judgeName?, openedOn?, notes? }
 *
 * `position` is assigned server-side as "one past the current max" for this
 * case — the UI never sends it, matching how AddTaskModal never sends
 * subtask ordering; a drag-to-reorder PATCH can be added later without this
 * route changing shape.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    // Art. 18: a legal consultant does not plead, so he records no court degree.
    const refused = await assertCourtPractice(supabase, user.id);
    if (refused) return refused;
    const { caseId } = await context.params;

    const body = await request.json();
    const {
      degree, courtName, courtCaseNo, circuit, judgeName, openedOn, notes,
    } = body as {
      degree?: string; courtName?: string; courtCaseNo?: string;
      circuit?: string; judgeName?: string; openedOn?: string; notes?: string;
    };

    if (!degree || !(VALID_UI_DEGREES as readonly string[]).includes(degree)) {
      return NextResponse.json({ error: `degree must be one of: ${VALID_UI_DEGREES.join(", ")}` }, { status: 400 });
    }
    if (openedOn && !/^\d{4}-\d{2}-\d{2}$/.test(openedOn)) {
      return NextResponse.json({ error: "openedOn must be YYYY-MM-DD" }, { status: 400 });
    }

    const { data: caseRow, error: caseError } = await supabase
      .from("service_requests")
      .select("id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseError || !caseRow) {
      return NextResponse.json({ error: "case not found" }, { status: 404 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/case-stages POST] firm_members lookup failed:", membershipError.message, membershipError.code);
    }

    const { data: maxPos } = await supabase
      .from("case_stages")
      .select("position")
      .eq("case_request_id", caseId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxPos?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("case_stages")
      .insert({
        case_request_id: caseId,
        firm_id: membership?.firm_id ?? null,
        owner_user_id: user.id,
        degree: degreeToDb(degree as UiDegree),
        court_name: courtName?.trim() || "",
        court_case_no: courtCaseNo?.trim() || null,
        circuit: circuit?.trim() || null,
        judge_name: judgeName?.trim() || null,
        opened_on: openedOn || null,
        notes: notes?.trim() || "",
        position: nextPosition,
      })
      .select(STAGE_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    await recordActivity({
      supabase,
      kind: RequestEvent.CASE_STAGE_ADDED,
      ownerUserId: user.id,
      firmId: membership?.firm_id ?? null,
      actorUserId: user.id,
      caseRequestId: caseId,
      subjectTable: "case_stages",
      subjectId: data.id,
      payload: { degree },
    });

    return NextResponse.json({ data: toDto(data as StageRow, null) });
  } catch (err) {
    console.error("[lawyer/case-stages POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

interface RuleRow {
  id: string;
  title_ar: string;
  period_days: number;
  count_from_next_day: boolean;
  roll_forward_if_holiday: boolean;
  verified_by_owner: boolean | null;
}

/** Loads the platform rule for a degree, or null (none / inactive / failed). */
async function loadAutoRule(supabase: SupabaseClient, degree: string): Promise<{ rule: RuleRow | null; failed: boolean }> {
  const ruleCode = DEGREE_TO_AUTO_RULE_CODE[degree];
  if (!ruleCode) return { rule: null, failed: false };
  const { data, error } = await supabase
    .from("deadline_rules")
    .select("id, title_ar, period_days, count_from_next_day, roll_forward_if_holiday, verified_by_owner")
    .eq("code", ruleCode)
    .is("owner_user_id", null)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("[case-stages PATCH] auto-deadline rule lookup failed:", error.message, error.code);
    return { rule: null, failed: true };
  }
  return { rule: (data as RuleRow | null) ?? null, failed: false };
}

/** The due date for `triggerDate` under `rule`, against `court_holidays`. */
async function computeForRule(supabase: SupabaseClient, rule: RuleRow, triggerDate: string) {
  const { data: holidayRows, error: holidayError } = await supabase
    .from("court_holidays")
    .select("id, title_ar, kind, greg_month, greg_day, hijri_month, hijri_day, length_days, start_date, end_date, approximate, active")
    .eq("active", true);
  if (holidayError) {
    console.error("[case-stages PATCH] auto-deadline holidays lookup failed:", holidayError.message, holidayError.code);
    return null;
  }
  const holidayRules: HolidayRule[] = (holidayRows ?? []).map((h) => ({
    id: h.id as string,
    titleAr: h.title_ar as string,
    kind: h.kind as HolidayKind,
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
  const triggerYear = parseIsoDate(triggerDate)?.getFullYear();
  if (!triggerYear) return null;
  const resolved = resolveHolidayDates(holidayRules, triggerYear, triggerYear + 1);
  return computeDueDate({
    triggerDate,
    periodDays: rule.period_days,
    countFromNextDay: rule.count_from_next_day,
    rollForwardIfHoliday: rule.roll_forward_if_holiday,
    holidays: resolved,
  });
}

function summaryOf(row: { id: string; title: string; due_date: string; due_date_hijri: string | null; days_count: number | null; rolled_from_holiday: boolean }, rule: RuleRow | null): AutoDeadlineSummary {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    dueDateHijri: row.due_date_hijri,
    daysCount: row.days_count,
    rolledFromHoliday: row.rolled_from_holiday,
    ruleTitleAr: rule?.title_ar ?? null,
    ruleVerified: rule?.verified_by_owner === true,
  };
}

/**
 * Keeps the stage's auto deadline in step with it (header: PHASE 5 HOOK).
 * Runs on the caller's own RLS client — every table it touches
 * (deadline_rules, court_holidays, deadlines, notification_outbox) is
 * readable/writable by an authenticated lawyer for their own rows per the
 * Phase 5 migration's RLS. Never throws.
 */
async function syncStatutoryDeadline(params: {
  supabase: SupabaseClient;
  userId: string;
  firmId: string | null;
  caseId: string;
  stage: StageRow;
  outcome: string | null;
  triggerEvent: StageTriggerEvent | null;
  triggerDate: string | null;
  existing: AutoDeadlineRow[];
}): Promise<AutoDeadlineResult> {
  const { supabase, userId, firmId, caseId, stage, outcome, triggerEvent, triggerDate, existing } = params;
  try {
    const { rule, failed } = await loadAutoRule(supabase, stage.degree);
    if (failed) return { created: false, action: "skipped", skipped: "rule_missing" };

    const plan = planStageDeadlineSync({ degree: stage.degree, outcome, triggerDate, ruleId: rule?.id ?? null, existing });
    const now = new Date().toISOString();

    const cancelRows = async (rows: ExistingAutoDeadline[], reason: "outcome_pending" | "no_trigger" | "duplicate") => {
      let cancelled = 0;
      for (const row of rows) {
        const { error } = await supabase
          .from("deadlines")
          .update({ status: "cancelled", metadata: syncCancelledMetadata(row.metadata, reason, now, userId) })
          .eq("id", row.id)
          .eq("status", "open");
        if (error) {
          console.error("[case-stages PATCH] auto-deadline cancel failed:", error.message, error.code);
          continue;
        }
        cancelled++;
        await cancelPendingDeadlineReminders(supabase, row.id);
        await recordActivity({
          supabase,
          kind: RequestEvent.DEADLINE_STATUS_CHANGED,
          ownerUserId: userId,
          firmId,
          actorUserId: userId,
          caseRequestId: caseId,
          subjectTable: "deadlines",
          subjectId: row.id,
          payload: { title: (row as AutoDeadlineRow).title, status: "cancelled", reason, auto: true },
        });
      }
      return cancelled;
    };

    if (plan.kind === "skip") return { created: false, action: "skipped", skipped: plan.reason };

    if (plan.kind === "cancel") {
      const cancelledCount = await cancelRows(plan.deadlines, plan.reason);
      return { created: false, action: "cancelled", skipped: plan.reason, cancelledCount };
    }

    if (plan.kind === "keep") {
      const row = plan.deadline as AutoDeadlineRow;
      return { created: false, action: "kept", deadline: summaryOf(row, rule), deadlineStatus: row.status };
    }

    if (plan.kind === "unchanged") {
      if (plan.duplicates.length) await cancelRows(plan.duplicates, "duplicate");
      return { created: false, action: "unchanged", deadline: summaryOf(plan.deadline as AutoDeadlineRow, rule) };
    }

    // create / recompute both need the rule and a computed date
    if (!rule || !triggerEvent) return { created: false, action: "skipped", skipped: "rule_missing" };
    const computation = await computeForRule(supabase, rule, plan.triggerDate);
    if (!computation) return { created: false, action: "skipped", skipped: "compute_failed" };

    const record: ComputationRecord = {
      engine: STAGE_DEADLINE_ENGINE_VERSION,
      rule_id: rule.id,
      rule_code: DEGREE_TO_AUTO_RULE_CODE[stage.degree] ?? "",
      period_days: rule.period_days,
      count_from_next_day: rule.count_from_next_day,
      roll_forward_if_holiday: rule.roll_forward_if_holiday,
      trigger_event: triggerEvent,
      trigger_date: plan.triggerDate,
      due_date: computation.dueDate,
      rolled_past: computation.rolledPast.map((r) => ({ date: r.date, reason: r.titleAr ?? r.reason })),
      hijri_resolved: computation.hijriResolved,
      computed_at: now,
    };

    if (plan.kind === "recompute") {
      const row = plan.deadline as AutoDeadlineRow;
      const metadata = recomputedMetadata(row.metadata, record, {
        at: now, by: userId, reason: "stage_corrected",
        from: { trigger_date: row.trigger_date, due_date: row.due_date },
        to: { trigger_date: plan.triggerDate, due_date: computation.dueDate },
      });
      const { data: updated, error: updateError } = await supabase
        .from("deadlines")
        .update({
          trigger_date: plan.triggerDate,
          due_date: computation.dueDate,
          due_date_hijri: computation.dueDateHijri,
          days_count: computation.daysCount,
          rolled_from_holiday: computation.rolledFromHoliday,
          rule_id: rule.id,
          metadata,
        })
        .eq("id", row.id)
        .eq("status", "open")
        .select("id, title, due_date, due_date_hijri, days_count, rolled_from_holiday, owner_user_id")
        .maybeSingle();
      if (updateError || !updated) {
        console.error("[case-stages PATCH] auto-deadline recompute failed:", updateError?.message, updateError?.code);
        return { created: false, action: "skipped", skipped: "insert_failed" };
      }
      if (plan.duplicates.length) await cancelRows(plan.duplicates, "duplicate");
      // Re-dated: drop the old schedule, queue the new one (the deadlines
      // PATCH route does the same on a manual re-date).
      await cancelPendingDeadlineReminders(supabase, row.id);
      await enqueueDeadlineReminders({
        supabase,
        deadlineId: row.id,
        recipientUserId: (updated.owner_user_id as string) || userId,
        title: updated.title as string,
        dueDate: updated.due_date as string,
      });
      await recordActivity({
        supabase,
        kind: RequestEvent.DEADLINE_RECOMPUTED,
        ownerUserId: userId,
        firmId,
        actorUserId: userId,
        caseRequestId: caseId,
        subjectTable: "deadlines",
        subjectId: row.id,
        payload: {
          title: updated.title, auto: true,
          fromDueDate: row.due_date, toDueDate: updated.due_date,
          fromTriggerDate: row.trigger_date, toTriggerDate: plan.triggerDate,
          triggerEvent,
        },
      });
      return {
        created: false,
        action: "recomputed",
        deadline: summaryOf(updated as AutoDeadlineRow, rule),
        previous: { dueDate: row.due_date, triggerDate: row.trigger_date },
      };
    }

    // plan.kind === "create"
    const { data: caseRow } = await supabase
      .from("service_requests")
      .select("title")
      .eq("id", caseId)
      .maybeSingle();
    const caseTitle = (caseRow?.title as string | undefined) || null;
    const title = `${rule.title_ar} — ${caseTitle || "قضية"}`;

    const { data: deadline, error: insertError } = await supabase
      .from("deadlines")
      .insert({
        owner_user_id: userId,
        firm_id: firmId,
        case_request_id: caseId,
        stage_id: stage.id,
        rule_id: rule.id,
        title,
        kind: "statutory",
        trigger_date: plan.triggerDate,
        due_date: computation.dueDate,
        due_date_hijri: computation.dueDateHijri,
        days_count: computation.daysCount,
        computed_by_rule: true,
        rolled_from_holiday: computation.rolledFromHoliday,
        priority: "urgent",
        metadata: { computation: record },
      })
      .select("id, title, due_date, due_date_hijri, days_count, rolled_from_holiday")
      .single();
    if (insertError || !deadline) {
      // 23505 = the one-open-auto-deadline-per-stage index (migration
      // 20261030_50) caught a concurrent save that created it first.
      if (insertError?.code === "23505") {
        const { data: winner } = await supabase
          .from("deadlines")
          .select("id, title, due_date, due_date_hijri, days_count, rolled_from_holiday")
          .eq("stage_id", stage.id)
          .eq("computed_by_rule", true)
          .eq("status", "open")
          .limit(1)
          .maybeSingle();
        if (winner) return { created: false, action: "unchanged", deadline: summaryOf(winner as AutoDeadlineRow, rule) };
      }
      console.error("[case-stages PATCH] auto-deadline insert failed:", insertError?.message, insertError?.code);
      return { created: false, action: "skipped", skipped: "insert_failed" };
    }

    // Best-effort activity row — recordActivity already logs+swallows its own
    // insert errors, but the hook's never-throws contract is guarded here too.
    try {
      await recordActivity({
        supabase,
        kind: RequestEvent.DEADLINE_CREATED,
        ownerUserId: userId,
        firmId,
        actorUserId: userId,
        caseRequestId: caseId,
        subjectTable: "deadlines",
        subjectId: deadline.id as string,
        payload: { title, dueDate: deadline.due_date, auto: true, ruleCode: record.rule_code, triggerEvent },
      });
    } catch (activityErr) {
      console.error("[case-stages PATCH] auto-deadline activity record failed:", activityErr);
    }

    await enqueueDeadlineReminders({
      supabase,
      deadlineId: deadline.id as string,
      recipientUserId: userId,
      title,
      dueDate: deadline.due_date as string,
    });

    return { created: true, action: "created", deadline: summaryOf(deadline as AutoDeadlineRow, rule) };
  } catch (err) {
    console.error("[case-stages PATCH] auto-deadline unexpected error:", err);
    return { created: false, action: "skipped", skipped: "insert_failed" };
  }
}

/**
 * PATCH /api/v1/lawyer/case-stages/[caseId]
 * Body: { id, outcome?, closedOn?, notes?, triggerEvent?, triggerDate? } —
 * recording (or correcting) how a degree ended. Degree/court identity is
 * fixed at creation. See `resolveStagePatch` for the rules: a final outcome
 * needs its judgment date; «قيد النظر» drops any closing date / trigger
 * (`droppedForPending: true` in the response says it did).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    // Art. 18: a legal consultant does not plead, so he records no judgment
    // (and so this PATCH's statutory-deadline hook never runs for him).
    const refused = await assertCourtPractice(supabase, user.id);
    if (refused) return refused;
    const { caseId } = await context.params;

    const body = await request.json();
    const { id, outcome, closedOn, notes, triggerEvent, triggerDate } = body as {
      id?: string; outcome?: string; closedOn?: string | null; notes?: string;
      triggerEvent?: string | null; triggerDate?: string | null;
    };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { data: storedRow, error: storedError } = await supabase
      .from("case_stages")
      .select(STAGE_SELECT)
      .eq("id", id)
      .eq("case_request_id", caseId)
      .maybeSingle();
    if (storedError) {
      console.error("[lawyer/case-stages PATCH] stage read failed:", storedError.message, storedError.code);
      return NextResponse.json({ error: storedError.message }, { status: 500 });
    }
    if (!storedRow) return NextResponse.json({ error: "stage not found" }, { status: 404 });
    const stored = storedRow as StageRow;

    // Every auto deadline of this stage, any status — a LIST: duplicates from
    // an old race must not turn a lookup into an error (`.maybeSingle()` did).
    const { data: existingRows, error: existingError } = await supabase
      .from("deadlines")
      .select(AUTO_DEADLINE_SELECT)
      .eq("stage_id", id)
      .eq("computed_by_rule", true);
    if (existingError) {
      console.error("[lawyer/case-stages PATCH] linked deadlines read failed:", existingError.message, existingError.code);
    }
    const existing = (existingRows ?? []) as AutoDeadlineRow[];

    const storedTrigger = readStageTrigger(stored.metadata) ?? inferLegacyTrigger(stored, existing);
    const resolved = resolveStagePatch(
      { outcome: stored.outcome, closed_on: stored.closed_on, metadata: stored.metadata },
      { outcome, closedOn, notes, triggerEvent, triggerDate },
      storedTrigger,
    );
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

    // A legacy stage read as judgment_date gets that written to its metadata
    // here too (resolveStagePatch compares against the stored metadata).
    const patch = { ...resolved.patch } as Record<string, unknown>;
    if (Object.keys(patch).length === 0 && !resolved.affectsDeadline) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    let row = stored;
    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from("case_stages")
        .update(patch)
        .eq("id", id)
        .eq("case_request_id", caseId)
        .select(STAGE_SELECT)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
      }
      row = data as StageRow;
    }

    let autoDeadline: AutoDeadlineResult | null = null;
    if (resolved.affectsDeadline) {
      const { data: membership, error: membershipError } = await supabase
        .from("firm_members")
        .select("firm_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (membershipError) {
        console.error("[lawyer/case-stages PATCH] firm_members lookup failed:", membershipError.message, membershipError.code);
      }
      const firmId = membership?.firm_id ?? null;

      if (outcome !== undefined) {
        await recordActivity({
          supabase,
          kind: RequestEvent.CASE_STAGE_OUTCOME_RECORDED,
          ownerUserId: user.id,
          firmId,
          actorUserId: user.id,
          caseRequestId: caseId,
          subjectTable: "case_stages",
          subjectId: id,
          payload: { outcome, closedOn: row.closed_on, triggerEvent: resolved.final.trigger?.event ?? null },
        });
      }

      if (existingError) {
        // Can't see what is already linked — don't create a second one blind.
        autoDeadline = { created: false, action: "skipped", skipped: "insert_failed" };
      } else {
        autoDeadline = await syncStatutoryDeadline({
          supabase,
          userId: user.id,
          firmId,
          caseId,
          stage: row,
          outcome: resolved.final.outcome,
          triggerEvent: resolved.final.trigger?.event ?? null,
          triggerDate: resolved.final.triggerDate,
          existing,
        });
      }
    }

    return NextResponse.json({ data: toDto(row), autoDeadline, droppedForPending: resolved.droppedForPending });
  } catch (err) {
    console.error("[lawyer/case-stages PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
