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
 * top-ups, individuals and providers are not gated), by the account's licence
 * (licenceDetail; the l18 review ruling on ٢٣٩):
 *
 *   verified   → bought and activated as before;
 *   pending    → (the licence was submitted and waits for the team) MAY PAY.
 *                A professional plan is then held at fulfilment
 *                (fulfillCore: metadata.licence_pending, no subscription) and
 *                activated when the admin approves the verification — its
 *                period starts on the approval day (heldPlanActivation.ts).
 *                The founder seat already works this way (20261127_10:
 *                pending_verification, founderVerification.ts);
 *   none       → (no licence submitted yet) a professional plan MAY PAY and is
 *                held the same way; the copy tells the account to submit its
 *                licence, whose approval releases the hold. The founder
 *                membership still needs a submitted licence (founder_reserve_seat
 *                refuses the same accounts), so it is refused as before;
 *   rejected   → refused with «أعد تقديم التوثيق أولاً» (a new submission goes
 *                back to pending, and the account can pay then);
 *   suspended  → refused with «وثّق رخصتك أولاً» (unchanged: the ruling does not
 *                name it, and no approval event follows a suspension);
 *   expired    → (verified, but the licence's recorded expiry date has passed)
 *                refused with «جدّد رخصتك أولاً»: a held order would never be
 *                released — no approval event follows for a verified account.
 *
 * A FREE activation (a 100 % code at checkout, a free-plan code in the box)
 * of a gated item needs a VERIFIED, unexpired licence: there is nothing paid
 * to hold, and activating it would put the plan to work before approval. The
 * code is refused before it is opened, so it is not used up.
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
/** l18 review: the same, for a lawyer who has not submitted his licence yet. */
export const LICENCE_HELD_SUBMIT_NOTE_AR =
  "لم ترفع توثيق رخصتك بعد: ارفعه من صفحة توثيق الترخيص ليراجعه فريق المنصة. يمكنك الدفع الآن ويُحجز اشتراكك، ولا يُفعَّل إلا بعد اعتماد التوثيق، وتبدأ مدته من يوم الاعتماد. وإن لم يُعتمد التوثيق يُردّ المبلغ كاملاً.";
/** l18 review: the same, for a firm whose verification has not been started yet (the team verifies a firm). */
export const LICENCE_HELD_SUBMIT_FIRM_NOTE_AR =
  "لم يُستكمل توثيق مكتبك بعد: تواصل مع فريق المنصة لاستكماله. يمكنك الدفع الآن ويُحجز اشتراكك، ولا يُفعَّل إلا بعد اعتماد التوثيق، وتبدأ مدته من يوم الاعتماد. وإن لم يُعتمد التوثيق يُردّ المبلغ كاملاً.";
export const LICENCE_UNVERIFIED_PURCHASE_AR =
  "وثّق رخصتك أولاً: باقة المؤسس والباقات المهنية تُشترى بعد رفع توثيق الرخصة، وتُفعَّل بعد اعتماده.";
export const LICENCE_UNVERIFIED_FIRM_PURCHASE_AR =
  "يلزم توثيق مكتبك أولاً: باقات المكاتب تُشترى بعد رفع توثيق المكتب، وتُفعَّل بعد اعتماده.";
/** l18 review (٢٣٩ ruling): a rejected licence. */
export const LICENCE_RESUBMIT_PURCHASE_AR =
  "أعد تقديم التوثيق أولاً: لم يُعتمد توثيق رخصتك، فارفعه من جديد، وبعدها يمكنك الدفع ويُحجز اشتراكك حتى الاعتماد.";
export const LICENCE_RESUBMIT_FIRM_PURCHASE_AR =
  "أعد تقديم توثيق مكتبك أولاً: لم يُعتمد التوثيق، فتواصل مع فريق المنصة لإعادة تقديمه، وبعدها يمكنك الدفع ويُحجز اشتراكك حتى الاعتماد.";
/** l18 review (٢٣٩ ruling): a verified account whose licence's recorded expiry date has passed. */
export const LICENCE_EXPIRED_PURCHASE_AR =
  "جدّد رخصتك أولاً: انتهت صلاحية الرخصة المسجّلة في حسابك. حدّث بيانات الرخصة بعد تجديدها أو تواصل معنا، ثم أكمل الاشتراك.";
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

/**
 * The facts the licence rule reads: verifiedProvider's, plus (l18 review)
 *   licenceSubmitted  the lawyer's own licence image was uploaded
 *                     (lawyer_profiles.licence_image_path); undefined → not
 *                     read, taken as submitted;
 *   licenceExpiry     the recorded expiry date (YYYY-MM-DD) of the licence a
 *                     verified account stands on (its own lawyer row, or the
 *                     verified firm it owns); null / undefined → none recorded.
 */
export interface LicenceFacts extends VerifiedProviderFacts {
  licenceSubmitted?: boolean;
  licenceExpiry?: string | null;
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

export type LicenceDetail = "verified" | "expired" | "pending" | "none" | "rejected" | "suspended";

/** The day in Riyadh (UTC+3, no daylight saving), YYYY-MM-DD. */
function riyadhDay(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A recorded expiry date before today (Riyadh). An unreadable value never counts as expired. */
export function licenceExpired(expiry: string | null | undefined, now: Date): boolean {
  if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return false;
  return expiry.slice(0, 10) < riyadhDay(now);
}

/** The l18 review's finer standing (see the header). Null when the facts could not be read. */
export function licenceDetail(facts: LicenceFacts | null, now: Date = new Date()): LicenceDetail | null {
  if (!facts) return null;
  if (verifiedProviderDecision(facts).ok) return licenceExpired(facts.licenceExpiry, now) ? "expired" : "verified";
  if (facts.userType === "firm") {
    const owned = facts.ownedFirmStatuses;
    if (owned.includes("pending")) return "pending";
    if (owned.length === 0) return "none";
    return owned.includes("rejected") ? "rejected" : "suspended";
  }
  switch (facts.lawyerStatus) {
    case "pending":
      return facts.licenceSubmitted === false ? "none" : "pending";
    case "rejected":
      return "rejected";
    case "suspended":
      return "suspended";
    default:
      return "none";
  }
}

export type LicencePurchaseDecision =
  | { ok: true; held: boolean; submitLicence?: boolean }
  | { ok: false; status: 403 | 503; error: string; code?: string; verifyHref?: string | null };

const unverifiedRefusal = (userType: string): LicencePurchaseDecision =>
  userType === "firm"
    ? { ok: false, status: 403, error: LICENCE_UNVERIFIED_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null }
    : { ok: false, status: 403, error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: LICENCE_VERIFY_HREF };

const resubmitRefusal = (userType: string): LicencePurchaseDecision =>
  userType === "firm"
    ? { ok: false, status: 403, error: LICENCE_RESUBMIT_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null }
    : { ok: false, status: 403, error: LICENCE_RESUBMIT_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: LICENCE_VERIFY_HREF };

const expiredRefusal = (): LicencePurchaseDecision => ({
  ok: false, status: 403, error: LICENCE_EXPIRED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
});

/**
 * A PAID purchase (٢٣٩, the l18 review ruling): verified → go; pending → go,
 * held until approval; none → a plan goes held (submitLicence: the copy asks
 * for the licence), the founder membership is refused; rejected → «أعد تقديم
 * التوثيق أولاً»; suspended → «وثّق رخصتك أولاً»; expired → «جدّد رخصتك
 * أولاً»; unread → 503.
 */
export function licenceCheckoutDecision(
  userType: string,
  facts: LicenceFacts | null,
  opts: { itemKind?: string; now?: Date } = {},
): LicencePurchaseDecision {
  const detail = licenceDetail(facts, opts.now ?? new Date());
  if (detail === null) return { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR };
  if (detail === "verified") return { ok: true, held: false };
  if (detail === "pending") return { ok: true, held: true };
  if (detail === "none") return opts.itemKind === "membership" ? unverifiedRefusal(userType) : { ok: true, held: true, submitLicence: true };
  if (detail === "rejected") return resubmitRefusal(userType);
  if (detail === "expired") return expiredRefusal();
  return unverifiedRefusal(userType);
}

/** A FREE activation of a gated item: only a verified, unexpired licence; pending → 403 (the code stays unused). */
export function licenceFreeCodeDecision(userType: string, facts: LicenceFacts | null, now: Date = new Date()): LicencePurchaseDecision {
  const detail = licenceDetail(facts, now);
  if (detail === null) return { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR };
  if (detail === "verified") return { ok: true, held: false };
  if (detail === "pending") return { ok: false, status: 403, error: LICENCE_FREE_CODE_PENDING_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null };
  if (detail === "rejected") return resubmitRefusal(userType);
  if (detail === "expired") return expiredRefusal();
  return unverifiedRefusal(userType);
}

/**
 * The verification facts (service client, keyed on the session's user id),
 * with the licence's submission and expiry (l18 review); null on a failed read.
 */
export async function readLicenceFacts(admin: SupabaseClient, userId: string, userType: string): Promise<LicenceFacts | null> {
  const base = await readVerifiedProviderFacts(admin, userId, userType);
  if (!base || userType === "admin") return base;
  try {
    if (userType === "lawyer") {
      const { data, error } = await admin.from("lawyer_profiles").select("licence_image_path, license_expiry").eq("user_id", userId).maybeSingle();
      if (error) {
        console.error("[licenceGate] reading the licence failed:", error.code ?? "no-code");
        return null;
      }
      const row = data as { licence_image_path?: unknown; license_expiry?: unknown } | null;
      return {
        ...base,
        licenceSubmitted: typeof row?.licence_image_path === "string" && row.licence_image_path !== "",
        licenceExpiry: base.lawyerStatus === "verified" && typeof row?.license_expiry === "string" ? row.license_expiry : null,
      };
    }
    if (userType === "firm") {
      const { data, error } = await admin.from("firm_profiles").select("verification_status, license_expiry").eq("owner_user_id", userId);
      if (error) {
        console.error("[licenceGate] reading the firm licence failed:", error.code ?? "no-code");
        return null;
      }
      // the latest recorded expiry among the verified firms the account owns
      const expiries = ((data ?? []) as Array<{ verification_status?: unknown; license_expiry?: unknown }>)
        .filter((f) => f.verification_status === "verified" && typeof f.license_expiry === "string")
        .map((f) => String(f.license_expiry))
        .sort();
      return { ...base, licenceExpiry: expiries.length > 0 ? expiries[expiries.length - 1] : null };
    }
    return base;
  } catch (err) {
    console.error("[licenceGate] the licence read threw:", err instanceof Error ? err.name : "error");
    return null;
  }
}
