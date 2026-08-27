/**
 * lawyerDashboardService.ts
 * ─────────────────────────────────────────────────────────
 * Client wrapper for GET /api/v1/lawyer/dashboard/summary.
 *
 * Audit 2026-08-27 — this file used to end with:
 *
 *     try { return await apiGet(...) } catch { return { ...DEMO_SUMMARY } }
 *
 * where DEMO_SUMMARY was every count at 0 and every list empty. `apiGet` throws
 * on any non-2xx (src/lib/services/api.ts), so an expired session, a 403, a
 * dropped connection and a 500 all arrived at the dashboard as a complete,
 * confident, empty practice. Six practising lawyers read that screen for their
 * hearings. A failure must never be able to render as «لا توجد جلسات قادمة».
 *
 * So the result is a discriminated union now: the caller cannot read a number
 * off it without first deciding what to do about failure. Inside the summary,
 * an individual field is `null` when the server could read the others but not
 * that one — again never 0, because 0 is a legitimate answer this platform
 * gives all the time and would be indistinguishable.
 */

"use client";

// Relative, with the explicit `.ts` extension, so `node --test` can load this
// module: the test runner does no tsconfig path resolution, and `@/lib/...`
// would make every branch below unreachable from a test. `api.ts` itself pulls
// in nothing but `fetch` and two module-level constants, so importing it costs
// this module nothing. Same pattern as intakeGuard.ts and routeAccess.ts.
import { apiGet, isSupabaseMode } from "./api.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawyerDashboardCase {
  id: string;
  title: string;
  status: string;
  updated_at: string | null;
  type: string | null;
}

export interface LawyerDashboardHearing {
  id: string;
  /** `YYYY-MM-DD` wall-clock date, as the lawyer typed it. */
  date: string;
  title: string;
  time: string | null;
  /** Raw metadata token: hearing / deadline / gov_review / client_meet / internal. */
  type: string | null;
  urgency: string | null;
  location: string | null;
  caseName: string | null;
}

export interface LawyerDashboardTask {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string | null;
  category: string | null;
}

export interface LawyerDashboardActivity {
  id: string | number;
  event: string;
  created_at: string;
  request_id?: string;
}

/**
 * Every field is nullable on purpose: `null` means "the server could not read
 * this", which the dashboard must render as «تعذّر القراءة» and never as ٠.
 */
export interface LawyerDashboardSummary {
  activeCases: number | null;
  pendingConsultations: number | null;
  revenueThisMonth: number | null;
  recentCases: LawyerDashboardCase[] | null;
  upcomingHearings: LawyerDashboardHearing[] | null;
  /** Total upcoming hearings — NOT `upcomingHearings.length`, which is capped. */
  upcomingHearingsCount: number | null;
  criticalDeadlines: LawyerDashboardHearing[] | null;
  /** Total critical dates — the card shows at most four, so it needs this. */
  criticalDeadlinesCount: number | null;
  urgentTasks: LawyerDashboardTask[] | null;
  recentActivity: LawyerDashboardActivity[] | null;
  /** Section keys the server failed to read; empty when everything loaded. */
  degraded: string[];
}

export type LawyerDashboardResult =
  | { ok: true; summary: LawyerDashboardSummary }
  | { ok: false; reason: string };

// ─── Reading the body ─────────────────────────────────────────────────────────

/**
 * Why this exists SEPARATELY from the fetch below.
 *
 * `apiGet` ends in `response.json() as Promise<T>` (src/lib/services/api.ts:41).
 * That is a cast, not a conversion, and it is the same cast the client landing
 * page was crashing on until clientDashboardCards.ts replaced it. Here it is
 * quieter and worse: any 200 whose body is not this summary — a proxy's error
 * page, a future route change, an auth gateway answering with JSON of its own —
 * used to arrive as `{ ok: true, summary }`, and the page then set
 * `dashboardData` to it with `loadError` cleared.
 *
 * It arrives in two shapes, and they fail differently — worth stating exactly,
 * because a WHY that overstates its own case is the next thing somebody
 * dismisses. Both are in src/app/dashboard/lawyer/page.tsx:
 *
 *   `200 null`  → `dashboardData` is null, so `failedSections` is `[]` and
 *                 `anyReadFailed` is FALSE: no banner, and every CARD falls to
 *                 its ordinary empty state — «لا توجد جلسات قادمة» over a
 *                 failure. The KPI grid alone stayed honest here, because the
 *                 `stats` memo returns `[]` for a null summary and the empty
 *                 grid renders «تعذّرت قراءة الإحصائيات» (page.tsx:895).
 *   `200 {}`    → truthy, so the memo builds all four tiles and page.tsx:378's
 *                 `=== null` test misses `undefined`. `String(undefined)` put
 *                 the literal text "undefined" in a lawyer's revenue tile.
 *
 * Either way the union's promise — that a caller cannot read a number off this
 * without first deciding what to do about failure — did not hold.
 *
 * So the body is converted, not cast. Pure — no fetch, no window — so all three
 * outcomes are reachable from `node --test`.
 */

/**
 * The section names the ROUTE puts in `degraded` and the PAGE tests with
 * `failedSections.includes(...)`. They are not the field names, and getting
 * that wrong is silent in the worst way: the list would come back null, the
 * card would fall to «لا توجد قضايا نشطة», and nothing would ever say the read
 * had failed.
 *
 * Two lists share the key "hearings" because the route reads them from one
 * query and degrades them together.
 */
const SECTION_OF_LIST = {
  recentCases: "cases",
  upcomingHearings: "hearings",
  criticalDeadlines: "hearings",
  urgentTasks: "tasks",
  recentActivity: "recentActivity",
} as const;

