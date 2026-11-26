/**
 * liveGatewayActorServer.ts — who asks to switch payments_gateway to "live"
 * (batch l16, A-22; owner 25 Nov §1.5.1), for the admin settings route: the
 * staff role the route's requireStaff returned, the GoTrue user's verified
 * factor, and whether this request's session is aal2. Anything that cannot
 * be read is false, so live stays refused (moyasarConfig.liveGatewayActorIssue).
 * SERVER-ONLY.
 */
import { createClient } from "@/lib/supabase/server";
import { aalFromAccessToken, hasVerifiedFactor } from "@/lib/auth/staffMfa";
import { currentAccessToken } from "@/lib/auth/staffMfaServer";
import type { LiveGatewayActor } from "@/lib/payments/moyasarConfig";

export async function readLiveGatewayActor(role: string): Promise<LiveGatewayActor> {
  const actor: LiveGatewayActor = { superAdmin: role === "super_admin", verifiedFactor: false, aal2: false };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return actor;
    return {
      superAdmin: actor.superAdmin,
      verifiedFactor: hasVerifiedFactor(user),
      aal2: aalFromAccessToken(await currentAccessToken(supabase)) === "aal2",
    };
  } catch (err) {
    console.error("[admin/settings] reading the live actor failed; live stays refused", err instanceof Error ? err.message : "unknown");
    return actor;
  }
}
