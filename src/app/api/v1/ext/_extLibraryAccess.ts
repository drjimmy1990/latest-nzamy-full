import { getLibraryStatus, getUserTier, isPlatformAdmin, LIBRARY_CLOSED_DEFAULT_MESSAGE, TIER_RANK } from "@/lib/access-control";
import { hasActiveLibraryGrant } from "@/lib/libraryAccessServer";
import { libraryAiDecision, libraryAiReads } from "@/app/api/ai/libraryAiDecision";
import { isFounderMemberForTool } from "@/app/api/ai/_founderToolMember";
import { LIBRARY_ASSISTANT_REFUSAL_AR, LIBRARY_TOOL_REFUSAL_AR } from "@/app/api/ai/libraryAiRefusalText";
import type { RouteReply } from "@/lib/ai/runCore";

/**
 * The library gate for a token caller. libraryGate() and libraryAiAccess() read the cookie
 * session, which a bearer token never has, so they would answer 401 to every token. This is
 * the same two rules keyed by the token's user id: the library's closed switch (admins pass),
 * then the tier rule libraryAiDecision (Pro or higher, an admin, a founder seat or a library
 * grant for the tools that name them). Fails closed on the tier read, open only where
 * getLibraryStatus is documented to (its own outage rule).
 * The per-account library lock is not applied: it never applies to the drafter tools
 * (runs/route.ts, owner item 9.7), and the library assistant is not offered through this door.
 */
export async function extLibraryAccess(userId: string, toolId: string): Promise<RouteReply | null> {
  const state = await getLibraryStatus();
  if (state.closed && !(await isPlatformAdmin(userId))) {
    return { status: 503, body: { error: state.message || LIBRARY_CLOSED_DEFAULT_MESSAGE, code: "library_closed" } };
  }
  const reads = libraryAiReads(toolId);
  const [tier, isAdmin, founderMember, libraryGrant] = await Promise.all([
    getUserTier(userId),
    isPlatformAdmin(userId),
    reads.founderSeat ? isFounderMemberForTool(userId, toolId) : Promise.resolve(false),
    reads.libraryGrant ? hasActiveLibraryGrant(userId) : Promise.resolve(false),
  ]);
  if (libraryAiDecision({ signedIn: true, tier, isAdmin, founderMember, libraryGrant }, TIER_RANK) === "allow") return null;
  return {
    status: 403,
    body: { error: reads.libraryGrant ? LIBRARY_ASSISTANT_REFUSAL_AR : LIBRARY_TOOL_REFUSAL_AR, code: "library_tier" },
  };
}
