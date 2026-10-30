/**
 * stageDeadlineSync.ts — what recording or correcting a degree's outcome does
 * to the statutory deadline that follows it.
 * ─────────────────────────────────────────────────────────
 * Owner package 2026-10-30, the four P0 findings on this hook:
 *
 *   • LIVE-F15 / CODE-F03 — «قيد النظر» saved with the modal's pre-filled
 *     "today" closed the degree and created a cassation deadline, although no
 *     judgment existed. Now a non-final outcome never closes a degree and
 *     never starts a clock; an auto deadline left open by an earlier final
 *     outcome is cancelled, visibly, with the reason.
 *   • CODE-F03 — the clock was started by `closed_on`, not by the legal
 *     event. The rules themselves say «من اليوم التالي لتسلّم صورة الحكم أو
 *     التبليغ به». The event is now an explicit choice the lawyer makes —
 *     there is no default event and no default date.
 *   • LIVE-F25 / CODE-F04 — correcting the closing date left the deadline on
 *     the old date (`already_exists` returned early). Now a changed trigger
 *     recomputes the linked open deadline, keeps the old values in an audit
 *     history, and the screen shows "from X to Y". A deadline the lawyer has
 *     already closed (done / cancelled / missed) is NOT moved — the response
 *     says so and why.
 *
 * Which event the law counts from (judgment date vs receipt of its copy vs
 * notification) is the owner's legal call (execution queue: REVIEW-LAW). This
 * module only makes the choice explicit, records it, and applies it.
 *
 * Pure: no I/O. The case-stages route reads the rows, asks these functions,
 * and performs what they decide.
 */

/** Degree that just closed → the platform deadline_rules.code for the next window. */
export const DEGREE_TO_AUTO_RULE_CODE: Record<string, string | undefined> = {
  first_instance: "appeal_general",
  appeal: "cassation",
};

export const STAGE_OUTCOMES = ["pending", "won", "lost", "partial", "settled", "withdrawn"] as const;
export type StageOutcome = typeof STAGE_OUTCOMES[number];

/** A judgment exists: the degree can close and a filing window can open. */
export const FINAL_STAGE_OUTCOMES: ReadonlySet<string> = new Set(["won", "lost", "partial", "settled", "withdrawn"]);

export function isFinalOutcome(outcome: string | null | undefined): boolean {
  return !!outcome && FINAL_STAGE_OUTCOMES.has(outcome);
}

/**
 * The event the filing period counts from.
 *   judgment_date — the degree's own closing date (the judgment's date); the
 *                   trigger FOLLOWS `closed_on`, so correcting that date moves
 *                   the deadline (LIVE-F25). Every deadline created before
 *                   2026-10-30 was computed this way.
 *   copy_received — the day the copy of the judgment was received.
 *   notified      — the day the party was notified of the judgment.
 */
export const STAGE_TRIGGER_EVENTS = ["judgment_date", "copy_received", "notified"] as const;
export type StageTriggerEvent = typeof STAGE_TRIGGER_EVENTS[number];

export const TRIGGER_EVENT_LABEL_AR: Record<StageTriggerEvent, string> = {
  judgment_date: "تاريخ صدور الحكم (تاريخ إغلاق الدرجة)",
  copy_received: "تاريخ تسلّم صورة الحكم",
  notified: "تاريخ التبليغ بالحكم",
};

export interface StageTrigger {
  event: StageTriggerEvent;
  /** Own date for copy_received / notified; null for judgment_date (= closed_on). */
  date: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isTriggerEvent(v: unknown): v is StageTriggerEvent {
  return typeof v === "string" && (STAGE_TRIGGER_EVENTS as readonly string[]).includes(v);
}

/** The trigger stored in case_stages.metadata.deadline_trigger, or null. */
export function readStageTrigger(metadata: unknown): StageTrigger | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).deadline_trigger;
  if (!raw || typeof raw !== "object") return null;
  const { event, date } = raw as Record<string, unknown>;
  if (!isTriggerEvent(event)) return null;
  if (event === "judgment_date") return { event, date: null };
  return { event, date: typeof date === "string" && ISO_DAY.test(date) ? date : null };
}

/** The date the clock starts from, or null when it cannot start yet. */
export function effectiveTriggerDate(trigger: StageTrigger | null, closedOn: string | null): string | null {
  if (!trigger) return null;
  if (trigger.event === "judgment_date") return closedOn;
  return trigger.date;
}

