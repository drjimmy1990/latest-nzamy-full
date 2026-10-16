/**
 * clientCaseSummary.ts — what a CLIENT (an individual, or a company and its
 * members) may see of a case's litigation: owner decisions ١٥ and ١٩.
 *
 *   ١٥ «يرى العميل تاريخ وموعد الجلسة والنتيجة النهائية، وتُحجب عنه مذكرات
 *       المداولة الداخلية والملاحظات التكتيكية»
 *   ١٩ «يرى عميل الشركة ملخصاً احترافياً: المرحلة الحالية (ابتدائي / استئناف
 *       / تنفيذ)، موعد الجلسة القادمة، ومنطوق الحكم النهائي، مع حجب التفاصيل
 *       الفنية الداخلية لغرفة المداولة»
 *
 * WHERE THE LINE IS ENFORCED
 *   A client cannot read `hearings`, `case_stages`, `case_notes` or
 *   `consultation_notes` through PostgREST at all: their SELECT policies admit
 *   the case's lawyer, the lawyer's firm and admins only (20260903_phase1,
 *   20260910, 20260905). A row policy could not open them to the client
 *   without handing over every column (`notes`, `minutes`, `judge_name`,
 *   `metadata`), and a column grant cannot tell a lawyer from a client — both
 *   are `authenticated`. So the client's view is a FIXED PROJECTION on the
 *   server: the route proves the caller may read the case (RLS on
 *   service_requests), then reads exactly the columns below and nothing else.
 *   The column lists are constants so a test can pin them.
 *
 * Pure: no I/O, no `@/` imports, so `node --test` loads it.
 */
import { degreeFromDb, type UiDegree } from "./services/caseStageVocabulary.ts";
import { pickLatestStagePerCase } from "./caseStageBuckets.ts";

/**
 * Hearing kinds a client is shown. `judicial` is the court hearing the owner
 * named; `client_meet` is an appointment WITH the client, which they already
 * know about. Never `internal`, `deadline` (the team's own planning),
 * `appointment` or `gov_review` (the lawyer's diary).
 */
export const CLIENT_VISIBLE_HEARING_KINDS = ["judicial", "client_meet"] as const;

/** The only `hearings` columns a client's read may name. No title (lawyer free text), notes, minutes or metadata. */
export const CLIENT_HEARING_COLUMNS =
  "id, case_request_id, kind, hearing_date, hearing_time, court_name, location, status";

/** The only `case_stages` columns a client's read may name. No judge, circuit, court case number, notes or metadata. */
export const CLIENT_STAGE_COLUMNS =
  "id, case_request_id, degree, court_name, opened_on, closed_on, outcome, position, created_at";

/** Columns that must never appear in the two lists above (pinned by the test). */
export const CLIENT_FORBIDDEN_COLUMNS = [
  "notes", "minutes", "minutes_at", "metadata", "title", "judge_name", "circuit",
  "court_case_no", "owner_user_id", "firm_id", "urgency",
] as const;

export const HEARING_KIND_CLIENT_LABEL: Record<string, string> = {
  judicial: "جلسة قضائية",
  client_meet: "موعد مع محاميك",
};

export const HEARING_STATUS_CLIENT_LABEL: Record<string, string> = {
  scheduled: "مجدولة",
  held: "عُقدت",
  adjourned: "أُجّلت",
  cancelled: "ملغاة",
};

/** case_stages.outcome, worded from the client's side of the case. */
export const STAGE_OUTCOME_CLIENT_LABEL: Record<string, string> = {
  pending: "قيد النظر",
  won: "صدر الحكم لصالحك",
  lost: "صدر الحكم لغير صالحك",
  partial: "صدر الحكم لصالحك جزئياً",
  settled: "انتهت بالصلح",
  withdrawn: "تُرِكت الدعوى",
};

export interface ClientHearingRow {
  id: string;
  case_request_id: string | null;
  kind: string;
  hearing_date: string;
  hearing_time: string | null;
  court_name: string | null;
  location: string | null;
  status: string;
}

export interface ClientStageRow {
  id: string;
  case_request_id: string;
  degree: string;
  court_name: string | null;
  opened_on: string | null;
  closed_on: string | null;
  outcome: string | null;
  position: number | null;
  created_at: string | null;
}

