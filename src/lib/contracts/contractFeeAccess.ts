/**
 * contractFeeAccess.ts — owner answer ٢٢٩ (27 Nov 2026, batch l18-answers):
 * «جداول أتعاب العقود في حساب المكتب: تُقصر رؤيتها وتعديلها على (صاحب المكتب +
 * الشريك المدير + المدير المالي) فقط».
 *
 * A contract's fee schedule (public.contract_payments):
 *   - a contract with NO firm (contracts.firm_id null — stamped at create from
 *     the creator's active firm membership): the solo lawyer's own, as before;
 *   - a FIRM contract: only the firm's owner, or its ACTIVE managing partner or
 *     finance manager — the set that reads the firm's fee statements
 *     (FIRM_FEE_STATEMENT_ROLES, O23). A member lawyer who created the contract
 *     does not see its schedule.
 *
 * The database holds the same rule (20261208_53: public.contract_fees_visible
 * and a restrictive policy on contract_payments); this file is the app's copy,
 * so the routes refuse with a clear Arabic answer and the contract page hides
 * the schedule instead of showing an empty one — also before the SQL runs.
 *
 * Relative imports only: `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FIRM_FEE_STATEMENT_ROLES } from "../finance/firmFeeStatements.ts";

/** Firm roles that see a firm contract's fee schedule, besides the firm owner. */
export const CONTRACT_FEES_FIRM_ROLES: readonly string[] = FIRM_FEE_STATEMENT_ROLES;

export const CONTRACT_FEES_FIRM_ONLY_AR =
  "جدول أتعاب عقود المكتب يراه ويعدّله صاحب المكتب والشريك المدير والمدير المالي فقط.";

type Res = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * May `userId` read and write the fee schedule of a contract whose firm is
 * `firmId`? A contract without a firm → true (its own RLS decides). A firm
 * contract → the owner, or an ACTIVE managing partner / finance manager of THAT
 * firm. Any read error → false (fail closed: the schedule stays hidden).
 */
export async function contractFeesAllowed(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
  firmId: string | null | undefined,
): Promise<boolean> {
  if (!firmId) return true;
  try {
    const [owned, member] = (await Promise.all([
      supabase.from("firm_profiles").select("id").eq("id", firmId).eq("owner_user_id", userId).limit(1),
      supabase
        .from("firm_members")
        .select("role")
        .eq("firm_id", firmId)
        .eq("user_id", userId)
        .eq("status", "active")
        .in("role", [...CONTRACT_FEES_FIRM_ROLES])
        .limit(1),
    ])) as Res[];
    if (owned.error || member.error) return false;
    return (Array.isArray(owned.data) && owned.data.length > 0) || (Array.isArray(member.data) && member.data.length > 0);
  } catch {
    return false;
  }
}
