/**
 * audienceForUserType.ts — which /pricing audience tab (package family) an
 * account type buys from.
 *
 * Owner request (2026-10-24): a signed-in member sees only the plans of their
 * own account type — on /pricing and in Settings → «الاشتراك والباقة». Both
 * screens read the one map below, so they cannot disagree.
 *
 * Pure: no `@/` imports and no runtime imports, so `node --test` loads it
 * (audienceForUserType.test.ts, pricingHonesty.test.ts).
 */
import type { AudienceTab } from "../../constants/pricing/pricing.types.ts";
import type { UserType } from "../../types/database.ts";

/** Account type → its own pricing tab. `admin` has none on purpose. */
export const USER_TYPE_TO_AUDIENCE: Partial<Record<UserType, AudienceTab>> = {
  lawyer:     "lawyers",
  firm:       "firms",
  individual: "individuals",
  corporate:  "companies",
  micro:      "micro",
  government: "government",
  ngo:        "ngo",
  provider:   "providers",
};

/** The account type's own tab, or null when it has none (admin, no profile). */
export function audienceForUserType(userType: UserType | null | undefined): AudienceTab | null {
  return (userType && USER_TYPE_TO_AUDIENCE[userType]) || null;
}

/**
 * What the /pricing audience tab bar shows.
 *   pending — the session is still resolving: show no bar yet, so a member
 *             never sees every family flash up and then disappear;
 *   all     — a guest, or a signed-in type with no tab of its own (admin):
 *             the full bar, as before;
 *   locked  — a member: only their own family.
 */
export type AudienceTabsView =
  | { kind: "pending" }
  | { kind: "all" }
  | { kind: "locked"; audience: AudienceTab };

export function audienceTabsView(session: {
  loading: boolean;
  isLoggedIn: boolean;
  userType: UserType | null | undefined;
}): AudienceTabsView {
  if (session.loading) return { kind: "pending" };
  if (!session.isLoggedIn) return { kind: "all" };
  const audience = audienceForUserType(session.userType);
  return audience ? { kind: "locked", audience } : { kind: "all" };
}
