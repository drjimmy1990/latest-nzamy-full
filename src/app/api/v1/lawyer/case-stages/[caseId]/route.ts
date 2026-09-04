import { NextResponse, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRole } from "@/lib/auth/assertRole";
import { recordActivity, RequestEvent } from "@/lib/events";
import type { AutoDeadlineResult, AutoDeadlineSummary } from "@/lib/services/caseStagesService";
import {
  type UiDegree, VALID_UI_DEGREES, degreeToDb, degreeFromDb,
} from "@/lib/services/caseStageVocabulary";
import {
  type HolidayKind, type HolidayRule,
  computeDueDate, resolveHolidayDates, parseIsoDate, addDays, isoDate,
} from "@/lib/services/deadlineEngine";

const RIYADH_06 = "T06:00:00+03:00";

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
 * PATCH also auto-creates the next statutory deadline whenever a stage closes
 * with an outcome recorded: `first_instance` → the `appeal_general` platform
 * rule, `appeal` → `cassation` (`cassation`/`execution` have no next filing
 * window here, so nothing is created). It fires whenever the row ends this
 * PATCH with BOTH an outcome and a `closed_on` — whether `closed_on` was set
 * in this same request or was already stored from an earlier one — so
 * setting the outcome first and the date later still gets a deadline. It is
 * skipped silently when no matching platform rule exists, or a `deadlines`
 * row for this `(stage_id, rule_id)` pair already does (idempotent — a PATCH
 * that repeats the same outcome does not double-create). The due date is
 * computed the same way the deadlines POST route will (`deadlineEngine.ts`
 * against `court_holidays`), and the same {7,3,1}+due reminder rows are
 * queued into `notification_outbox` for the cron scheduler
 * (`/api/v1/cron/deadlines`) to deliver. This whole hook is best-effort: any
 * failure in it is logged and swallowed — it must never fail the PATCH that
 * recorded the outcome.
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
  created_at: string;
  updated_at: string;
}

