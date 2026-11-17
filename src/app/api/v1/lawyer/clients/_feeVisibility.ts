import type { SupabaseClient } from "@supabase/supabase-js";
import { firmRoleMap } from "@/lib/services/clientFeeVisibility";

/**
 * The caller's active firm roles (firm id → role) for the fee rule in
 * src/lib/services/clientFeeVisibility.ts. Read with the caller's own session:
 * his own `firm_members` rows and the firms he owns. A failed read returns
 * what was read (possibly nothing), so fees on colleagues' cards are hidden
 * rather than shown — deny by default.
 */
export async function readCallerFirmRoles(supabase: SupabaseClient, uid: string): Promise<Map<string, string>> {
  const [members, owned] = await Promise.all([
    supabase.from("firm_members").select("firm_id, role").eq("user_id", uid).eq("status", "active"),
    supabase.from("firm_profiles").select("id").eq("owner_user_id", uid),
  ]);
  if (members.error) {
    console.error("[lawyer/clients] firm role lookup failed:", members.error.message, members.error.code);
  }
  if (owned.error) {
    console.error("[lawyer/clients] owned firm lookup failed:", owned.error.message, owned.error.code);
  }
  return firmRoleMap(
    members.error ? [] : ((members.data ?? []) as Array<{ firm_id: string | null; role: string | null }>),
    owned.error ? [] : ((owned.data ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
}
