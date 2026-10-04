/**
 * caseStageBuckets.ts — the arithmetic behind the lawyer cases page's
 * «المرحلة المسجّلة» bar (T28-29a) and the bulk read that feeds it
 * (GET /api/v1/lawyer/case-stages).
 * ─────────────────────────────────────────────────────────
 * Pure: no `@/` imports, no runtime imports at all, so `node --test` loads it
 * directly (caseStageBuckets.test.ts) and both the route and the page share
 * one copy of every rule here.
 *
 * What a bucket means — and what it does NOT:
 *   • «منتهية»          the case's own status is closed/archived, whatever its
 *                       stage rows say;
 *   • «أول درجة» … «تنفيذ»  an open case whose LATEST `case_stages` row is at that
 *                       degree (latest = highest `position`, which the per-case
 *                       POST assigns as max+1);
 *   • «لم تُسجَّل مرحلة»  an open case with no `case_stages` row at all. That is
 *                       a fact about the RECORD, not about the case: it is not
 *                       «تحضير» or «قبل الرفع» — nobody has said so.
 *
 * This is NOT `Case.degree` (src/constants/lawyerCasesData.ts), which is a
 * guess from the free-text court name and drives the filter drawer's «درجة
 * التقاضي». The two can disagree; this one reads what the lawyer recorded.
 */

export type StageBucket = "none" | "first_instance" | "appeal" | "cassation" | "execution" | "finished";

/** Display order: the pipeline left-to-right, «لم تُسجَّل» first, «منتهية» last. */
export const STAGE_BUCKETS: readonly StageBucket[] = [
  "none", "first_instance", "appeal", "cassation", "execution", "finished",
];

export const STAGE_BUCKET_LABELS: Record<StageBucket, string> = {
  none: "لم تُسجَّل مرحلة",
  first_instance: "أول درجة",
  appeal: "استئناف",
  cassation: "نقض",
  execution: "تنفيذ",
  finished: "منتهية",
};

// Both spellings a degree arrives in: the DB enum (case_stages.degree) and the
// Arabic UiDegree the API DTOs carry (caseStageVocabulary.ts).
const DEGREE_TO_BUCKET: Record<string, StageBucket> = {
  first_instance: "first_instance", "ابتدائي": "first_instance",
  appeal: "appeal",                 "استئناف": "appeal",
  cassation: "cassation",           "نقض": "cassation",
  execution: "execution",           "تنفيذ": "execution",
};

const FINISHED_STATUSES = new Set(["closed", "archived"]);

/**
 * The bucket for one case. `latestDegree` is the degree of its latest stage
 * row, or null/undefined when it has none. An unrecognised non-empty degree
 * reads as «أول درجة» — the same fallback direction as degreeFromDb(): never
 * claim a more advanced degree than the row says.
 */
export function stageBucketFor(status: string, latestDegree: string | null | undefined): StageBucket {
  if (FINISHED_STATUSES.has(status)) return "finished";
  if (!latestDegree) return "none";
  return DEGREE_TO_BUCKET[latestDegree] ?? "first_instance";
}

export function emptyBucketCounts(): Record<StageBucket, number> {
  return { none: 0, first_instance: 0, appeal: 0, cassation: 0, execution: 0, finished: 0 };
}

/** Counts per bucket over `cases`; a case missing from the map has no stage row. */
export function countStageBuckets(
  cases: readonly { id: string; status: string }[],
  latestDegreeByCase: Readonly<Record<string, string | null | undefined>>,
): Record<StageBucket, number> {
  const counts = emptyBucketCounts();
  for (const c of cases) counts[stageBucketFor(c.status, latestDegreeByCase[c.id])] += 1;
  return counts;
}

export interface StageBucketShare {
  bucket: StageBucket;
  label: string;
  count: number;
  /** exact share, for the bar segment width */
  width: number;
  /** whole-number percent for the chip; the non-zero ones sum to exactly 100 */
  percent: number;
}

/**
 * Buckets with at least one case, in display order, with their share. Whole
 * percents use the largest-remainder method so three thirds read ٣٣/٣٣/٣٤, not
 * ٣٣/٣٣/٣٣ — a bar whose labels do not add up invites the question of what is
 * missing. Empty when there are no cases at all.
 */
export function stageBucketShares(counts: Readonly<Record<StageBucket, number>>): StageBucketShare[] {
  const total = STAGE_BUCKETS.reduce((sum, b) => sum + (counts[b] ?? 0), 0);
  if (total <= 0) return [];
  const present = STAGE_BUCKETS.filter((b) => (counts[b] ?? 0) > 0);
  const raw = present.map((b) => (counts[b] / total) * 100);
  const floors = raw.map((r) => Math.floor(r));
  let remaining = 100 - floors.reduce((s, f) => s + f, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return present.map((bucket, i) => ({
    bucket,
    label: STAGE_BUCKET_LABELS[bucket],
    count: counts[bucket],
    width: raw[i],
    percent: floors[i],
  }));
}

// ── Bulk read (GET /api/v1/lawyer/case-stages) ─────────────────────────────

/**
 * Most case ids one request may name. The ids travel in the query string and
 * a UUID is 36 characters (38 with the encoded comma): 100 of them is ~3.8KB,
 * well inside nginx's default 8KB request line, which 200 would crowd. The
 * client helper chunks longer lists (caseStagesService.getLatestCaseStages).
 */
export const CASE_STAGES_BULK_MAX_IDS = 100;

const CASE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Parses `?caseIds=a,b,c`. `null` (param absent) → `{ ids: null }`, meaning
 * "every case the caller can read". Blank entries and duplicates are dropped;
 * an id outside the safe character set is dropped too (a real
 * service_requests id is a UUID — anything else cannot match and must not be
 * spliced into a PostgREST `in` list). More than the cap → an Arabic error.
 */
export function parseCaseIdsParam(raw: string | null): { ids: string[] | null } | { error: string } {
  if (raw === null) return { ids: null };
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || !CASE_ID_RE.test(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  if (ids.length > CASE_STAGES_BULK_MAX_IDS) {
    return { error: `يمكن طلب ${CASE_STAGES_BULK_MAX_IDS} قضية كحد أقصى في الطلب الواحد.` };
  }
  return { ids };
}

export interface StageRowLite {
  case_request_id: string;
  position: number | null;
  opened_on: string | null;
  created_at: string | null;
}

/** true when `a` is later than `b`: position, then opened_on, then created_at. */
function isLater(a: StageRowLite, b: StageRowLite): boolean {
  const pa = a.position ?? -1;
  const pb = b.position ?? -1;
  if (pa !== pb) return pa > pb;
  const oa = a.opened_on ?? "";
  const ob = b.opened_on ?? "";
  if (oa !== ob) return oa > ob; // ISO dates compare as strings; null sorts earliest
  return (a.created_at ?? "") > (b.created_at ?? "");
}

/** The latest stage row of each case, whatever order the rows arrive in. */
export function pickLatestStagePerCase<T extends StageRowLite>(rows: readonly T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(row.case_request_id);
    if (!current || isLater(row, current)) latest.set(row.case_request_id, row);
  }
  return latest;
}
