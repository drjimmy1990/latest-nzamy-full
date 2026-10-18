/**
 * Who has the FULL library (owner answers ٢٠٥ / ٢٠٩, decisions of 2026-10-18):
 * a subscription tier of pro or above, an active library grant (the library
 * subscription, public.library_access_grants), or a platform admin.
 *
 * This file is the pure rule. The reads behind its three inputs live in
 * src/lib/access-control.ts (getUserTier, isPlatformAdmin, and
 * hasFullLibraryAccess, which puts them together) and
 * src/lib/libraryAccessServer.ts (hasActiveLibraryGrant).
 *
 * The tier ranking is passed in as `ranks`, never copied here:
 * src/lib/access-control.ts owns the ONE TIER_RANK table on the server
 * (src/lib/entitlements.test.ts enforces that), and it cannot be imported by a
 * module that `node --test` loads. entitlementGrantRules.ts takes `ranks` the
 * same way.
 *
 * Relative imports only: `node --test` loads this file
 * (libraryAccessDecision.test.ts).
 */

/**
 * True when the user has the full library: the tier ranks at or above pro, or
 * the user is an admin, or holds an active library grant. A tier the ranking
 * does not know (own keys only, so "constructor" is not a tier) ranks -1 and
 * is never full; only a literal `true` counts for the two flags.
 */
export function fullLibraryAccess(
  input: { tier: string; isAdmin: boolean; hasLibraryGrant: boolean },
  ranks: Record<string, number>,
): boolean {
  if (input.isAdmin === true || input.hasLibraryGrant === true) return true;
  const proRank = rankOf("pro", ranks);
  if (proRank < 0) return false;
  return rankOf(input.tier, ranks) >= proRank;
}

function rankOf(tier: unknown, ranks: Record<string, number>): number {
  if (typeof tier !== "string" || !Object.prototype.hasOwnProperty.call(ranks, tier)) return -1;
  const rank = ranks[tier];
  return typeof rank === "number" && Number.isFinite(rank) ? rank : -1;
}