/** A deadline row the hook created earlier for this stage (computed_by_rule). */
export interface ExistingAutoDeadline {
  id: string;
  status: string;
  rule_id: string | null;
  trigger_date: string;
  due_date: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

/** Cancelled by this hook itself (not by the lawyer) — never blocks a new one. */
export function cancelledBySync(d: ExistingAutoDeadline): boolean {
  return d.status === "cancelled" && (d.metadata as Record<string, unknown> | null | undefined)?.cancelled_by === "stage_sync";
}

/**
 * Stages recorded before the trigger existed have no `deadline_trigger`; the
 * old hook always counted from `closed_on`. When such a stage has an open
 * auto deadline whose trigger_date is that closing date, the honest reading
 * is "judgment_date" — so correcting the date still moves it (LIVE-F25).
 */
export function inferLegacyTrigger(
  stored: { closed_on: string | null; metadata?: unknown },
  existing: readonly ExistingAutoDeadline[],
): StageTrigger | null {
  if (readStageTrigger(stored.metadata)) return null;
  if (!stored.closed_on) return null;
  const derived = existing.some((d) => d.status === "open" && d.trigger_date === stored.closed_on);
  return derived ? { event: "judgment_date", date: null } : null;
}

export interface StagePatchInput {
  outcome?: string;
  closedOn?: string | null;
  notes?: string;
  /** null clears the trigger. */
  triggerEvent?: string | null;
  triggerDate?: string | null;
}

export interface StoredStage {
  outcome: string | null;
  closed_on: string | null;
  metadata: Record<string, unknown> | null;
}

export type ResolvedStagePatch =
  | {
      ok: true;
      /** Columns to write (only what changes). */
      patch: { outcome?: string; closed_on?: string | null; notes?: string; metadata?: Record<string, unknown> };
      final: { outcome: string | null; closedOn: string | null; trigger: StageTrigger | null; triggerDate: string | null };
      /** The request touched something the deadline depends on. */
      affectsDeadline: boolean;
      /** A closing date / trigger was sent with a non-final outcome and dropped. */
      droppedForPending: boolean;
    }
  | { ok: false; error: string };

/**
 * Validates a PATCH against the stored row and returns what to write. A
 * non-final outcome always leaves the degree open: its closing date and
 * trigger are cleared (an old cached client still sends "today" with «قيد
 * النظر» — that is dropped, not refused, and `droppedForPending` says so).
 */
export function resolveStagePatch(
  stored: StoredStage,
  input: StagePatchInput,
  storedTrigger: StageTrigger | null = readStageTrigger(stored.metadata),
): ResolvedStagePatch {
  if (input.outcome !== undefined && !(STAGE_OUTCOMES as readonly string[]).includes(input.outcome)) {
    return { ok: false, error: `outcome must be one of: ${STAGE_OUTCOMES.join(", ")}` };
  }
  if (input.closedOn && !ISO_DAY.test(input.closedOn)) {
    return { ok: false, error: "closedOn must be YYYY-MM-DD" };
  }
  if (input.triggerDate && !ISO_DAY.test(input.triggerDate)) {
    return { ok: false, error: "triggerDate must be YYYY-MM-DD" };
  }
  if (input.triggerEvent !== undefined && input.triggerEvent !== null && !isTriggerEvent(input.triggerEvent)) {
    return { ok: false, error: `triggerEvent must be one of: ${STAGE_TRIGGER_EVENTS.join(", ")}` };
  }

  const outcome = input.outcome !== undefined ? input.outcome : stored.outcome;
  let closedOn = input.closedOn !== undefined ? (input.closedOn || null) : stored.closed_on;

  let trigger: StageTrigger | null = storedTrigger;
  if (input.triggerEvent !== undefined) {
    if (input.triggerEvent === null) trigger = null;
    else if (input.triggerEvent === "judgment_date") trigger = { event: "judgment_date", date: null };
    else {
      const date = input.triggerDate !== undefined ? (input.triggerDate || null) : (trigger?.event === input.triggerEvent ? trigger.date : null);
      trigger = { event: input.triggerEvent as StageTriggerEvent, date };
    }
  } else if (input.triggerDate !== undefined && trigger && trigger.event !== "judgment_date") {
    trigger = { ...trigger, date: input.triggerDate || null };
  }

  let droppedForPending = false;
  if (!isFinalOutcome(outcome)) {
    droppedForPending = !!closedOn || !!trigger;
    closedOn = null;
    trigger = null;
  } else {
    if (!closedOn) return { ok: false, error: "تاريخ صدور الحكم (إغلاق الدرجة) مطلوب لتسجيل نتيجة نهائية." };
    if (trigger && trigger.event !== "judgment_date") {
      if (!trigger.date) return { ok: false, error: `أدخل ${TRIGGER_EVENT_LABEL_AR[trigger.event]} أو اختر حدثاً آخر.` };
      if (trigger.date < closedOn) return { ok: false, error: `${TRIGGER_EVENT_LABEL_AR[trigger.event]} لا يسبق تاريخ صدور الحكم.` };
    }
  }

  const patch: { outcome?: string; closed_on?: string | null; notes?: string; metadata?: Record<string, unknown> } = {};
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (closedOn !== stored.closed_on) patch.closed_on = closedOn;
  if (input.notes !== undefined) patch.notes = input.notes.trim();

  const before = readStageTrigger(stored.metadata);
  const sameTrigger = (a: StageTrigger | null, b: StageTrigger | null) =>
    (a === null && b === null) || (!!a && !!b && a.event === b.event && a.date === b.date);
  if (!sameTrigger(before, trigger)) {
    const metadata = { ...(stored.metadata ?? {}) };
    if (trigger) metadata.deadline_trigger = { event: trigger.event, date: trigger.date };
    else delete metadata.deadline_trigger;
    patch.metadata = metadata;
  }

  const affectsDeadline =
    input.outcome !== undefined || input.closedOn !== undefined ||
    input.triggerEvent !== undefined || input.triggerDate !== undefined;

  return {
    ok: true,
    patch,
    final: { outcome, closedOn, trigger, triggerDate: effectiveTriggerDate(trigger, closedOn) },
    affectsDeadline,
    droppedForPending,
  };
}

export type SyncSkipReason =
  | "outcome_pending"      // no final judgment → the degree stays open, no clock
  | "no_trigger"           // final outcome, but the lawyer has not chosen the starting event/date
  | "no_rule_for_degree"   // نقض / تنفيذ: nothing follows this degree
  | "rule_missing";        // the platform rule is inactive/absent on this database

export type SyncPlan =
  | { kind: "skip"; reason: SyncSkipReason }
  | { kind: "create"; triggerDate: string }
  | { kind: "unchanged"; deadline: ExistingAutoDeadline; duplicates: ExistingAutoDeadline[] }
  | { kind: "recompute"; deadline: ExistingAutoDeadline; triggerDate: string; duplicates: ExistingAutoDeadline[] }
  | { kind: "keep"; deadline: ExistingAutoDeadline }
  | { kind: "cancel"; deadlines: ExistingAutoDeadline[]; reason: "outcome_pending" | "no_trigger" };

const newestFirst = (a: ExistingAutoDeadline, b: ExistingAutoDeadline) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

/**
 * Decides what to do with the stage's auto deadline. `existing` = every
 * deadline row of this stage with computed_by_rule (any status). Extra open
 * rows (duplicates from an earlier race) are returned for cancelling.
 */
export function planStageDeadlineSync(params: {
  degree: string;
  outcome: string | null;
  triggerDate: string | null;
  ruleId: string | null;
  existing: readonly ExistingAutoDeadline[];
}): SyncPlan {
  const { degree, outcome, triggerDate, ruleId } = params;
  const existing = [...params.existing].sort(newestFirst);
  const open = existing.filter((d) => d.status === "open");

  if (!isFinalOutcome(outcome)) {
    return open.length ? { kind: "cancel", deadlines: open, reason: "outcome_pending" } : { kind: "skip", reason: "outcome_pending" };
  }
  if (!DEGREE_TO_AUTO_RULE_CODE[degree]) return { kind: "skip", reason: "no_rule_for_degree" };
  if (!triggerDate) {
    return open.length ? { kind: "cancel", deadlines: open, reason: "no_trigger" } : { kind: "skip", reason: "no_trigger" };
  }
  if (!ruleId) return { kind: "skip", reason: "rule_missing" };

  if (open.length) {
    const [primary, ...duplicates] = open;
    if (primary.trigger_date === triggerDate && primary.rule_id === ruleId) {
      return { kind: "unchanged", deadline: primary, duplicates };
    }
    return { kind: "recompute", deadline: primary, triggerDate, duplicates };
  }

  const closedByLawyer = existing.find((d) => !cancelledBySync(d));
  if (closedByLawyer) return { kind: "keep", deadline: closedByLawyer };

  return { kind: "create", triggerDate };
}

/** The deadline-engine inputs recorded on every auto deadline (CODE-F04). */
export const STAGE_DEADLINE_ENGINE_VERSION = "deadlineEngine/2026-10-30";

export interface ComputationRecord {
  engine: string;
  rule_id: string;
  rule_code: string;
  period_days: number;
  count_from_next_day: boolean;
  roll_forward_if_holiday: boolean;
  trigger_event: StageTriggerEvent;
  trigger_date: string;
  due_date: string;
  rolled_past: { date: string; reason: string }[];
  hijri_resolved: boolean;
  computed_at: string;
}

export interface RecomputeHistoryEntry {
  at: string;
  by: string;
  reason: "stage_corrected";
  from: { trigger_date: string; due_date: string };
  to: { trigger_date: string; due_date: string };
}

/** metadata for a recomputed deadline: the new inputs + the old ones kept. */
export function recomputedMetadata(
  previous: Record<string, unknown> | null | undefined,
  computation: ComputationRecord,
  history: RecomputeHistoryEntry,
): Record<string, unknown> {
  const base = { ...(previous ?? {}) };
  const past = Array.isArray(base.history) ? (base.history as unknown[]) : [];
  return { ...base, computation, history: [...past, history].slice(-20) };
}

/** metadata for a deadline this hook cancels — marks it as ours. */
export function syncCancelledMetadata(
  previous: Record<string, unknown> | null | undefined,
  reason: "outcome_pending" | "no_trigger" | "duplicate",
  at: string,
  by: string,
): Record<string, unknown> {
  return { ...(previous ?? {}), cancelled_by: "stage_sync", cancel_reason: reason, cancelled_at: at, cancelled_by_user: by };
}
