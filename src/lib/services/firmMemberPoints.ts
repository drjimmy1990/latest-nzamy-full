/**
 * firmMemberPoints.ts — owner answer ٤٤٤ part 2: the per-member points
 * counter on /dashboard/firm/finance.
 *
 * The numbers come from public.firm_member_points_usage (20261108_30), which
 * aggregates points_ledger in SQL (usage net of usage_refund, active members
 * only, since each member joined, Riyadh month) and refuses anyone who is not
 * the firm owner or an active managing partner. This module holds the pure
 * half the route and the card share: who may ask, how an RPC error reads, and
 * the row → DTO mapping. Totals only — no tool, no run, no e-mail.
 *
 * Pure: no imports, so `node --test` loads it.
 */

/** Who may see the counter: the firm owner, or an active managing partner. */
export function canViewMemberPoints(firm: { isOwner: boolean; role: string } | null): boolean {
  if (!firm) return false;
  return firm.isOwner || firm.role === "managing_partner";
}

export type MemberPointsRpcOutcome = "ok" | "unavailable" | "forbidden" | "failed";

/**
 * 42883 / PGRST202: the function is not there yet (20261108_30 not applied) —
 * the card says «not available yet», never «0».
 * 42501: the function's own owner / managing-partner check refused.
 */
export function memberPointsRpcOutcome(error: { code?: string | null } | null | undefined): MemberPointsRpcOutcome {
  if (!error) return "ok";
  const code = error.code ?? "";
  if (code === "42883" || code === "PGRST202") return "unavailable";
  if (code === "42501") return "forbidden";
  return "failed";
}

export interface MemberPointsUsage {
  displayName: string;
  role: string;
  isOwner: boolean;
  joinedAt: string | null;
  pointsMonth: number;
  pointsTotal: number;
}

function toInt(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Maps the RPC rows to the response DTO. `user_id` is read and dropped. */
export function toMemberPointsUsage(rows: unknown): MemberPointsUsage[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      displayName: typeof r.display_name === "string" && r.display_name.trim() ? r.display_name.trim() : "—",
      role: typeof r.role === "string" ? r.role : "",
      isOwner: r.is_owner === true,
      joinedAt: typeof r.joined_at === "string" ? r.joined_at : null,
      pointsMonth: toInt(r.points_month),
      pointsTotal: toInt(r.points_total),
    }));
}

/** The card's footer line: the firm-wide sums of the two columns. */
export function sumMemberPoints(members: readonly MemberPointsUsage[]): { month: number; total: number } {
  return members.reduce(
    (acc, m) => ({ month: acc.month + m.pointsMonth, total: acc.total + m.pointsTotal }),
    { month: 0, total: 0 },
  );
}
