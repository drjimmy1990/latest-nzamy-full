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
import type { PracticeKind } from "../auth/practiceKind.ts";

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

/**
 * Plans shown on top of the account type's own family (owner ruling,
 * 2026-10-24). An independent consultant is a `lawyer` account with
 * practice kind 'consultant': it stays on the lawyers family — the catalog
 * lets every lawyer buy «المحامي المحترف» — and also sees the
 * «مستشار مستقل» card (`consultant-independent`, sold to lawyers too), which
 * otherwise lives in the providers family. Library mode lists the library
 * plans only, so nothing is added there.
 */
export function extraPlanIdsFor(
  userType: UserType | null | undefined,
  practiceKind: PracticeKind | null | undefined,
  libraryMode: boolean,
): readonly string[] {
  if (libraryMode) return [];
  return userType === "lawyer" && practiceKind === "consultant" ? ["consultant-independent"] : [];
}

/**
 * The family's own list plus the `extraIds` plans taken from `source`, in
 * source order. A plan already in the list, or missing from `source`, is not
 * added twice or invented (the cards are keyed by id). No extras: the same
 * list object.
 */
export function withExtraPlans<T extends { id: string }>(
  list: T[],
  extraIds: readonly string[],
  source: readonly T[],
): T[] {
  if (extraIds.length === 0) return list;
  const have = new Set(list.map((p) => p.id));
  const extras = source.filter((p) => extraIds.includes(p.id) && !have.has(p.id));
  return extras.length === 0 ? list : [...list, ...extras];
}
