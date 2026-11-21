/**
 * ownRequestsFilter.ts — the PostgREST `or=` filter GET /api/v1/service-requests
 * applies on top of RLS, so a list only ever holds the caller's OWN work.
 *
 * Why RLS alone is not that set: "service_requests_select_policy" also lets a
 * verified lawyer read every unassigned pending request (the marketplace
 * browse arm, any receiver but ai_workspace). Without this filter the lawyer
 * «القضايا» list, CasePicker, the consultations page and the firm cases list
 * received other people's open requests — a client's intake, another
 * lawyer's unassigned case — as if they were his.
 *
 * The arms mirror the remaining SELECT policies exactly:
 *   requester_user_id = uid   — rows he filed
 *   assigned_to = uid         — rows assigned to him
 *   firm_id in (his firms)    — "firm members read firm service requests"
 *                               (narrowed by RLS for a trainee or a legal
 *                               secretary — FIRM_CASE_SCOPED_ROLES below)
 *   business_id in (his …)    — "business members read business service requests"
 * With `receiver`, every row he filed stays (whatever its receiver — the
 * route's earlier contract), and the other arms are limited to that receiver.
 *
 * Pure (no imports) so it runs under `node --test`. Ids that are not uuids are
 * dropped, and a malformed uid or receiver throws: nothing user-supplied is
 * ever spliced into the filter syntax.
 */

/**
 * Owner file 15 row 2 (20261129_10): the firm roles that read only the cases
 * and client cards ASSIGNED to them — public.firm_case_scoped_member. The
 * database decides (a restrictive policy on service_requests, the case child
 * tables through case_visible, lawyer_clients, client notes, contracts and
 * consultations); the list is here so the app and the SQL can be held equal
 * (src/lib/auth/entityRoleScope.test.ts). «Assigned» = the case's filer or
 * lead, its case team, or the assignee of one of its hearings or tasks; a
 * card he owns or one linked to such a case.
 *
 * Q112 (20261202_80): these two are narrowed ALWAYS; the admin setting
 * firm_case_scope adds office_admin / hr_manager / compliance_manager (default
 * all three) and keeps the finance manager out of case files —
 * src/lib/firm/firmCaseScope.ts holds that half.
 */
export const FIRM_CASE_SCOPED_ROLES: readonly string[] = ["trainee", "legal_secretary"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** service_requests.receiver's CHECK (20260518_client_workflow_backend_ready.sql). */
export const SERVICE_REQUEST_RECEIVERS = [
  "lawyer", "firm", "provider", "business_legal", "ngo_admin", "government_reviewer", "ai_workspace",
] as const;

export function isKnownReceiver(value: string): boolean {
  return (SERVICE_REQUEST_RECEIVERS as readonly string[]).includes(value);
}

const uuids = (ids: string[]) => [...new Set(ids.filter((id) => UUID_RE.test(id)))];

export function ownRequestsOrFilter(opts: {
  uid: string;
  receiver?: string | null;
  firmIds: string[];
  businessIds: string[];
}): string {
  const { uid, receiver } = opts;
  if (!UUID_RE.test(uid)) throw new Error("ownRequestsOrFilter: uid is not a uuid");
  if (receiver != null && !isKnownReceiver(receiver)) throw new Error("ownRequestsOrFilter: unknown receiver");

  const others = [`assigned_to.eq.${uid}`];
  const firms = uuids(opts.firmIds);
  const businesses = uuids(opts.businessIds);
  if (firms.length > 0) others.push(`firm_id.in.(${firms.join(",")})`);
  if (businesses.length > 0) others.push(`business_id.in.(${businesses.join(",")})`);

  const own = `requester_user_id.eq.${uid}`;
  if (receiver == null) return [own, ...others].join(",");
  return [own, ...others.map((arm) => `and(receiver.eq.${receiver},${arm})`)].join(",");
}