function toDto(row: StageRow) {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STAGE_SELECT =
  "id, case_request_id, degree, court_name, court_case_no, circuit, judge_name, opened_on, closed_on, outcome, position, notes, created_at, updated_at";

/**
 * GET /api/v1/lawyer/case-stages/[caseId]
 * Ordered by `position` then `opened_on` — a stage opened without a date yet
 * (still being filed) still needs a stable place in the list, which
 * `opened_on` alone (nulls first/last either way) can't give it.
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
    return NextResponse.json({ data: rows.map(toDto), total: count ?? rows.length });
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

    return NextResponse.json({ data: toDto(data as StageRow) });
  } catch (err) {
    console.error("[lawyer/case-stages POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Degree that just closed → the platform deadline_rules.code for the next
// filing window. cassation/execution intentionally map to nothing.
const DEGREE_TO_AUTO_RULE_CODE: Record<string, string | undefined> = {
  first_instance: "appeal_general",
  appeal: "cassation",
};

/** "<due_date - offsetDays>T06:00:00+03:00" — Riyadh 06:00, per the reminder contract. offsetDays 0 = the due date itself. Date math goes through deadlineEngine's addDays/isoDate — the ONE place a date is computed (see deadlines/route.ts line 371, the identical pattern). */
function reminderScheduledForIso(dueDateIso: string, offsetDays: number): string | null {
  const due = parseIsoDate(dueDateIso);
  if (!due) return null;
  return `${isoDate(addDays(due, -offsetDays))}${RIYADH_06}`;
}

/**
 * Auto-creates the statutory deadline for the filing window that opens when
 * a stage closes (see the header comment's Phase 5 hook section). Runs on
 * the caller's own RLS client — every table it touches (deadline_rules,
 * court_holidays, deadlines, notification_outbox) is readable/writable by an
 * authenticated lawyer for their own rows per the Phase 5 migration's RLS,
 * so no service-role escalation is needed. Never throws.
 */
async function autoCreateStatutoryDeadline(params: {
  supabase: SupabaseClient;
  userId: string;
  firmId: string | null;
  caseId: string;
  stageId: string;
  degree: string;
  closedOn: string;
}): Promise<AutoDeadlineResult> {
  const { supabase, userId, firmId, caseId, stageId, degree, closedOn } = params;
  try {
    const ruleCode = DEGREE_TO_AUTO_RULE_CODE[degree];
    if (!ruleCode) return { created: false, skipped: "no_rule_for_degree" };

    const { data: rule, error: ruleError } = await supabase
      .from("deadline_rules")
      .select("id, title_ar, period_days, count_from_next_day, roll_forward_if_holiday, verified_by_owner")
      .eq("code", ruleCode)
      .is("owner_user_id", null)
      .eq("active", true)
      .maybeSingle();
    if (ruleError) {
      console.error("[case-stages PATCH] auto-deadline rule lookup failed:", ruleError.message, ruleError.code);
      // Couldn't confirm the rule exists/active — same user-facing bucket as "not found".
      return { created: false, skipped: "rule_missing" };
    }
    if (!rule) return { created: false, skipped: "rule_missing" }; // no platform rule for this code — nothing to auto-create

    const { data: existing, error: existingError } = await supabase
      .from("deadlines")
      .select("id")
      .eq("stage_id", stageId)
      .eq("rule_id", rule.id)
      .maybeSingle();
    if (existingError) {
      console.error("[case-stages PATCH] auto-deadline existing lookup failed:", existingError.message, existingError.code);
      // Couldn't confirm either way — technical failure, not a confirmed duplicate.
      return { created: false, skipped: "insert_failed" };
    }
    if (existing) return { created: false, skipped: "already_exists" }; // already created for this stage+rule — idempotent

    const { data: holidayRows, error: holidayError } = await supabase
      .from("court_holidays")
      .select("id, title_ar, kind, greg_month, greg_day, hijri_month, hijri_day, length_days, start_date, end_date, approximate, active")
      .eq("active", true);
    if (holidayError) {
      console.error("[case-stages PATCH] auto-deadline holidays lookup failed:", holidayError.message, holidayError.code);
      // Can't compute a due date without holiday data.
      return { created: false, skipped: "compute_failed" };
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

    const triggerYear = parseIsoDate(closedOn)?.getFullYear();
    if (!triggerYear) return { created: false, skipped: "compute_failed" }; // closedOn failed to parse — can't compute
    const resolved = resolveHolidayDates(holidayRules, triggerYear, triggerYear + 1);

    const computation = computeDueDate({
      triggerDate: closedOn,
      periodDays: rule.period_days as number,
      countFromNextDay: rule.count_from_next_day as boolean,
      rollForwardIfHoliday: rule.roll_forward_if_holiday as boolean,
      holidays: resolved,
    });
    if (!computation) return { created: false, skipped: "compute_failed" };

    const { data: caseRow } = await supabase
      .from("service_requests")
      .select("title")
      .eq("id", caseId)
      .maybeSingle();
    const caseTitle = (caseRow?.title as string | undefined) || null;
    const title = `${rule.title_ar as string} — ${caseTitle || "قضية"}`;

    const { data: deadline, error: insertError } = await supabase
      .from("deadlines")
      .insert({
        owner_user_id: userId,
        firm_id: firmId,
        case_request_id: caseId,
        stage_id: stageId,
        rule_id: rule.id,
        title,
        kind: "statutory",
        trigger_date: closedOn,
        due_date: computation.dueDate,
        due_date_hijri: computation.dueDateHijri,
        days_count: computation.daysCount,
        computed_by_rule: true,
        rolled_from_holiday: computation.rolledFromHoliday,
        priority: "urgent",
      })
      .select("id, due_date")
      .single();
    if (insertError || !deadline) {
      console.error("[case-stages PATCH] auto-deadline insert failed:", insertError?.message, insertError?.code);
      return { created: false, skipped: "insert_failed" };
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
        payload: { title, dueDate: deadline.due_date, auto: true, ruleCode },
      });
    } catch (activityErr) {
      console.error("[case-stages PATCH] auto-deadline activity record failed:", activityErr);
    }

    const outboxRows = [7, 3, 1, 0].map((offsetDays) => ({
      deadline_id: deadline.id as string,
      recipient_user_id: userId,
      channel: "in_app" as const,
      kind: offsetDays === 0 ? "deadline_due" : `deadline_reminder_${offsetDays}d`,
      scheduled_for: reminderScheduledForIso(deadline.due_date as string, offsetDays),
    })).filter((row): row is typeof row & { scheduled_for: string } => row.scheduled_for !== null);

    if (outboxRows.length > 0) {
      const { error: outboxError } = await supabase.from("notification_outbox").insert(outboxRows);
      if (outboxError && outboxError.code !== "23505") {
        console.error("[case-stages PATCH] auto-deadline outbox insert failed:", outboxError.message, outboxError.code);
      }
    }

    const summary: AutoDeadlineSummary = {
      id: deadline.id as string,
      title,
      dueDate: deadline.due_date as string,
      dueDateHijri: computation.dueDateHijri,
      daysCount: computation.daysCount,
      rolledFromHoliday: computation.rolledFromHoliday,
      ruleTitleAr: rule.title_ar as string,
      ruleVerified: rule.verified_by_owner === true,
    };
    return { created: true, deadline: summary };
  } catch (err) {
    console.error("[case-stages PATCH] auto-deadline unexpected error:", err);
    return { created: false, skipped: "insert_failed" };
  }
}

