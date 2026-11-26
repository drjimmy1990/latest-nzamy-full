/**
 * licenceGate.ts — the licence rule for buying the founder plan or a
 * professional plan. Batch l18 first built owner decision ق٢٦-٩ as a purchase
 * block; the owner's answer ٢٣٩ (27 Nov) replaced it:
 *
 *   «يُسمح بالدفع وحجز باقة المؤسس أو أي باقة مهنية قبل اعتماد التوثيق، ولكن
 *    لا تُفعَّل الباقة ولا الأدوات المهنية إلا بعد اعتماد التوثيق من الإدارة.»
 *
 * So, for a lawyer or a firm buying a gated item (licenceGatedPurchase — the
 * founder membership and every plan sold to lawyers / firms; library passes,
 * top-ups, individuals and providers are not gated):
 *
 *   verified   → bought and activated as before;
 *   pending    → (the licence was submitted and waits for the team) MAY PAY.
 *                A professional plan is then held at fulfilment
 *                (fulfillCore: metadata.licence_pending, no subscription) and
 *                activated when the admin approves the verification — its
 *                period starts on the approval day (heldPlanActivation.ts).
 *                The founder seat already works this way (20261127_10:
 *                pending_verification, founderVerification.ts);
 *   unverified → (rejected, suspended, no licence submitted) refused with
 *                «وثّق رخصتك أولاً» and the verify link: nothing would ever
 *                release the hold (no approval event follows), and
 *                founder_reserve_seat refuses the same accounts.
 *
 * A FREE activation (a 100 % code at checkout, a free-plan code in the box)
 * of a gated item needs a VERIFIED licence: there is nothing paid to hold,
 * and activating it would put the plan to work before approval. The code is
 * refused before it is opened, so it is not used up.
 *
 * The licence expiry date is not part of the purchase rule: an expired
 * licence of an already verified account has no approval event that would
 * ever release a held order.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayableItem } from "./catalog.ts";
import { LICENCE_VERIFY_HREF, verifiedProviderDecision, type VerifiedProviderFacts } from "../auth/verifiedProvider.ts";
import { readVerifiedProviderFacts } from "../auth/verifiedProviderRead.ts";

export const LICENCE_PURCHASE_CODE = "licence_not_verified";

/** Under the price on /checkout, for a pending lawyer / firm (٢٣٩). */
export const LICENCE_HELD_NOTE_AR =
  "تُفعَّل الباقة بعد اعتماد التوثيق: يمكنك الدفع الآن ويُحجز اشتراكك، وتبدأ مدته من يوم اعتماد الإدارة لتوثيق رخصتك. وإن لم يُعتمد التوثيق يُردّ المبلغ كاملاً.";
export const LICENCE_UNVERIFIED_PURCHASE_AR =
  "وثّق رخصتك أولاً: باقة المؤسس والباقات المهنية تُشترى بعد رفع توثيق الرخصة، وتُفعَّل بعد اعتماده.";
export const LICENCE_UNVERIFIED_FIRM_PURCHASE_AR =
  "يلزم توثيق مكتبك أولاً: باقات المكاتب تُشترى بعد رفع توثيق المكتب، وتُفعَّل بعد اعتماده.";
export const LICENCE_FREE_CODE_PENDING_AR =
  "هذا الكود يفعّل باقة مهنية، والباقات المهنية تُفعَّل بعد اعتماد توثيق رخصتك. فعّل الكود بعد الاعتماد.";
export const LICENCE_CHECK_FAILED_AR = "تعذّر التحقق من توثيق رخصتك الآن، حاول مرة أخرى بعد قليل";

/** The account types whose purchases the licence rule covers. */
const GATED_BUYERS = new Set(["lawyer", "firm"]);

/** True when this purchase follows the licence rule (٢٣٩). */
export function licenceGatedPurchase(item: Pick<PayableItem, "kind" | "buyers">, userType: string | null | undefined): boolean {
  if (typeof userType !== "string" || !GATED_BUYERS.has(userType)) return false;
  if (item.kind === "membership") return true;
  if (item.kind !== "plan") return false;
  const buyers = item.buyers === "any" ? [] : item.buyers;
  return buyers.some((b) => GATED_BUYERS.has(b));
}

export type LicenceStanding = "verified" | "pending" | "unverified";

/**
 * verified: verifiedProvider.ts's rule as it is (a verified lawyer, the owner
 * of a verified firm, an active member of a verified firm, an admin);
 * pending: the lawyer's own licence, or the firm he owns, waits for the team;
 * unverified: anything else. Null when the facts could not be read.
 */
export function licenceStanding(facts: VerifiedProviderFacts | null): LicenceStanding | null {
  if (!facts) return null;
  if (verifiedProviderDecision(facts).ok) return "verified";
  if (facts.userType === "lawyer" && facts.lawyerStatus === "pending") return "pending";
  if (facts.userType === "firm" && facts.ownedFirmStatuses.includes("pending")) return "pending";
  return "unverified";
}

export type LicencePurchaseDecision =
  | { ok: true; held: boolean }
  | { ok: false; status: 403 | 503; error: string; code?: string; verifyHref?: string | null };

const unverifiedRefusal = (userType: string): LicencePurchaseDecision =>
  userType === "firm"
    ? { ok: false, status: 403, error: LICENCE_UNVERIFIED_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null }
    : { ok: false, status: 403, error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: LICENCE_VERIFY_HREF };

/** A PAID purchase (٢٣٩): verified → go; pending → go, held until approval; unverified → 403; unread → 503. */
export function licenceCheckoutDecision(userType: string, facts: VerifiedProviderFacts | null): LicencePurchaseDecision {
  const standing = licenceStanding(facts);
  if (standing === null) return { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR };
  if (standing === "verified") return { ok: true, held: false };
  if (standing === "pending") return { ok: true, held: true };
  return unverifiedRefusal(userType);
}

/** A FREE activation of a gated item: only a verified licence; pending → 403 (the code stays unused). */
export function licenceFreeCodeDecision(userType: string, facts: VerifiedProviderFacts | null): LicencePurchaseDecision {
  const standing = licenceStanding(facts);
  if (standing === null) return { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR };
  if (standing === "verified") return { ok: true, held: false };
  if (standing === "pending") return { ok: false, status: 403, error: LICENCE_FREE_CODE_PENDING_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null };
  return unverifiedRefusal(userType);
}

/** The verification facts (service client, keyed on the session's user id); null on a failed read. */
export async function readLicenceFacts(admin: SupabaseClient, userId: string, userType: string): Promise<VerifiedProviderFacts | null> {
  return readVerifiedProviderFacts(admin, userId, userType);
}
