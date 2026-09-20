import { isSharedClientIntakePath } from "./routeAccess.ts";

export type EntityMembershipKind = "firm" | "business";

export interface EntityMembershipSummary {
  entityId: string;
  entityName: string;
  role: string;
}

export interface ActiveEntityMemberships {
  firm?: EntityMembershipSummary;
  business?: EntityMembershipSummary;
}

/**
 * Returns the membership that can additionally authorize an entity dashboard.
 * Other dashboard prefixes remain governed exclusively by profiles.user_type.
 */
export function entityMembershipKindForPath(pathname: string): EntityMembershipKind | null {
  if (pathname.startsWith("/dashboard/firm")) return "firm";
  if (pathname.startsWith("/dashboard/business")) return "business";
  if (isSharedClientIntakePath(pathname)) return "business";
  return null;
}

/**
 * Browser-side counterpart of the edge gate. Membership is additive: it can
 * open the matching entity dashboard, but never changes the account's stored
 * user_type and never opens any unrelated dashboard.
 */
export function isAllowedByTypeOrMembership(
  userType: string | null,
  allowedTypes: readonly (string | null)[],
  memberships: ActiveEntityMemberships,
): boolean {
  if (userType === "admin") return true;
  if (allowedTypes.includes(userType)) return true;
  if (allowedTypes.includes("firm") && memberships.firm) return true;
  if (allowedTypes.includes("corporate") && memberships.business) return true;
  return false;
}

// ── Merging the four membership reads (WP-6 B-8) ────────────────────────────
//
// THE DEFECT THIS EXISTS TO END. `useUser.readEntityMemberships` ran four
// independent queries in a `Promise.all` and then did:
//
//     if (firmResult.error || businessResult.error ||
//         ownedFirmResult.error || ownedBusinessResult.error) {
//       return { status: "unavailable" };
//     }
//
// One failing query discarded all four answers. That is the 42P17 blast
// radius (UAT-TEAM-001): a recursive `business_members` policy threw, and with
// it went the caller's OWN `business_profiles` row, which had been read
// successfully from a different table with a different policy. The
// consequences on a cold load, where there is no previous session to carry
// forward, were not small:
//   • `/dashboard/business/**` and `/dashboard/firm/**` threw the user out
//     (UserTypeGuard → isAllowedByTypeOrMembership with no membership),
//   • the shared client intake lost its business scope, so a request created
//     in that window silently became a PERSONAL request with no business_id,
//   • and `businessRole` fell back to `undefined`, which the settings policy
//     read as the owner (fail-open — fixed separately in B-9).
//
// The API side already degrades correctly: `resolveActiveEntityIds`
// (src/app/api/v1/service-requests/route.ts) logs each error and nulls ONLY
// the failing query. This mirrors that, and makes the merge itself a pure
// function so every combination is testable without a database.

/** One of the four reads, already mapped to a summary by the caller. */
export interface MembershipCandidate {
  /** What the read produced, or null for "the query succeeded and found no row". */
  summary: EntityMembershipSummary | null;
  /** True when the read itself failed — `summary` is then meaningless and ignored. */
  failed: boolean;
}

export interface MembershipReads {
  /** `firm_members` for an active membership. */
  firmMember: MembershipCandidate;
  /** `firm_profiles` by owner_user_id. */
  ownedFirm: MembershipCandidate;
  /** `business_members` for an active membership. */
  businessMember: MembershipCandidate;
  /** `business_profiles` by owner_user_id. */
  ownedBusiness: MembershipCandidate;
}

export type MembershipMergeResult =
  | {
      status: "found";
      memberships: ActiveEntityMemberships;
      /**
       * True when at least one of the four reads failed, so the memberships
       * below may be an UNDERCOUNT. WP-6 B-9 depends on this: with the reads
       * now evaluated independently, "no role" and "we could not read your
       * role" are again two different facts, and a deny-by-default role
       * predicate must not silently lock out an owner whose
       * `business_profiles` read happened to be the one that failed.
       */
      degraded: boolean;
    }
  | { status: "unavailable" };

function pick(...candidates: MembershipCandidate[]): EntityMembershipSummary | undefined {
  for (const c of candidates) {
    if (!c.failed && c.summary) return c.summary;
  }
  return undefined;
}

/**
 * Combines the four reads into the memberships the session should carry.
 *
 * Per entity, an explicit membership row wins over the owned-profile
 * fallback — an owner who also has a `business_members` row (every owner does
 * since the 20260914 backfill trigger) keeps the role that row states.
 *
 * `unavailable` is returned ONLY when every one of the four reads failed,
 * because that is the only case in which the session has learned nothing at
 * all. Any single success is an answer worth keeping: an owner whose
 * `business_members` read threw still owns their company, and saying otherwise
 * is what locked them out of their own dashboard.
 */
export function mergeMembershipReads(reads: MembershipReads): MembershipMergeResult {
  const { firmMember, ownedFirm, businessMember, ownedBusiness } = reads;

  if (firmMember.failed && ownedFirm.failed && businessMember.failed && ownedBusiness.failed) {
    return { status: "unavailable" };
  }

  const memberships: ActiveEntityMemberships = {};
  const firm = pick(firmMember, ownedFirm);
  if (firm) memberships.firm = firm;
  const business = pick(businessMember, ownedBusiness);
  if (business) memberships.business = business;

  return {
    status: "found",
    memberships,
    degraded: firmMember.failed || ownedFirm.failed || businessMember.failed || ownedBusiness.failed,
  };
}