export interface ClientHearing {
  id: string;
  caseId: string | null;
  kindLabel: string;
  /** YYYY-MM-DD, a Riyadh wall-clock date. */
  date: string;
  /** HH:MM, or null when the lawyer recorded no time. */
  time: string | null;
  place: string | null;
  status: string;
  statusLabel: string;
}

export interface ClientStage {
  id: string;
  degree: UiDegree;
  courtName: string | null;
  openedOn: string | null;
  closedOn: string | null;
  outcome: string | null;
  outcomeLabel: string | null;
}

export interface ClientCaseSummary {
  /** The latest degree the lawyer recorded, or null when none is recorded yet. */
  currentStage: ClientStage | null;
  /** The earliest scheduled client-visible hearing on or after today (Riyadh). */
  nextHearing: ClientHearing | null;
  /**
   * The ruling that ended the latest recorded degree — null while that degree
   * is still pending. The OUTCOME and its date: the platform stores no
   * operative text of the judgment (no column for it), so none is shown.
   */
  finalRuling: ClientStage | null;
  hearings: ClientHearing[];
  /** Every recorded degree, oldest first. */
  stages: ClientStage[];
}

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

export function toClientHearing(row: ClientHearingRow): ClientHearing {
  return {
    id: row.id,
    caseId: row.case_request_id,
    kindLabel: HEARING_KIND_CLIENT_LABEL[row.kind] ?? "موعد",
    date: row.hearing_date,
    time: row.hearing_time ? row.hearing_time.slice(0, 5) : null,
    place: clean(row.court_name) ?? clean(row.location),
    status: row.status,
    statusLabel: HEARING_STATUS_CLIENT_LABEL[row.status] ?? row.status,
  };
}

export function toClientStage(row: ClientStageRow): ClientStage {
  return {
    id: row.id,
    degree: degreeFromDb(row.degree),
    courtName: clean(row.court_name),
    openedOn: row.opened_on,
    closedOn: row.closed_on,
    outcome: row.outcome,
    outcomeLabel: row.outcome ? STAGE_OUTCOME_CLIENT_LABEL[row.outcome] ?? null : null,
  };
}

function hearingOrder(a: ClientHearing, b: ClientHearing): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // A hearing with no recorded time sorts after the timed ones of the same day.
  if (a.time === b.time) return 0;
  if (a.time === null) return 1;
  if (b.time === null) return -1;
  return a.time < b.time ? -1 : 1;
}

/**
 * `todayRiyadh` is YYYY-MM-DD (riyadhToday()). Hearing dates are wall-clock
 * Riyadh dates, so both sides are compared as strings — a `new Date(date) >=
 * now` test drops today's hearing for most of the day.
 */
export function pickNextHearing(hearings: readonly ClientHearing[], todayRiyadh: string): ClientHearing | null {
  const upcoming = hearings
    .filter((h) => h.status === "scheduled" && h.date >= todayRiyadh)
    .sort(hearingOrder);
  return upcoming[0] ?? null;
}

export function buildClientCaseSummary(
  hearingRows: readonly ClientHearingRow[],
  stageRows: readonly ClientStageRow[],
  todayRiyadh: string,
): ClientCaseSummary {
  const visible = hearingRows.filter((r) =>
    (CLIENT_VISIBLE_HEARING_KINDS as readonly string[]).includes(r.kind),
  );
  const hearings = visible.map(toClientHearing).sort(hearingOrder);

  const latestRow = stageRows.length > 0
    ? [...pickLatestStagePerCase(stageRows).values()][0] ?? null
    : null;
  const currentStage = latestRow ? toClientStage(latestRow) : null;
  const finalRuling =
    currentStage && currentStage.outcome && currentStage.outcome !== "pending" ? currentStage : null;

  const stages = [...stageRows]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.opened_on ?? "").localeCompare(b.opened_on ?? ""))
    .map(toClientStage);

  return {
    currentStage,
    nextHearing: pickNextHearing(hearings, todayRiyadh),
    finalRuling,
    hearings,
    stages,
  };
}