type ListField = keyof typeof SECTION_OF_LIST;

/** Every key the route sends. A body carrying none of them is not a summary. */
const SUMMARY_KEYS: readonly string[] = [
  "activeCases",
  "pendingConsultations",
  "revenueThisMonth",
  "recentCases",
  "upcomingHearings",
  "upcomingHearingsCount",
  "criticalDeadlines",
  "criticalDeadlinesCount",
  "urgentTasks",
  "recentActivity",
  "degraded",
];

/** Distinct from the network wording on purpose — the two are different calls
 *  to make in a support conversation: one is "we could not reach it", this one
 *  is "it answered, and the answer was not a dashboard". */
const MALFORMED_REASON = "تعذّرت قراءة رد الخادم — لم يصل ملخّص لوحة التحكم.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

/**
 * A finite number, or null. NOT `Number(value) || 0`: every tile on this
 * dashboard renders «تعذّرت القراءة» for null and a numeral for anything else
 * (page.tsx:378-386), so a coerced 0 would be indistinguishable from the real
 * zero this platform legitimately answers all the time.
 */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** An array, or null — never `[]`, which the page would render as "you have none". */
function list<T>(value: unknown): T[] | null {
  return Array.isArray(value) ? (value as T[]) : null;
}

/**
 * Map one body onto the union.
 *
 * WHAT IT REFUSES: a body that is not a record, and a record carrying none of
 * the summary's keys. Both mean the response was something other than this
 * endpoint's answer.
 *
 * WHAT IT DOES NOT REFUSE: a body missing SOME sections. That is the route's
 * own partial-failure shape (`null` + a key in `degraded`), and rejecting it
 * would turn a dashboard that could show five of its six cards into a total
 * failure — the opposite of what the `degraded` mechanism is for.
 */
export function toLawyerDashboardResult(body: unknown): LawyerDashboardResult {
  if (!isRecord(body)) return { ok: false, reason: MALFORMED_REASON };
  if (!SUMMARY_KEYS.some((key) => has(body, key))) {
    return { ok: false, reason: MALFORMED_REASON };
  }

  // Whatever the server already admitted to, keeping its order, dropping
  // anything that is not a usable key. A Set because the derived keys below can
  // repeat one, and because "hearings" is derivable from two fields.
  const degraded = new Set<string>();
  if (Array.isArray(body.degraded)) {
    for (const key of body.degraded) {
      if (typeof key === "string" && key.trim()) degraded.add(key);
    }
  }

  const lists = {} as { [K in ListField]: unknown[] | null };
  for (const field of Object.keys(SECTION_OF_LIST) as ListField[]) {
    const value = list(body[field]);
    lists[field] = value;
    // THE INVARIANT: an unreadable list and its section key travel together.
    // The route already sends both, so this fires only when the two disagree —
    // and a null list whose key is missing from `degraded` is exactly the
    // «لا توجد جلسات قادمة»-over-a-failure defect, just arriving from one layer
    // further out.
    if (value === null) degraded.add(SECTION_OF_LIST[field]);
  }

  return {
    ok: true,
    summary: {
      // A whitelist, not `{ ...body }`: the same discipline the route applies
      // when it builds `recentCases`. A key added upstream cannot reach this
      // dashboard by accident, and cannot arrive untyped.
      //
      // A null COUNT deliberately does not add its section key. The route sets
      // both together, and deriving one from the other here would let a body
      // with an unreadable count blank out a list that was read perfectly well.
      // The tiles carry their own «تعذّرت القراءة» marker for exactly this.
      activeCases: num(body.activeCases),
      pendingConsultations: num(body.pendingConsultations),
      revenueThisMonth: num(body.revenueThisMonth),
      recentCases: lists.recentCases as LawyerDashboardCase[] | null,
      upcomingHearings: lists.upcomingHearings as LawyerDashboardHearing[] | null,
      upcomingHearingsCount: num(body.upcomingHearingsCount),
      criticalDeadlines: lists.criticalDeadlines as LawyerDashboardHearing[] | null,
      criticalDeadlinesCount: num(body.criticalDeadlinesCount),
      urgentTasks: lists.urgentTasks as LawyerDashboardTask[] | null,
      recentActivity: lists.recentActivity as LawyerDashboardActivity[] | null,
      degraded: [...degraded],
    },
  };
}

// ─── Service function ─────────────────────────────────────────────────────────

export async function getLawyerDashboardSummary(): Promise<LawyerDashboardResult> {
  if (!isSupabaseMode) {
    // `isSupabaseMode` is a module-level constant (api.ts), so this branch is
    // dead-code-eliminated from the production build — it exists only for local
    // demo runs. It reports failure rather than zeros for the same reason as
    // above: there is no backend to have answered, so there is nothing true to
    // say about this lawyer's caseload.
    return { ok: false, reason: "الوضع التجريبي: لا يوجد اتصال بالخادم لعرض بيانات لوحة التحكم." };
  }

  try {
    // `unknown`, not `<LawyerDashboardSummary>`: asking apiGet for the type is
    // how the unchecked cast got here in the first place.
    const body = await apiGet<unknown>("/api/v1/lawyer/dashboard/summary");
    return toLawyerDashboardResult(body);
  } catch (err) {
    console.error("[lawyerDashboardService] summary fetch failed:", err);
    return {
      ok: false,
      reason:
        err instanceof Error && err.message
          ? err.message
          : "تعذّر الاتصال بالخادم.",
    };
  }
}
