/**
 * Who may use the library's AI tools. The base rule (owner answers ٢٠٦ / ٢٠٧ /
 * ٢٠٩, decisions of 2026-10-18): a signed-in user whose tier is pro or above,
 * or a platform admin.
 *
 * Two openings on top of it, each for named tools only (libraryAiReads below
 * says which; the gate reads a fact only for the tools it can open):
 *   - an ACTIVE FOUNDER MEMBER (`founderMember`): for the founder plan's own
 *     tools (0.5 of the 17-Nov package: the drafter and the four
 *     independent-output tools, founderPlanTool.ts) and for the library's own
 *     AI assistant (owner ٥ as amended by ١٥, 17 Nov 2026);
 *   - an ACTIVE LIBRARY GRANT holder, a library subscriber (`libraryGrant`):
 *     for the library's own AI assistant ONLY (owner ٥ / ١٥, 17 Nov 2026 —
 *     this replaces ٢٠٧, where the grant did not open the assistant). Every
 *     other library tool (quick-answer, the deep assistant, …) keeps the Pro
 *     rule: the grant does not open them.
 * Opening is not free: every question still costs its points (5 for the
 * library assistant); the only exception is the founder's 20 library
 * questions (membership credit 'library_question', 20261124_10), spent in
 * src/lib/ai/runCore.ts.
 *
 * This file is the pure rule. The reads behind its inputs (getUserTier,
 * isPlatformAdmin, the founder seat, hasActiveLibraryGrant) and the responses
 * for each outcome live in ./_libraryAiAccess.ts.
 *
 * The tier ranking is passed in as `ranks`, never copied here:
 * src/lib/access-control.ts owns the ONE TIER_RANK table on the server
 * (src/lib/entitlements.test.ts enforces that), and it cannot be imported by a
 * module that `node --test` loads.
 *
 * Relative imports only: `node --test` loads this file
 * (library-ai-access.test.ts).
 */
import { isFounderPlanTool } from "./founderPlanTool.ts";
import { isLibraryAiTool } from "../../../lib/library/readQuota.ts";

export type LibraryAiDecision = 'allow' | 'sign_in' | 'upgrade';

/**
 * Which facts the gate must read for `toolId`: the founder seat for the
 * founder plan's tools and the library assistant; the library grant for the
 * library assistant only. Anything else reads neither (tier and admin only).
 */
export function libraryAiReads(toolId: unknown): { founderSeat: boolean; libraryGrant: boolean } {
  const libraryAssistant = isLibraryAiTool(toolId);
  return { founderSeat: libraryAssistant || isFounderPlanTool(toolId), libraryGrant: libraryAssistant };
}

/**
 * `sign_in` unless the caller is signed in; then `allow` for an admin, for an
 * active founder member (`founderMember`: the caller sets it only for the
 * tools libraryAiReads names), for an active library grant holder
 * (`libraryGrant`: the caller sets it only for the library assistant), or for
 * a tier ranked at or above pro; `upgrade` for everyone else. A tier the
 * ranking does not know (own keys only, so "constructor" is not a tier) ranks
 * -1, and a ranking without pro opens nothing by tier. Only a literal `true`
 * counts for the three flags.
 */
export function libraryAiDecision(
  input: { signedIn: boolean; tier: string; isAdmin: boolean; founderMember?: boolean; libraryGrant?: boolean },
  ranks: Record<string, number>,
): LibraryAiDecision {
  if (input.signedIn !== true) return 'sign_in';
  if (input.isAdmin === true) return 'allow';
  if (input.founderMember === true) return 'allow';
  if (input.libraryGrant === true) return 'allow';
  const proRank = rankOf('pro', ranks);
  if (proRank < 0) return 'upgrade';
  return rankOf(input.tier, ranks) >= proRank ? 'allow' : 'upgrade';
}

function rankOf(tier: unknown, ranks: Record<string, number>): number {
  if (typeof tier !== 'string' || !Object.prototype.hasOwnProperty.call(ranks, tier)) return -1;
  const rank = ranks[tier];
  return typeof rank === 'number' && Number.isFinite(rank) ? rank : -1;
}
