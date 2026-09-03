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
