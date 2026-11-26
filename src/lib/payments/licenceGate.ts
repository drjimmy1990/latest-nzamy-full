/**
 * licenceGate.ts — batch l18, owner decision ق٢٦-٩ (package of 26 Nov): while
 * a lawyer's or a firm's licence is not verified yet (pending / under the
 * team's review / rejected / suspended), or the licence on file has expired,
 * the account may not BUY the founder plan or any professional plan. Browsing
 * the dashboard, the library preview and the free questions stay open (they
 * are not purchases). This reverses the earlier "pay before verification"
 * rule (verifiedProvider.ts q٦١ and the 18 Nov founder decision 1) for NEW
 * purchases only: founder seats already held are not touched.
 *
 * What is gated (licenceGatedPurchase): the founder membership, and every
 * PLAN sold to lawyers or firms (lawyer-pro, lawyer-bundle,
 * consultant-independent, firm-basic, firm-enterprise …) — only when the buyer
 * is a lawyer or a firm account. Library passes and point top-ups are not a
 * professional plan and stay open (our reading of «باقة مهنية»); a provider
 * account (notary, arbitrator …) has no verification flow yet and is not
 * gated here.
 *
 * Who passes (licencePurchaseDecision): verifiedProvider.ts's rule as it is
 * (a verified lawyer, the owner of a verified firm, an active member of a
 * verified firm, an admin) — and then, for the lawyer's own licence or the
 * firm's own licence, a license_expiry on file that is not before today in
 * Riyadh. A NULL expiry passes (most profiles have none; failing closed would
 * lock every verified lawyer out). A failed read → 503, never a guess.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayableItem } from "./catalog.ts";
import { LICENCE_VERIFY_HREF, verifiedProviderDecision, type VerifiedProviderFacts } from "../auth/verifiedProvider.ts";
import { readVerifiedProviderFacts } from "../auth/verifiedProviderRead.ts";

export const LICENCE_PURCHASE_CODE = "licence_not_verified";

export const LICENCE_PENDING_PURCHASE_AR =
  "تُتاح باقة المؤسس والباقات المهنية بعد أن يعتمد فريق المنصة توثيق رخصتك. وإلى ذلك الحين يمكنك تصفح لوحتك ومعاينة المكتبة واستعمال الأسئلة المجانية.";
export const LICENCE_PENDING_FIRM_PURCHASE_AR =
  "تُتاح باقات المكاتب بعد أن يعتمد فريق المنصة توثيق مكتبك. وإلى ذلك الحين يمكنك تصفح لوحتك ومعاينة المكتبة.";
export const LICENCE_EXPIRED_PURCHASE_AR =
  "انتهت صلاحية الرخصة المسجلة في حسابك، فلا تُشترى الباقات المهنية حتى تُحدَّث الرخصة ويعتمدها فريق المنصة. تواصل مع الدعم لتحديثها.";
export const LICENCE_CHECK_FAILED_AR = "تعذّر التحقق من توثيق رخصتك الآن، حاول مرة أخرى بعد قليل";

/** The account types whose purchases the licence gates. */
const GATED_BUYERS = new Set(["lawyer", "firm"]);

/** True when this purchase waits for a verified, unexpired licence (ق٢٦-٩). */
export function licenceGatedPurchase(item: Pick<PayableItem, "kind" | "buyers">, userType: string | null | undefined): boolean {
  if (typeof userType !== "string" || !GATED_BUYERS.has(userType)) return false;
  if (item.kind === "membership") return true;
  if (item.kind !== "plan") return false;
  const buyers = item.buyers === "any" ? [] : item.buyers;
  return buyers.some((b) => GATED_BUYERS.has(b));
}

/** YYYY-MM-DD of `now` in Riyadh (+03:00, no daylight saving). */
function riyadhToday(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** True when a license_expiry (a date) is before today in Riyadh; null / unreadable is not expired. */
export function licenceExpired(expiry: string | null | undefined, now: Date): boolean {
  if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return false;
  return expiry.slice(0, 10) < riyadhToday(now);
}

export interface LicencePurchaseFacts {
  provider: VerifiedProviderFacts | null;
  /** The buyer's own licence expiry (lawyer_profiles / the owned firm_profiles row); null when none is on file. */
  ownExpiry: string | null;
  /** True when the buyer passes only as a member of a verified firm (his own licence is not the one checked). */
  viaFirmMembership?: boolean;
}

export type LicencePurchaseDecision =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string; code?: string; verifyHref?: string | null };

export function licencePurchaseDecision(userType: string, facts: LicencePurchaseFacts | null, now: Date): LicencePurchaseDecision {
  if (!facts || !facts.provider) return { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR };
  const verified = verifiedProviderDecision(facts.provider);
  if (verified.ok === false) {
    if (verified.status === 503) return { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR };
    return userType === "firm"
      ? { ok: false, status: 403, error: LICENCE_PENDING_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null }
      : { ok: false, status: 403, error: LICENCE_PENDING_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: LICENCE_VERIFY_HREF };
  }
  if (!facts.viaFirmMembership && licenceExpired(facts.ownExpiry, now)) {
    return { ok: false, status: 403, error: LICENCE_EXPIRED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null };
  }
  return { ok: true };
}

/**
 * The reads (service client, keyed on the session's user id): the
 * verification facts (verifiedProviderRead.ts, unchanged) and the buyer's own
 * licence expiry. Null on any failed read.
 */
export async function readLicencePurchaseFacts(admin: SupabaseClient, userId: string, userType: string): Promise<LicencePurchaseFacts | null> {
  const provider = await readVerifiedProviderFacts(admin, userId, userType);
  if (!provider) return null;
  const ownVerified =
    (userType === "lawyer" && provider.lawyerStatus === "verified") ||
    (userType === "firm" && provider.ownedFirmStatuses.includes("verified"));
  if (!ownVerified) return { provider, ownExpiry: null, viaFirmMembership: provider.memberFirmStatuses.includes("verified") };
  try {
    const read =
      userType === "lawyer"
        ? await admin.from("lawyer_profiles").select("license_expiry").eq("user_id", userId).maybeSingle()
        : await admin.from("firm_profiles").select("license_expiry, verification_status").eq("owner_user_id", userId).eq("verification_status", "verified").limit(1).maybeSingle();
    if (read.error) {
      console.error("[payments/licence] reading the licence expiry failed:", read.error.code ?? "no-code");
      return null;
    }
    const raw = (read.data as { license_expiry?: unknown } | null)?.license_expiry;
    return { provider, ownExpiry: typeof raw === "string" ? raw : null, viaFirmMembership: false };
  } catch (err) {
    console.error("[payments/licence] reading the licence expiry threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}
