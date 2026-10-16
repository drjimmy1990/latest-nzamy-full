import type { SupabaseClient } from "@supabase/supabase-js";
import type { DelegationLookup } from "./businessProfileScope";

/**
 * Owner decision ٣٦ — does the signed-in MEMBER hold a live delegation to edit
 * this company's data? Asked of the database, through the caller's own
 * RLS-scoped client, by `public.is_business_profile_editor(uuid)`
 * (supabase/migrations/20261017_30_business_delegations.sql). The same
 * function backs the delegate's UPDATE policy, so the API and RLS cannot drift.
 *
 * Call it only after the owner check failed: the function is true for the
 * owner too, and an owner's save must not depend on this lookup.
 *
 * PGRST202 / 42883 mean the function is not installed (the migration has not
 * run): that is the WP-6 owner-only state, reported as "unavailable" and never
 * as a failure, so deploying the code first changes nothing for anyone.
 */
export async function lookupProfileDelegation(
  supabase: SupabaseClient,
  businessId: string,
  where: string,
): Promise<DelegationLookup> {
  const { data, error } = await supabase.rpc("is_business_profile_editor", { p_business: businessId });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return "unavailable";
    console.error(`[${where}] delegation lookup failed:`, error.message, error.code);
    return "failed";
  }
  return data === true ? "delegate" : "not_delegate";
}
