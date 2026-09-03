/**
 * The ONE place `case_stages.degree` (DB enum, migration
 * 20260903_phase1_case_tables.sql) translates to and from the Arabic a
 * lawyer actually picks — same reasoning as hearingVocabulary.ts: shared by
 * the API route and, if a second reader ever needs it, that reader too,
 * instead of two hand-typed copies drifting apart.
 */

export type UiDegree = "ابتدائي" | "استئناف" | "نقض" | "تنفيذ";

export const VALID_UI_DEGREES: readonly UiDegree[] = ["ابتدائي", "استئناف", "نقض", "تنفيذ"];

const DEGREE_TO_DB: Record<UiDegree, string> = {
  "ابتدائي": "first_instance",
  "استئناف": "appeal",
  "نقض": "cassation",
  "تنفيذ": "execution",
};

const DEGREE_FROM_DB: Record<string, UiDegree> = {
  first_instance: "ابتدائي",
  appeal: "استئناف",
  cassation: "نقض",
  execution: "تنفيذ",
};

export function degreeToDb(degree: UiDegree): string {
  return DEGREE_TO_DB[degree];
}

/** An unrecognised DB value reads back as "ابتدائي" rather than throwing — the same fallback direction as an unrecognised hearing kind falling back to "internal": never invent a degree that sounds more advanced than the row actually says. */
export function degreeFromDb(dbDegree: string): UiDegree {
  return DEGREE_FROM_DB[dbDegree] ?? "ابتدائي";
}
