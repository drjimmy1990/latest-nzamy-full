import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyDelegation,
  resolveBusinessProfileScope,
  type BusinessScopeDecision,
} from "./businessProfileScope";
import { lookupProfileDelegation } from "./businessDelegationLookup";

/**
 * The caller's company and their standing in it — owner, registered delegate
 * (owner decision ٣٦), member, or none — for the routes that serve ANY account
 * type that belongs to a company: /api/v1/business/delegations and
 * /api/v1/business/profile.
 *
 * Same two RLS-scoped reads and the same pure decision as /api/v1/profile and
 * /api/v1/business/members, so the four endpoints mean the same thing by
 * «owner» and «member». Unlike /api/v1/profile it does not care about
 * `profiles.user_type`: company members are usually `individual` or `lawyer`
 * accounts (the members route invites those), and the proxy plus
 * UserTypeGuard already admit an ACTIVE member to /dashboard/business by
 * membership, not by type.
 *
 * `withDelegation: false` skips the delegation lookup (the register's own
 * read path needs only owner/member).
 */
export async function resolveCallerBusinessScope(
  supabase: SupabaseClient,
  userId: string,
  where: string,
  options: { withDelegation: boolean } = { withDelegation: true },
): Promise<BusinessScopeDecision> {
  const [owned, membership] = await Promise.all([
    supabase.from("business_profiles").select("id").eq("owner_user_id", userId).limit(1).maybeSingle(),
    supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (owned.error) {
    console.error(`[${where}] owned business lookup failed:`, owned.error.message, owned.error.code);
  }
  if (membership.error) {
    console.error(`[${where}] membership lookup failed:`, membership.error.message, membership.error.code);
  }

  const decision = resolveBusinessProfileScope({
    ownedId: (owned.data?.id as string | undefined) ?? null,
    ownedFailed: Boolean(owned.error),
    memberId: (membership.data?.business_id as string | undefined) ?? null,
    memberFailed: Boolean(membership.error),
  });

  if (!options.withDelegation || decision.scope !== "member" || !decision.businessId) return decision;
  return applyDelegation(decision, await lookupProfileDelegation(supabase, decision.businessId, where));
}
