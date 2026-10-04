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

export type BusinessProfileScope = "owner" | "member" | "none";

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

/** True when this scope may write the company's row. Owner-only — plan §5 Q2. */
export function canWriteBusinessProfile(scope: BusinessProfileScope): boolean {
  return scope === "owner";
}
