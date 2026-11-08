/**
 * _caseListRules.ts — the decisions behind /dashboard/lawyer/cases, pure so
 * `node --test` runs them (relative imports, `import type` only).
 *
 *   isLawyerCaseRow      which receiver="lawyer" rows are CASES (moved here
 *                        from page.tsx so the add-hearing case picker offers
 *                        exactly the list's cases — CODE-F17);
 *   matchesClientFilter  `?client=<id>` from the client file's «عرض الكل»
 *                        (CODE-F20 / LIVE-F16), by id, never by name;
 *   summarizeOpenDeadlines  a per-case «مهلة» summary from public.deadlines
 *                        (CODE-F25), with «تعذّر التحقق» kept apart from
 *                        «لا توجد مهل».
 */

import type { WorkflowRequest } from "../../../../lib/workflowStore.ts";
import { daysBetween } from "../../../../lib/riyadhDay.ts";

/**
 * Which `receiver: "lawyer"` rows are actually CASES. There is no cases table:
 * tasks (`metadata.task`), CRM clients (`metadata.client`), invoices
 * (`metadata.invoice`) and old service_requests-style hearings (`metadata.hearing`,
 * or the `caseName` + `time` shape AddHearingModal's demo branch writes) share
 * the endpoint. A denylist ON PURPOSE — see the note in page.tsx.
 */
export function isLawyerCaseRow(request: Pick<WorkflowRequest, "type" | "metadata">): boolean {
  if (request.type !== "service") return false;
  const metadata = (request.metadata ?? {}) as Record<string, unknown>;
  if (metadata.task === true) return false;
  if (metadata.client === true) return false;
  if (metadata.invoice === true) return false;
  if (metadata.hearing === true) return false;
  if ("caseName" in metadata && "time" in metadata) return false;
  return true;
}

/** The two raw columns that tie a case row to a client (the GET route spreads the row). */
export interface CaseClientKeys {
  lawyer_client_id?: string | null;
  requester_user_id?: string | null;
}

/**
 * `?client=<id>` — the SAME match the client file's own «القضايا» list makes:
 * the case is filed on that card (`lawyer_client_id`), or was filed by the
 * platform account the card is linked to (`requester_user_id`). A "profile"
 * client (an account with no card yet) is addressed by the account id itself,
 * which the second arm also covers with no card read at all.
 */
export function matchesClientFilter(row: CaseClientKeys, clientId: string, linkedUserId: string | null): boolean {
  if (!clientId) return true;
  if (row.lawyer_client_id && row.lawyer_client_id === clientId) return true;
  if (row.requester_user_id && (row.requester_user_id === clientId || (!!linkedUserId && row.requester_user_id === linkedUserId))) return true;
  return false;
}

export type CaseDeadlineSummary =
  | { state: "unknown" }
  | { state: "none" }
  | { state: "open"; nearestDue: string; count: number };

interface DeadlineLike { caseRequestId: string | null; dueDate: string; status: string }

/**
 * One read of the lawyer's OPEN deadlines (GET /api/v1/lawyer/deadlines?status=open,
 * due_date asc), folded per case.
 *
 *   read failed                         → every case "unknown" («تعذّر التحقق»);
 *   read cut short (server total > rows) → a case with no row in it "unknown":
 *                                         its deadline may be among the later ones;
 *   otherwise                           → "open" (nearest due, count) or "none".
 *
 * The old `hasDeadline` was `Boolean(metadata.deadline)` — a key nothing writes.
 */
export function summarizeOpenDeadlines(
  read: { ok: true; items: DeadlineLike[]; truncated: boolean } | { ok: false } | null,
): (caseId: string) => CaseDeadlineSummary {
  if (!read || !read.ok) return () => ({ state: "unknown" });
  const byCase = new Map<string, { nearestDue: string; count: number }>();
  for (const d of read.items) {
    if (!d.caseRequestId || d.status !== "open") continue;
    const prev = byCase.get(d.caseRequestId);
    if (!prev) byCase.set(d.caseRequestId, { nearestDue: d.dueDate, count: 1 });
    else byCase.set(d.caseRequestId, { nearestDue: d.dueDate < prev.nearestDue ? d.dueDate : prev.nearestDue, count: prev.count + 1 });
  }
  const truncated = read.truncated;
  return (caseId) => {
    const hit = byCase.get(caseId);
    if (hit) return { state: "open", ...hit };
    return truncated ? { state: "unknown" } : { state: "none" };
  };
}

/** How many days ahead counts as «مهلة قريبة» for the banner and the sort. */
export const DEADLINE_SOON_DAYS = 7;

/** An open deadline that is overdue or due within `soonDays` of `today` (Riyadh). "" today → false. */
export function isDeadlineSoon(summary: CaseDeadlineSummary, today: string, soonDays = DEADLINE_SOON_DAYS): boolean {
  if (summary.state !== "open" || !today) return false;
  const n = daysBetween(today, summary.nearestDue);
  return n !== null && n <= soonDays;
}

/** Sort key: open deadlines first by nearest due date, then everything else. */
export function deadlineSortKey(summary: CaseDeadlineSummary): string {
  return summary.state === "open" ? `0${summary.nearestDue}` : "1";
}

// ── Case status moves (BUG-05) ────────────────────────────────────────────
//
// The ONE set of status changes a lawyer may make to a case: the list's board
// (drag between the status columns) and the case page's «تغيير الحالة» both
// read it, so the two can never offer different transitions. Keys are the
// board's status columns; values are the service_requests status written by
// updateWorkflowRequestById. «معلقة» is deliberately absent (see the note in
// page.tsx: no backend status round-trips as "suspended"), and a cancelled
// case is not moved from either place.

export type CaseStatusMove = "active" | "pending" | "closed";

export const CASE_STATUS_MOVES: Readonly<Record<CaseStatusMove, WorkflowRequest["status"]>> = Object.freeze({
  active: "assigned",
  pending: "pending_assignment",
  closed: "completed",
});

/** The board's column labels, reused on the case page. */
export const CASE_STATUS_MOVE_LABEL_AR: Readonly<Record<CaseStatusMove, string>> = Object.freeze({
  active: "نشطة",
  pending: "انتظار",
  closed: "مغلقة",
});

export const CASE_STATUS_MOVE_ORDER: readonly CaseStatusMove[] = Object.freeze(["active", "pending", "closed"]);

export function isCaseStatusMove(value: string): value is CaseStatusMove {
  return value === "active" || value === "pending" || value === "closed";
}

/**
 * Which column a raw service_requests status sits in, or null for a status
 * no move applies to (cancelled). Same buckets as the case page's mapStatus.
 */
export function caseStatusMoveOf(rawStatus: string | null | undefined): CaseStatusMove | null {
  switch (rawStatus) {
    case "assigned":
    case "in_review":
      return "active";
    case "completed":
      return "closed";
    case "cancelled":
      return null;
    default:
      return "pending";
  }
}
