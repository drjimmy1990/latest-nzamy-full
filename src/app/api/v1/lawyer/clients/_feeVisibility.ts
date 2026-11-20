import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CARD_FEES_CHUNK,
  canSeeClientFees,
  firmRoleMap,
  isMissingFeeFunction,
  parseCardFeeRows,
  type CardFees,
} from "@/lib/services/clientFeeVisibility";

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

/**
 * O1 (20261201_10): the fees of these client cards that the caller may see,
 * read through `public.lawyer_client_fees` — the session holds no SELECT on
 * the two fee columns any more. A card the caller may not see is absent.
 * null = the read failed: the caller shows no fees and refuses a fee edit.
 *
 * Before 20261201_10 runs the function is missing; the fees are then read the
 * old way (the session still holds the columns then) and filtered with
 * canSeeClientFees, so this works both before and after the SQL.
 */
export async function readCardFees(
  supabase: SupabaseClient,
  uid: string,
  ids: readonly string[],
): Promise<Map<string, CardFees> | null> {
  const out = new Map<string, CardFees>();
  const unique = Array.from(new Set(ids.filter((id) => typeof id === "string" && id)));
  for (let i = 0; i < unique.length; i += CARD_FEES_CHUNK) {
    const chunk = unique.slice(i, i + CARD_FEES_CHUNK);
    const { data, error } = await supabase.rpc("lawyer_client_fees", { p_ids: chunk });
    if (!error) {
      for (const [id, fees] of parseCardFeeRows(data)) out.set(id, fees);
      continue;
    }
    if (!isMissingFeeFunction(error.code)) {
      console.error("[lawyer/clients] fee read failed:", error.message, error.code);
      return null;
    }
    const legacy = await supabase
      .from("lawyer_clients")
      .select("id, owner_user_id, firm_id, fee_total_sar, fee_paid_sar")
      .in("id", chunk);
    if (legacy.error) {
      console.error("[lawyer/clients] fee read (before 20261201_10) failed:", legacy.error.message, legacy.error.code);
      return null;
    }
    const roles = await readCallerFirmRoles(supabase, uid);
    const rows = (legacy.data ?? []) as Array<{ id: string; owner_user_id: string; firm_id: string | null }>;
    const visible = rows.filter((r) => canSeeClientFees(uid, r, roles));
    for (const [id, fees] of parseCardFeeRows(visible)) out.set(id, fees);
  }
  return out;
}
