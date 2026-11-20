import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentAccessToken } from "@/lib/auth/staffMfaServer";
import { hasVerifiedTotp } from "@/lib/auth/staffMfa";
import { freshTotpDecision, type FreshTotpDecision } from "@/lib/testBatches/testBatches";

/**
 * The TOTP re-check of «مسح دفعة الاختبار» (owner file 19 §1ج.3): the
 * signed-in admin entered a code from his authenticator in the last five
 * minutes (the page calls mfa.challengeAndVerify right before the request,
 * which puts a fresh `totp` entry in the session's amr claim). The rule is
 * freshTotpDecision (./testBatches.ts). The staff gate itself is
 * requireStaff("users.delete") in the route; this runs after it.
 */
export async function readFreshTotp(): Promise<FreshTotpDecision> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const token = await currentAccessToken(supabase);
    return freshTotpDecision({ hasVerifiedTotp: hasVerifiedTotp(user), accessToken: token, nowS: Math.floor(Date.now() / 1000) });
  } catch {
    return freshTotpDecision({ hasVerifiedTotp: true, accessToken: null, nowS: Math.floor(Date.now() / 1000) });
  }
}
