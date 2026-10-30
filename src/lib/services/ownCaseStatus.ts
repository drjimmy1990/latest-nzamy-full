/**
 * ownCaseStatus.ts — the status a lawyer's OWN case is born with.
 *
 * LIVE-F14 / LAW-DETAIL-006 (owner live test 2026-10-30): a lawyer adding his
 * own case through «إضافة قضية» got «أُدرجت في القضايا النشطة», but the row
 * read «بانتظار الإسناد» and the «القضايا النشطة» counter stayed at 0. The
 * create route clamped every new request to `pending_assignment` — the state
 * of a CLIENT request waiting for the office to claim it. A lawyer's own case
 * has nobody left to assign it to: it is his from birth.
 *
 * So `assigned` is accepted at creation for exactly that case and nothing
 * else: filed by a lawyer or firm account, to itself (`assigned_to` = the
 * caller, which the route and the N16 database guard already enforce), to the
 * lawyer receiver, and unpaid. Every other caller keeps the old allowlist —
 * a client still cannot birth a request as already taken.
 *
 * Pure — `node --test` loads it.
 */

export const CREATE_STATUS_ALLOWLIST: ReadonlySet<string> = new Set([
  "draft",
  "in_review",
  "pending_payment",
  "pending_assignment",
]);

export function createStatusFor(input: {
  requested: unknown;
  isPaid: boolean;
  selfAssigned: boolean;
  receiver: string | null | undefined;
  actorUserType: string | null | undefined;
}): string {
  if (input.isPaid) return "pending_payment";
  const requested = typeof input.requested === "string" ? input.requested : undefined;
  if (
    requested === "assigned"
    && input.selfAssigned
    && input.receiver === "lawyer"
    && (input.actorUserType === "lawyer" || input.actorUserType === "firm")
  ) {
    return "assigned";
  }
  return requested && CREATE_STATUS_ALLOWLIST.has(requested) ? requested : "pending_assignment";
}
