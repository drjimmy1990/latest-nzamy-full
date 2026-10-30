/**
 * hearingChange.ts — what one PATCH /api/v1/lawyer/hearings/[id] may do to a
 * hearing row (CODE-F18).
 *
 * The diary cards had no edit, postpone, cancel or «انعقدت» at all, and the
 * route had no PATCH. The rules live here, pure, so the route and the card's
 * buttons read ONE table:
 *
 *   action    from                     to          reason
 *   edit      scheduled / held         (unchanged)  optional
 *   postpone  scheduled                scheduled    REQUIRED — the row's own
 *                                                  date/time move; the reminder
 *                                                  scheduler re-plans from them
 *   cancel    scheduled                cancelled    REQUIRED
 *   complete  scheduled                held         optional
 *   reopen    held / cancelled /       scheduled    REQUIRED
 *             adjourned
 *
 * Reminders: nothing to write here. `checkHearingDelivery`
 * (src/lib/hearingReminders.ts) cancels a pending reminder whose hearing is no
 * longer `scheduled` or whose date/time moved, and the queue step re-plans a
 * re-dated row — a session cannot touch hearing outbox rows anyway (RLS,
 * 20261025_30).
 *
 * Every change appends one entry to `metadata.history` (capped) and the route
 * records one activity event (RequestEvent.HEARING_UPDATED /
 * HEARING_STATUS_CHANGED) whose `status` is the activity vocabulary
 * completed / cancelled / postponed / scheduled — not the DB's held / adjourned.
 *
 * Pure: relative `.ts` imports only, so `node --test` loads it.
 */

import {
  type HearingDbStatus, type UiHearingType, type UiUrgency,
  VALID_UI_TYPES, VALID_UI_URGENCIES, typeToKind, urgencyToDb,
} from "./hearingVocabulary.ts";
import { validateHearingDuration } from "./item59Labels.ts";

export type HearingAction = "edit" | "postpone" | "cancel" | "complete" | "reopen";
export const HEARING_ACTIONS: readonly HearingAction[] = ["edit", "postpone", "cancel", "complete", "reopen"];

/** The activity-event status names (src/lib/events.ts HEARING_STATUS_CHANGED). */
export type HearingActivityStatus = "completed" | "cancelled" | "postponed" | "scheduled";

export const HEARING_REASON_MAX = 500;
export const HEARING_HISTORY_CAP = 50;

export const HEARING_ACTION_LABEL_AR: Record<HearingAction, string> = {
  edit: "تعديل",
  postpone: "تأجيل",
  cancel: "إلغاء",
  complete: "انعقدت",
  reopen: "إعادة جدولة",
};

/** Which buttons a row offers, by its stored status. */
export function allowedHearingActions(status: string): HearingAction[] {
  switch (status) {
    case "scheduled": return ["edit", "postpone", "complete", "cancel"];
    case "held": return ["edit", "reopen"];
    case "cancelled":
    case "adjourned": return ["reopen"];
    default: return [];
  }
}

export function actionNeedsReason(action: HearingAction): boolean {
  return action === "postpone" || action === "cancel" || action === "reopen";
}

export function statusAfterAction(action: HearingAction, current: HearingDbStatus): HearingDbStatus {
  switch (action) {
    case "cancel": return "cancelled";
    case "complete": return "held";
    case "postpone":
    case "reopen": return "scheduled";
    default: return current;
  }
}

export function activityStatusFor(action: HearingAction): HearingActivityStatus | null {
  switch (action) {
    case "cancel": return "cancelled";
    case "complete": return "completed";
    case "postpone": return "postponed";
    case "reopen": return "scheduled";
    default: return null;
  }
}

export interface HearingHistoryEntry {
  at: string;
  by: string;
  action: HearingAction;
  reason?: string;
  fromDate?: string;
  toDate?: string;
  fromTime?: string | null;
  toTime?: string | null;
  fromStatus?: string;
  toStatus?: string;
  /** The column names an edit changed — names only, never the old text. */
  fields?: string[];
}

/** `metadata.history` with one entry appended, oldest dropped past the cap. Never mutates `metadata`. */
export function appendHearingHistory(
  metadata: Record<string, unknown> | null | undefined,
  entry: HearingHistoryEntry,
  cap = HEARING_HISTORY_CAP,
): Record<string, unknown> {
  const meta = { ...(metadata ?? {}) };
  const prior = Array.isArray(meta.history) ? (meta.history as unknown[]) : [];
  meta.history = [...prior, entry].slice(-cap);
  return meta;
}

export interface CurrentHearing {
  status: string;
  hearing_date: string;
  hearing_time: string | null;
  case_request_id: string | null;
}

