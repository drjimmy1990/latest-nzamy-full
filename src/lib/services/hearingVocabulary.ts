/**
 * The ONE place `hearings.kind` / `hearings.urgency` (DB enums,
 * migration 20260903_phase1_case_tables.sql) translate to and from the
 * vocabulary AddHearingModal has always used: `type`
 * (hearing/deadline/gov_review/client_meet/internal) and `urgency`
 * (critical/high/normal).
 *
 * Two callers need this translation — /api/v1/lawyer/hearings and
 * /api/v1/lawyer/dashboard/summary — and duplicating five lines of mapping
 * twice is exactly how the platform ended up with three independent, silently
 * disagreeing implementations of Arabic number agreement earlier this wave.
 * One module, both callers.
 */

export type UiHearingType = "hearing" | "deadline" | "gov_review" | "client_meet" | "internal";
export type UiUrgency = "critical" | "high" | "normal";

export const VALID_UI_TYPES: readonly UiHearingType[] = ["hearing", "deadline", "gov_review", "client_meet", "internal"];
export const VALID_UI_URGENCIES: readonly UiUrgency[] = ["critical", "high", "normal"];

/** UI `type` → DB `kind`. Only "hearing" renames; every other UI type is already a valid `kind` value. */
export function typeToKind(type: UiHearingType): string {
  return type === "hearing" ? "judicial" : type;
}

/** DB `kind` → UI `type`. An unrecognised kind (e.g. "appointment" — nothing writes it yet) falls back to "internal", never to "hearing", which would fabricate a court sitting out of an unknown row. */
export function kindToType(kind: string): UiHearingType {
  if (kind === "judicial") return "hearing";
  return (VALID_UI_TYPES as readonly string[]).includes(kind) ? (kind as UiHearingType) : "internal";
}

const URGENCY_TO_DB: Record<UiUrgency, string> = { critical: "urgent", high: "high", normal: "normal" };
/** DB "low" has no UI counterpart — nothing writes it today, so it reads back as "normal" rather than throwing. */
const URGENCY_FROM_DB: Record<string, UiUrgency> = { urgent: "critical", high: "high", normal: "normal", low: "normal" };

export function urgencyToDb(urgency: UiUrgency): string {
  return URGENCY_TO_DB[urgency];
}

export function urgencyFromDb(dbUrgency: string): UiUrgency {
  return URGENCY_FROM_DB[dbUrgency] ?? "normal";
}

// ── Status (CODE-F18) ───────────────────────────────────────────────────────
// `hearings.status` CHECK: scheduled / held / adjourned / cancelled. The case
// file used to fold every row that was not «scheduled and not past» into
// «منتهية» — a CANCELLED sitting read as one that had been held. One reader of
// the column now, for the diary and the case file alike.

export type HearingDbStatus = "scheduled" | "held" | "adjourned" | "cancelled";
export const HEARING_DB_STATUSES: readonly HearingDbStatus[] = ["scheduled", "held", "adjourned", "cancelled"];

/**
 * What a row IS on screen:
 *   upcoming          scheduled, dated today or later;
 *   awaiting_outcome  scheduled, but its day has passed and nobody recorded
 *                     whether it was held — never silently «منتهية»;
 *   held / adjourned / cancelled — the stored status (adjourned is a legacy
 *                     value: a postponement now moves the row's own date);
 *   unknown           scheduled while today is not known yet (useRiyadhToday
 *                     returns "" until mounted), or a status outside the CHECK.
 */
export type HearingDisplayState = "upcoming" | "awaiting_outcome" | "held" | "adjourned" | "cancelled" | "unknown";

export function hearingDisplayState(status: string, date: string, today: string): HearingDisplayState {
  if (status === "cancelled") return "cancelled";
  if (status === "held") return "held";
  if (status === "adjourned") return "adjourned";
  if (status !== "scheduled" || !today || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "unknown";
  return date >= today ? "upcoming" : "awaiting_outcome";
}

export const HEARING_DISPLAY_LABEL_AR: Record<HearingDisplayState, string> = {
  upcoming: "مجدولة",
  awaiting_outcome: "بانتظار تسجيل النتيجة",
  held: "انعقدت",
  adjourned: "مؤجَّلة",
  cancelled: "ملغاة",
  // A scheduled row before the day is known is still scheduled — that much is true.
  unknown: "مجدولة",
};

/** History, not work: the diary's default view and its counters leave these out. */
export function isClosedHearingStatus(status: string): boolean {
  return status === "held" || status === "cancelled" || status === "adjourned";
}
