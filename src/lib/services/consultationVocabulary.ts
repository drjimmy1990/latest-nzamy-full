/**
 * consultationVocabulary.ts — the ONE vocabulary of a consultation's lifecycle.
 * ─────────────────────────────────────────────────────────
 * Mirrors the CHECK constraints of public.consultations
 * (20260905_phase3_consultations_and_contracts.sql). Pure — no I/O — so the
 * API routes, the screens and node --test all read the same table.
 *
 * Until 2026-09-04 three files each invented their own status set
 * (casesService / lawyer consultations page / client consultations page) and
 * the column had no constraint at all. This module and the CHECK are the
 * same list; a value not here is a 23514, not a new state.
 */

export const CONSULTATION_STATUSES = ["requested", "scheduled", "completed", "cancelled", "no_show"] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export const CONSULTATION_STATUS_AR: Record<ConsultationStatus, string> = {
  requested: "بانتظار الجدولة",
  scheduled: "مجدولة",
  completed: "مكتملة",
  cancelled: "ملغاة",
  no_show:   "لم يحضر",
};

export const CONSULTATION_MODES = ["ai", "video", "voice", "text", "in-person"] as const;
export type ConsultationMode = (typeof CONSULTATION_MODES)[number];

export const CONSULTATION_MODE_AR: Record<ConsultationMode, string> = {
  ai:          "بالذكاء الاصطناعي",
  video:       "مرئية",
  voice:       "صوتية",
  text:        "مكتوبة",
  "in-person": "حضورية",
};

export const CONSULTATION_OUTCOMES = ["advice_given", "opinion_delivered", "converted_to_case", "no_action", "referred"] as const;
export type ConsultationOutcome = (typeof CONSULTATION_OUTCOMES)[number];

export const CONSULTATION_OUTCOME_AR: Record<ConsultationOutcome, string> = {
  advice_given:      "قُدِّمت المشورة",
  opinion_delivered: "سُلِّم رأي مكتوب",
  converted_to_case: "حُوِّلت إلى قضية",
  no_action:         "لا إجراء",
  referred:          "أُحيلت",
};

/**
 * Which status may follow which. `completed` and `cancelled` are terminal;
 * a scheduled consultation may be re-scheduled (scheduled → scheduled).
 */
export const CONSULTATION_TRANSITIONS: Record<ConsultationStatus, readonly ConsultationStatus[]> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["scheduled", "completed", "cancelled", "no_show"],
  no_show:   ["scheduled", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isConsultationStatus(v: unknown): v is ConsultationStatus {
  return typeof v === "string" && (CONSULTATION_STATUSES as readonly string[]).includes(v);
}
export function isConsultationMode(v: unknown): v is ConsultationMode {
  return typeof v === "string" && (CONSULTATION_MODES as readonly string[]).includes(v);
}
export function isConsultationOutcome(v: unknown): v is ConsultationOutcome {
  return typeof v === "string" && (CONSULTATION_OUTCOMES as readonly string[]).includes(v);
}

export function canTransitionConsultation(from: ConsultationStatus, to: ConsultationStatus): boolean {
  return CONSULTATION_TRANSITIONS[from].includes(to);
}

/**
 * Arabic reason a status change must be refused, or null when it is fine.
 * Used by the PATCH route (400 body) and by the screens (disabled buttons).
 */
export function consultationTransitionIssue(
  from: ConsultationStatus,
  to: ConsultationStatus,
  ctx: { scheduledAt?: string | null },
): string | null {
  if (!canTransitionConsultation(from, to)) {
    return `لا يمكن نقل الاستشارة من «${CONSULTATION_STATUS_AR[from]}» إلى «${CONSULTATION_STATUS_AR[to]}»`;
  }
  if (to === "scheduled" && !ctx.scheduledAt) return "حدّد موعد الاستشارة أولاً";
  return null;
}