export interface PlannedHearingChange {
  action: HearingAction;
  /** Columns for `.update()` — never `metadata` (the route merges history in), never ownership. */
  update: Record<string, unknown>;
  history: Omit<HearingHistoryEntry, "at" | "by">;
  /** Present only when the body asks to link/unlink a case; the route verifies the case before writing. */
  caseRequestId?: string | null;
  activity: { kind: "updated" | "status_changed"; status: HearingActivityStatus | null; reason?: string };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

type Result = { ok: true; change: PlannedHearingChange } | { ok: false; error: string; status?: number };

/**
 * Validate one PATCH body against the row as stored, and say exactly what to
 * write. `today` is Riyadh's day ("YYYY-MM-DD") — a postponement to a day that
 * has already passed is refused.
 */
export function planHearingChange(body: unknown, current: CurrentHearing, today: string): Result {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = b.action as HearingAction;
  if (!(HEARING_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: "الإجراء غير معروف." };
  }
  if (!allowedHearingActions(current.status).includes(action)) {
    return { ok: false, error: "هذا الإجراء غير متاح لموعد بهذه الحالة.", status: 409 };
  }

  const reasonRaw = typeof b.reason === "string" ? b.reason.trim() : "";
  if (actionNeedsReason(action) && !reasonRaw) {
    return { ok: false, error: "اذكر سبب التغيير — يُحفظ في سجل الموعد." };
  }
  if (reasonRaw.length > HEARING_REASON_MAX) {
    return { ok: false, error: `السبب يجب ألا يتجاوز ${HEARING_REASON_MAX} حرفاً.` };
  }
  const reason = reasonRaw || undefined;
  const fromStatus = current.status;
  const toStatus = statusAfterAction(action, current.status as HearingDbStatus);
  const update: Record<string, unknown> = {};
  const history: PlannedHearingChange["history"] = { action, ...(reason ? { reason } : {}) };

  if (action === "postpone") {
    const date = typeof b.date === "string" ? b.date : "";
    const time = b.time === null || b.time === "" ? null : typeof b.time === "string" ? b.time : undefined;
    if (!DATE_RE.test(date)) return { ok: false, error: "حدِّد التاريخ الجديد للموعد." };
    if (today && date < today) return { ok: false, error: "لا يمكن التأجيل إلى يوم مضى." };
    if (time !== undefined && time !== null && !TIME_RE.test(time)) return { ok: false, error: "الوقت غير صالح." };
    const nextTime = time === undefined ? current.hearing_time : time;
    if (date === current.hearing_date && hhmm(nextTime) === hhmm(current.hearing_time)) {
      return { ok: false, error: "التاريخ والوقت الجديدان مطابقان للحاليين." };
    }
    update.hearing_date = date;
    update.hearing_time = nextTime;
    Object.assign(history, {
      fromDate: current.hearing_date, toDate: date,
      fromTime: hhmm(current.hearing_time), toTime: hhmm(nextTime),
    });
  }

  if (action === "reopen" && current.hearing_date < today) {
    // A reopened row whose day has passed would land straight in «بانتظار
    // تسجيل النتيجة»; ask for the new day instead of reviving a stale one.
    const date = typeof b.date === "string" ? b.date : "";
    if (!DATE_RE.test(date) || date < today) {
      return { ok: false, error: "يوم هذا الموعد مضى — حدِّد تاريخاً جديداً لإعادة جدولته." };
    }
    update.hearing_date = date;
    Object.assign(history, { fromDate: current.hearing_date, toDate: date });
  }

  let caseRequestId: string | null | undefined;
  if (action === "edit") {
    const fields: string[] = [];
    if ("title" in b) {
      const title = typeof b.title === "string" ? b.title.trim() : "";
      if (!title) return { ok: false, error: "عنوان الموعد مطلوب." };
      update.title = title; fields.push("title");
    }
    if ("type" in b) {
      if (!(VALID_UI_TYPES as readonly string[]).includes(String(b.type))) return { ok: false, error: "نوع الموعد غير معروف." };
      update.kind = typeToKind(b.type as UiHearingType); fields.push("type");
    }
    if ("time" in b) {
      const time = b.time === null || b.time === "" ? null : String(b.time);
      if (time !== null && !TIME_RE.test(time)) return { ok: false, error: "الوقت غير صالح." };
      update.hearing_time = time; fields.push("time");
    }
    if ("location" in b) { update.location = typeof b.location === "string" ? b.location.trim() : ""; fields.push("location"); }
    if ("notes" in b) { update.notes = typeof b.notes === "string" ? b.notes.trim() : ""; fields.push("notes"); }
    if ("urgency" in b) {
      if (!(VALID_UI_URGENCIES as readonly string[]).includes(String(b.urgency))) return { ok: false, error: "مستوى الأهمية غير معروف." };
      update.urgency = urgencyToDb(b.urgency as UiUrgency); fields.push("urgency");
    }
    if ("durationMinutes" in b) {
      const d = validateHearingDuration(b.durationMinutes);
      if (!d.ok) return { ok: false, error: d.error };
      update.duration_minutes = d.value; fields.push("durationMinutes");
    }
    if ("caseRequestId" in b) {
      caseRequestId = typeof b.caseRequestId === "string" && b.caseRequestId.trim() ? b.caseRequestId.trim() : null;
      if (caseRequestId !== current.case_request_id) {
        update.case_request_id = caseRequestId; fields.push("caseRequestId");
      }
    }
    if ("date" in b) return { ok: false, error: "تغيير التاريخ يكون بـ«تأجيل» مع ذكر السبب." };
    if (fields.length === 0) return { ok: false, error: "لا يوجد ما يُعدَّل." };
    history.fields = fields;
  } else {
    update.status = toStatus;
    Object.assign(history, { fromStatus, toStatus });
  }

  return {
    ok: true,
    change: {
      action,
      update,
      history,
      ...(caseRequestId !== undefined && "case_request_id" in update ? { caseRequestId } : {}),
      activity: {
        kind: action === "edit" ? "updated" : "status_changed",
        status: activityStatusFor(action),
        ...(reason ? { reason } : {}),
      },
    },
  };
}
