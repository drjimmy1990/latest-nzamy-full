/**
 * _lawyersSpace.ts — who may post into, or move a post into, the lawyers-only
 * community (N05-C2, owner ٤٢).
 *
 * A verified lawyer, as before, OR the owner of a «مكتب معتمد»: a law firm
 * registered on the platform that holds an active office plan (N18, owner RAW
 * [39]) — the exact rule of public.community_verified_office_users()
 * (20261202_80; before it 20261127_60) and its pure twin isVerifiedOffice() in
 * src/lib/community/review.ts.
 *
 * The database decides: public.community_lawyers_space_ok() (20261201_50) is
 * the same function the RLS policies call, evaluated for the caller only.
 * Until that file runs the function does not exist; the route then keeps the
 * old rule (a verified lawyer only), so deploying the code first changes
 * nothing. Any other error refuses (fail closed).
 *
 * No `next/server` import — `node --test` loads this file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const LAWYERS_SPACE_REFUSAL_AR = "النشر في مجتمع المحامين متاح للمحامين الموثّقين والمكاتب المعتمدة فقط.";

/** PostgREST / Postgres codes for "this function does not exist (yet)". */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

interface RpcError {
  code?: string | null;
}

/**
 * The decision from the RPC's answer: true / false when the database
 * answered, "fallback" when the function is not there yet, false otherwise.
 */
export function lawyersSpaceFromRpc(data: unknown, error: RpcError | null | undefined): boolean | "fallback" {
  if (!error) return data === true;
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return "fallback";
  return false;
}

export async function canUseLawyersSpace(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("community_lawyers_space_ok");
  const decided = lawyersSpaceFromRpc(data, error);
  if (decided !== "fallback") return decided;
  // Before 20261201_50: the verified-lawyer rule the RLS still enforces.
  const { data: lawyerProfile } = await supabase
    .from("lawyer_profiles")
    .select("verification_status")
    .eq("user_id", userId)
    .maybeSingle();
  return lawyerProfile?.verification_status === "verified";
}
