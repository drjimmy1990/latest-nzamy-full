/**
 * Who has the FULL library.
 *
 * Owner answers ٨٩ and ٩٣ (20 Nov 2026, batch l12): the library comes ONLY
 * from a library plan or library grant (public.library_access_grants:
 * lib-q1 / lib-q2 / lib-annual / lib-founder and the older lib-trial /
 * lib-invite / lib-admin rows), or from being a platform admin. No
 * subscription tier opens it any more — «تُرفع المكتبة منها فتصير إدارة مكتب
 * وحدها»: lawyer-pro, consultant-independent and the firm plans are practice
 * management only. (Before l12, owner answers ٢٠٥ / ٢٠٩: a tier of pro or
 * above opened the whole library on its own.)
 *
 * This file is the pure rule. The reads behind its inputs live in
 * src/lib/access-control.ts (isPlatformAdmin, libraryFullAccessState) and
 * src/lib/libraryAccessServer.ts (activeLibraryGrantPlanRefs). Whether a
 * grant holder's balance keeps the full text open is the 50-point gate
 * (src/lib/library/pointsGate.ts), applied after this.
 *
 * `tierAtLeastPro` is kept for the one rule that still cares about a Pro+
 * PLAN as a product (libraryRequestApproval.ts: granting a 3,990 plan with
 * no paid order is for the top admin) — it says nothing about the library.
 *
 * Relative imports only: `node --test` loads this file
 * (libraryAccessDecision.test.ts).
 */

/**
 * True when the user has the full library: an admin, or an active library
 * grant. Only a literal `true` counts for either flag.
 */
export function fullLibraryAccess(input: { isAdmin: boolean; hasLibraryGrant: boolean }): boolean {
  return input.isAdmin === true || input.hasLibraryGrant === true;
}

/**
 * True when `tier` ranks at or above pro in `ranks` (access-control.ts's
 * TIER_RANK, passed in — never copied here). A tier the ranking does not
 * know (own keys only, so "constructor" is not a tier) ranks -1; a ranking
 * without pro answers false.
 */
export function tierAtLeastPro(tier: unknown, ranks: Record<string, number>): boolean {
  const proRank = rankOf("pro", ranks);
  if (proRank < 0) return false;
  return rankOf(tier, ranks) >= proRank;
}

function rankOf(tier: unknown, ranks: Record<string, number>): number {
  if (typeof tier !== "string" || !Object.prototype.hasOwnProperty.call(ranks, tier)) return -1;
  const rank = ranks[tier];
  return typeof rank === "number" && Number.isFinite(rank) ? rank : -1;
}
