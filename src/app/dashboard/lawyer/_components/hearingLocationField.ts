/**
 * hearingLocationField.ts
 * ─────────────────────────────────────────────────────────
 * AddHearingModal used one flat "الموقع" field in step 2 for every hearing
 * type (row 70), even though the four types the owner named don't share one
 * concept of "location": a judicial hearing has a court/circuit, a client
 * meeting has a place, a government review has an authority, and a deadline
 * has neither.
 *
 * `public.hearings` (migration 20260903_phase1_case_tables.sql) DOES carry a
 * dedicated `court_name` column — but `/api/v1/lawyer/hearings` (the only
 * route this modal writes through) never selects or inserts it; only
 * `location` and `notes` round-trip end to end. Adding a court-name input
 * here would collect text that silently never saves — a fake field. So this
 * relabels the ONE column that is actually wired, per type, instead of
 * inventing ones that aren't.
 *
 * `null` means: hide the field entirely for that type. A deadline has no
 * location — asking for one and then saving it invites a courtroom name to
 * sit under a filing deadline everywhere the diary reads it back.
 */

export type HearingUiType = "hearing" | "deadline" | "gov_review" | "client_meet" | "internal";

export interface HearingLocationField {
  label: string;
  placeholder: string;
}

/** Same fallback the modal always showed, for the "أخرى" catch-all and any unrecognised type. */
export const DEFAULT_HEARING_LOCATION_FIELD: HearingLocationField = {
  label: "الموقع",
  placeholder: "مثال: المحكمة التجارية - الرياض",
};

const HEARING_LOCATION_FIELD_BY_TYPE: Record<HearingUiType, HearingLocationField | null> = {
  // جلسة قضائية — location IS the courtroom: court/circuit/session-number
  // columns don't exist end to end (see module comment), so this is the
  // field that actually saves, relabeled to say what it holds.
  hearing: { label: "المحكمة / الدائرة", placeholder: "مثال: المحكمة التجارية بالرياض - الدائرة الثالثة" },
  // اجتماع موكل — a place, not a courtroom. No `attendees` column exists on
  // `hearings` at all, so this stays a single field rather than a fake second one.
  client_meet: { label: "مكان الاجتماع", placeholder: "مثال: مكتب المحامي - الرياض" },
  // مراجعة جهة حكومية — the authority name, in the same `location` column,
  // under a label that says what it is.
  gov_review: { label: "الجهة الحكومية", placeholder: "مثال: كتابة العدل الأولى - الرياض" },
  // موعد طعن / نهائي — a deadline has no location. Hidden, not just empty.
  deadline: null,
  internal: DEFAULT_HEARING_LOCATION_FIELD,
};

/**
 * Returns the label/placeholder to show for the location field for this
 * hearing type, or `null` when the field should not be shown at all.
 * An unrecognised or empty `type` falls back to the generic field — the
 * modal already gates step 2 behind a type being chosen, so this only
 * matters before that gate opens.
 */
export function getHearingLocationField(type: string): HearingLocationField | null {
  if (Object.prototype.hasOwnProperty.call(HEARING_LOCATION_FIELD_BY_TYPE, type)) {
    return HEARING_LOCATION_FIELD_BY_TYPE[type as HearingUiType];
  }
  return DEFAULT_HEARING_LOCATION_FIELD;
}
