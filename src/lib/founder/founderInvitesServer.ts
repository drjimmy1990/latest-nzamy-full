/**
 * founderInvitesServer.ts — the server reads of the founder invites (owner
 * Q144 أ, batch l13; SQL 20261203_20). Pure rules in ./founderInvites.ts.
 *
 * «لا تعمل الدعوات إلا بعد تفعيل الدفع»: invitesGatewayOn() is the payment
 * gateway exactly as THIS account sees it (viewerGatewayState): live → on for
 * everyone; test → on only for staff and test accounts (as their checkout);
 * disabled, a failed read or a throw → off. The database cannot see the
 * server's Moyasar keys, so the routes check this before every create /
 * redeem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentGatewayStatus } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { viewerGatewayState } from "@/lib/payments/testModeAccess";
import { FOUNDER_CAMPAIGN_ID } from "@/lib/membership/founderPlan";
import { FOUNDER_INVITES_KEY, parseFounderInvites, type FounderInvitesSettings } from "./founderInvites";

/** Is online payment on for this account? Never throws (a failure is off). */
export async function invitesGatewayOn(userId: string): Promise<boolean> {
  try {
    const state = await viewerGatewayState(await getPaymentGatewayStatus(), {
      userId: async () => userId,
      admin: () => createServiceClient(),
    });
    return state.disabled === false && (state.status === "live" || state.status === "test");
  } catch (err) {
    console.error("[founder-invites] gateway check threw; invites off:", err instanceof Error ? err.message : "unknown");
    return false;
  }
}

/** platform_settings.founder_invites with the defaults; a failed read is the defaults. */
export async function readFounderInvitesSettings(admin: SupabaseClient): Promise<FounderInvitesSettings> {
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", FOUNDER_INVITES_KEY).maybeSingle();
  if (error) console.warn("[founder-invites] setting read failed; defaults used:", error.code);
  return parseFounderInvites((data as { value?: unknown } | null)?.value);
}

/** An active, unexpired founder seat of this user (founder_invite_create's own rule). null = the read failed. */
export async function isActiveFounder(admin: SupabaseClient, userId: string, now: Date): Promise<boolean | null> {
  const { data, error } = await admin
    .from("founder_seats")
    .select("id")
    .eq("user_id", userId)
    .eq("campaign_id", FOUNDER_CAMPAIGN_ID)
    .eq("status", "active")
    .gt("ends_at", now.toISOString())
    .limit(1);
  if (error) {
    if (isMissingObject(error.code)) return false;
    console.error("[founder-invites] seat read failed:", error.code);
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}

/** A table / function this batch adds is not there yet (the migration has not run). */
export function isMissingObject(code: string | null | undefined): boolean {
  return code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205";
}
