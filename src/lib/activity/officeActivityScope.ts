/**
 * officeActivityScope.ts — which activity_events belong on the «نشاط المكتب»
 * tab (/api/v1/lawyer/activity/office, N3.7).
 *
 * activity_events' INSERT policy (20260903_phase1) checks the actor against
 * the session and nothing about firm_id, so any session can write a row that
 * carries a firm it does not belong to. Testing "firm is one of mine" and
 * "actor is one of my co-members" separately lets such a row through when the
 * reader belongs to two firms: a member of firm A only can plant a row under
 * firm B. The rule is the PAIR: the actor is an active member of the row's own
 * firm.
 *
 * Pure (no imports), so `node --test` loads it directly.
 */

export function membershipKey(firmId: string, userId: string): string {
  return `${firmId}:${userId}`;
}

export function keepFirmMemberEvents<T extends { firm_id: string | null; actor_user_id: string | null }>(
  rows: readonly T[],
  activeMemberships: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (r) => !!r.firm_id && !!r.actor_user_id && activeMemberships.has(membershipKey(r.firm_id, r.actor_user_id)),
  );
}
