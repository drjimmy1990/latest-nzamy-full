/**
 * contractCaseLink — «ربط بقضية قائمة» (owner package 13-Nov, N01-6/N01-7).
 *
 * `contracts.request_id` (a service_requests id) links a contract to one of
 * the caller's cases. The routes (POST /api/v1/lawyer/contracts and PATCH
 * …/[id]) read the body value through `parseRequestIdInput`, look the case
 * up with the caller's RLS client restricted to the caller's OWN cases
 * (`caseRelationshipFilter` — RLS alone is not enough: the service_requests
 * SELECT policy also shows unassigned marketplace requests to every verified
 * lawyer, see lawyer/clients/_link.ts), and refuse a case that belongs to a
 * different client card than the one on the contract (`caseLinkIssue`).
 *
 * Pure — `node --test` loads it (contractCaseLink.test.ts).
 */

export type RequestIdInput =
  /** The key was not in the body: leave the link as it is. */
  | { kind: "absent" }
  /** null / "" — remove the link. */
  | { kind: "clear" }
  | { kind: "set"; requestId: string }
  | { kind: "invalid" };

/** service_requests ids are text (e.g. `NZ-…`, uuids); anything else is refused. */
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseRequestIdInput(value: unknown): RequestIdInput {
  if (value === undefined) return { kind: "absent" };
  if (value === null) return { kind: "clear" };
  if (typeof value !== "string") return { kind: "invalid" };
  const trimmed = value.trim();
  if (!trimmed) return { kind: "clear" };
  return REQUEST_ID_RE.test(trimmed) ? { kind: "set", requestId: trimmed } : { kind: "invalid" };
}

/**
 * The PostgREST `or=` filter for "a case of mine": assigned to the caller, or
 * filed under the caller's active firm. Same relationship _link.ts uses.
 */
export function caseRelationshipFilter(userId: string, firmId: string | null): string {
  return firmId ? `assigned_to.eq.${userId},firm_id.eq.${firmId}` : `assigned_to.eq.${userId}`;
}

/** The case's client card must match the contract's, when both have one. */
export function caseLinkIssue(
  caseRow: { lawyer_client_id: string | null } | null,
  contractLawyerClientId: string | null,
): string | null {
  if (!caseRow) return "القضية غير موجودة أو ليست من قضاياك.";
  if (caseRow.lawyer_client_id && contractLawyerClientId && caseRow.lawyer_client_id !== contractLawyerClientId) {
    return "القضية المختارة لا تخص موكّل هذا العقد.";
  }
  return null;
}
