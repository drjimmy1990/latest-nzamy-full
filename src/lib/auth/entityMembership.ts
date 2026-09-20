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
