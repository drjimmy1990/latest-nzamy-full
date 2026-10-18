/**
 * Who may use the library's AI assistant (owner answers ٢٠٦ / ٢٠٧ / ٢٠٩,
 * decisions of 2026-10-18): a signed-in user whose tier is pro or above, or a
 * platform admin.
 *
 * A library subscription (an active library grant) is NOT on that list. It
 * opens the library's texts (src/lib/libraryAccessDecision.ts) but not the
 * assistant, so this rule takes no grant input at all and does not build on
 * fullLibraryAccess(): when the library rule widened, the assistant would have
 * widened with it.
 *
 * This file is the pure rule. The reads behind its inputs (getUserTier,
 * isPlatformAdmin) and the responses for each outcome live in
 * ./_libraryAiAccess.ts.
 *
 * The tier ranking is passed in as `ranks`, never copied here:
 * src/lib/access-control.ts owns the ONE TIER_RANK table on the server
 * (src/lib/entitlements.test.ts enforces that), and it cannot be imported by a
 * module that `node --test` loads.
 *
 * Relative imports only: `node --test` loads this file
 * (library-ai-access.test.ts).
 */

export type LibraryAiDecision = 'allow' | 'sign_in' | 'upgrade';

/**
 * `sign_in` unless the caller is signed in; then `allow` for an admin or a tier
 * ranked at or above pro, `upgrade` for everyone else. A tier the ranking does
 * not know (own keys only, so "constructor" is not a tier) ranks -1, and a
 * ranking without pro opens nothing by tier. Only a literal `true` counts for
 * the two flags.
 */
export function libraryAiDecision(
  input: { signedIn: boolean; tier: string; isAdmin: boolean },
  ranks: Record<string, number>,
): LibraryAiDecision {
  if (input.signedIn !== true) return 'sign_in';
  if (input.isAdmin === true) return 'allow';
  const proRank = rankOf('pro', ranks);
  if (proRank < 0) return 'upgrade';
  return rankOf(input.tier, ranks) >= proRank ? 'allow' : 'upgrade';
}

function rankOf(tier: unknown, ranks: Record<string, number>): number {
  if (typeof tier !== 'string' || !Object.prototype.hasOwnProperty.call(ranks, tier)) return -1;
  const rank = ranks[tier];
  return typeof rank === 'number' && Number.isFinite(rank) ? rank : -1;
}
