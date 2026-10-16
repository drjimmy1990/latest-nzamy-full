/**
 * businessProfileScope.ts — who the caller is with respect to ONE company
 * row, decided from the two reads that can prove it.
 * ─────────────────────────────────────────────────────────
 * WP-6 B-2 / B-3. GET /api/v1/profile used to read `business_profiles` by
 * `.eq("owner_user_id", user.id)` and nothing else. For a corporate MEMBER
 * (a `legal_manager`, an `hr_manager`) that yields `{ data: null, error: null }`
 * — zero rows, not an error — so the route reported «no row», the tab rendered
 * four blank inputs with Save enabled, and the PATCH behind them matched zero
 * rows and came back as a generic 500. Three different facts — «you are not
 * the owner», «the company has saved nothing yet» and «we could not read it»
 * — arrived at the browser as the same thing.
 *
 * This module is the decision, kept pure so it can be tested without a
 * database: the route performs the two reads (RLS client — RLS is the
 * authority for what may be read) and hands the outcomes here.
 *
 * OWNER WINS OVER MEMBER on purpose. An owner also has a `business_members`
 * row with `role: 'owner'` (the backfill trigger
 * `ensure_business_owner_membership`, 20260914), so both reads succeed for
 * them; only the owner scope may write, so the stronger one must be the
 * answer. The same precedence `resolveActiveEntityIds`
 * (src/app/api/v1/service-requests/route.ts) applies in reverse for a
 * different purpose — there any proven id will do, here it decides a
 * permission.
 *
 * READ FAILURES NEVER BECOME "none". `resolveActiveEntityIds` nulls only the
 * failing query and carries on; that is right for attaching a request to a
 * company, and wrong here, because "we could not read it" must not be
 * rendered as "there is nothing there" (the very confusion this module
 * exists to end). `readFailed` is raised whenever the read that WOULD have
 * decided the scope failed, and the route turns it into the envelope's
 * existing `roleProfileReadFailed` marker — which the tab already honours by
 * disabling Save.
 */

/**
 * `"delegate"` (owner decision ٣٦, 20261017_30): an active member the owner
 * registered in `business_delegations` for the company data. It is never what
 * `resolveBusinessProfileScope` returns; `applyDelegation` upgrades a
 * `"member"` to it after the delegation lookup.
 */
export type BusinessProfileScope = "owner" | "delegate" | "member" | "none";

export interface BusinessScopeReads {
  /** `business_profiles.id` where `owner_user_id = caller`, or null for no row. */
  ownedId: string | null;
  /** True when that read errored (the id is then meaningless). */
  ownedFailed: boolean;
  /** `business_members.business_id` for an ACTIVE membership, or null. */
  memberId: string | null;
  /** True when that read errored. */
  memberFailed: boolean;
}

export interface BusinessScopeDecision {
  scope: BusinessProfileScope;
  /** The company row to read/write, or null when there is none to name. */
  businessId: string | null;
  /** True when a read that could have changed the answer failed. */
  readFailed: boolean;
}

export function resolveBusinessProfileScope(reads: BusinessScopeReads): BusinessScopeDecision {
  const { ownedId, ownedFailed, memberId, memberFailed } = reads;

  if (!ownedFailed && ownedId) {
    return { scope: "owner", businessId: ownedId, readFailed: false };
  }

  if (!memberFailed && memberId) {
    // A failed OWNER read still matters even though a membership was proven:
    // the caller may be the owner and would then be told, wrongly, that they
    // may not edit. The scope is the honest floor; the marker says it may be
    // an undercount.
    return { scope: "member", businessId: memberId, readFailed: ownedFailed };
  }

  return {
    scope: "none",
    businessId: null,
    readFailed: ownedFailed || memberFailed,
  };
}

/**
 * What the delegation lookup (`is_business_profile_editor`, 20261017_30)
 * answered for a member:
 *   - "delegate"     a live company_profile delegation;
 *   - "not_delegate" none;
 *   - "unavailable"  the function is not installed yet (the migration has not
 *                    run) — the WP-6 owner-only behaviour, not a failure;
 *   - "failed"       the lookup errored, so the answer is unknown.
 */
export type DelegationLookup = "delegate" | "not_delegate" | "unavailable" | "failed";

/**
 * Upgrade a `"member"` decision with the delegation lookup. Owners and "none"
 * pass through untouched: the lookup is asked only after the owner check
 * fails, so an owner's save never depends on the delegations table.
 *
 * A failed lookup keeps `"member"` (the safe floor) and raises `readFailed`,
 * which the screens already turn into «could not read — Save disabled» rather
 * than «only the owner may edit», which might be false for this person.
 */
export function applyDelegation(
  decision: BusinessScopeDecision,
  lookup: DelegationLookup,
): BusinessScopeDecision {
  if (decision.scope !== "member") return decision;
  if (lookup === "delegate") return { ...decision, scope: "delegate" };
  if (lookup === "failed") return { ...decision, readFailed: true };
  return decision;
}

/**
 * True when this scope may write the company's row: the owner, or a
 * registered delegate — owner decision ٣٦, which replaces the plan §5 Q2
 * owner-only default. RLS enforces the same pair (the owner policy plus
 * "business_profiles: registered delegate can update").
 */
export function canWriteBusinessProfile(scope: BusinessProfileScope): boolean {
  return scope === "owner" || scope === "delegate";
}
