/**
 * firmMemberWorkload.ts — pure aggregation for the firm team's real
 * per-member workload (build task: rebuild `team/[id]` and `team/workload`
 * off Phase 2 `firm_members` data, dropping the fabricated `MOCK_TEAM`).
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
 * `team/[id]/page.tsx` and `team/workload/page.tsx` used to read
 * `MOCK_TEAM` — invented ratings, "cases won", a gamified point system
 * (`TASK_WEIGHTS`) with no backing table, and `utilizationRate` /
 * `deadlineAdherence` percentages nothing measures. None of it came from a
 * query. This module is the ONE place three real, RLS-visible signals become
 * one number per member:
 *
 *   assignedRequests  — public.service_requests.assigned_to = member
 *   openTasks         — public.tasks.owner_user_id = member,
 *                        status NOT IN (done, archived)
 *   upcomingHearings  — public.hearings.owner_user_id = member,
 *                        status = scheduled AND hearing_date >= today
 *
 * "open" / "upcoming" mirror the exact predicates
 * `/api/v1/lawyer/dashboard/summary` already uses for the same two tables
 * (see that route's comments) — this is not a new definition invented here.
 *
 * ── THE `assignedRequests` GAP (read this before trusting the number) ──────
 * `service_requests.firm_id` is stamped, at INSERT time, from the REQUEST'S
 * OWN CREATOR's active `firm_members` row (see
 * `POST /api/v1/service-requests`) — never from the assignee. A client who
 * is not a firm member creates a request with `firm_id = null` even when
 * `assigned_to` names one of this firm's lawyers. The Phase 2 RLS policy
 * that lets a firm colleague read a request at all
 * ("firm members read firm service requests") requires `firm_id is not
 * null`, so that row is invisible to the firm owner however this query is
 * written — `can_access_case_row` is SECURITY DEFINER, but RLS is still the
 * final authority and there is no legal way around it from an RLS-scoped
 * client. `assignedRequests` is therefore real but narrower than its name
 * suggests: it counts firm-scoped assignments, not every request anyone ever
 * assigned to this member. `tasks` and `hearings` have no equivalent gap —
 * `owner_user_id` on both IS the row's creator, so `firm_id` is stamped from
 * that same person's membership and is always consistent with who the row
 * belongs to.
 *
 * Pure: no I/O, no Supabase, no React. `today` is an explicit YYYY-MM-DD
 * string (the caller computes it — the route uses Asia/Riyadh, same as
 * `/api/v1/lawyer/dashboard/summary`'s `saudiToday()`) so this function stays
 * deterministic and testable without mocking the clock.
 */

export interface FirmMemberWorkloadCounts {
  /** `firm_members.id` — what the two screens key rows on. */
  memberId: string;
  /** `firm_members.user_id` — what `owner_user_id` / `assigned_to` hold. */
  userId: string;
  assignedRequests: number;
  openTasks: number;
  upcomingHearings: number;
}

export interface WorkloadMemberInput {
  id: string;
  user_id: string;
}

export interface WorkloadTaskRow {
  owner_user_id: string | null;
  status: string;
}

export interface WorkloadHearingRow {
  owner_user_id: string | null;
  status: string;
  hearing_date: string;
}

export interface WorkloadRequestRow {
  assigned_to: string | null;
}

const CLOSED_TASK_STATUSES = new Set(["done", "archived"]);

/**
 * Buckets firm-scoped task/hearing/request rows by member.
 *
 * Every member in `members` gets an entry, all-zero if nothing matched — a
 * member with no rows is a real zero, not a missing one. A row whose
 * owner/assignee is not one of `members` (e.g. a removed member's leftover
 * row, or a stale id) is silently dropped rather than creating a phantom
 * entry: the two screens only ever render members they already have from
 * `firm_members`.
 */
export function bucketFirmMemberWorkload(
  members: WorkloadMemberInput[],
  rows: {
    tasks: WorkloadTaskRow[];
    hearings: WorkloadHearingRow[];
    requests: WorkloadRequestRow[];
  },
  today: string,
): FirmMemberWorkloadCounts[] {
  const byUser = new Map<string, FirmMemberWorkloadCounts>();
  for (const m of members) {
    byUser.set(m.user_id, {
      memberId: m.id,
      userId: m.user_id,
      assignedRequests: 0,
      openTasks: 0,
      upcomingHearings: 0,
    });
  }

  for (const t of rows.tasks) {
    if (!t.owner_user_id) continue;
    const entry = byUser.get(t.owner_user_id);
    if (!entry) continue;
    if (!CLOSED_TASK_STATUSES.has(t.status)) entry.openTasks += 1;
  }

  for (const h of rows.hearings) {
    if (!h.owner_user_id) continue;
    const entry = byUser.get(h.owner_user_id);
    if (!entry) continue;
    if (h.status === "scheduled" && h.hearing_date >= today) entry.upcomingHearings += 1;
  }

  for (const r of rows.requests) {
    if (!r.assigned_to) continue;
    const entry = byUser.get(r.assigned_to);
    if (!entry) continue;
    entry.assignedRequests += 1;
  }

  return Array.from(byUser.values());
}