/**
 * PATCH /api/v1/lawyer/case-stages/[caseId]
 * Body: { id, outcome?, closedOn?, notes? } — recording how a degree ended.
 * Only these three columns are patchable; degree/court identity is fixed at
 * creation (fixing a typo means deleting and re-adding, same as hearings has
 * no correction path today — not built because nothing has asked for it yet).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;

    const body = await request.json();
    const { id, outcome, closedOn, notes } = body as {
      id?: string; outcome?: string; closedOn?: string | null; notes?: string;
    };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const VALID_OUTCOMES = new Set(["pending", "won", "lost", "partial", "settled", "withdrawn"]);
    const patch: Record<string, unknown> = {};
    if (outcome !== undefined) {
      if (!VALID_OUTCOMES.has(outcome)) {
        return NextResponse.json({ error: `outcome must be one of: ${[...VALID_OUTCOMES].join(", ")}` }, { status: 400 });
      }
      patch.outcome = outcome;
    }
    if (closedOn !== undefined) {
      if (closedOn && !/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) {
        return NextResponse.json({ error: "closedOn must be YYYY-MM-DD" }, { status: 400 });
      }
      patch.closed_on = closedOn || null;
    }
    if (notes !== undefined) patch.notes = notes.trim();

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

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

    let autoDeadline: AutoDeadlineResult | null = null;
    if (outcome !== undefined) {
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

      await recordActivity({
        supabase,
        kind: RequestEvent.CASE_STAGE_OUTCOME_RECORDED,
        ownerUserId: user.id,
        firmId: membership?.firm_id ?? null,
        actorUserId: user.id,
        caseRequestId: caseId,
        subjectTable: "case_stages",
        subjectId: id,
        payload: { outcome },
      });

      const stageRow = data as StageRow;
      if (stageRow.closed_on) {
        autoDeadline = await autoCreateStatutoryDeadline({
          supabase,
          userId: user.id,
          firmId: membership?.firm_id ?? null,
          caseId,
          stageId: stageRow.id,
          degree: stageRow.degree,
          closedOn: stageRow.closed_on,
        });
      } else {
        autoDeadline = { created: false, skipped: "no_closed_on" };
      }
    }

    return NextResponse.json({ data: toDto(data as StageRow), autoDeadline });
  } catch (err) {
    console.error("[lawyer/case-stages PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
