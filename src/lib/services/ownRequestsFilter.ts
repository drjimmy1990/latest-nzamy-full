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
 *   business_id in (his …)    — "business members read business service requests"
 * With `receiver`, every row he filed stays (whatever its receiver — the
 * route's earlier contract), and the other arms are limited to that receiver.
 *
 * Pure (no imports) so it runs under `node --test`. Ids that are not uuids are
 * dropped, and a malformed uid or receiver throws: nothing user-supplied is
 * ever spliced into the filter syntax.
 */

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
