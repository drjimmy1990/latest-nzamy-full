/**
 * currentPlanLabel.ts — the name «باقتك الحالية» shows in Settings →
 * «الاشتراك والباقة».
 *
 * The tier alone is ambiguous: `pro` is «الباقة الوقائية» for an individual,
 * «المحامي المحترف» for a lawyer and «المستشار القانوني المستقل» for an
 * independent consultant. So the label is the plan the account's own family
 * actually sells for that tier — its `labelAr` in the online-payment catalog
 * (src/lib/payments/catalog.ts PAYABLE_ITEMS) — and the generic tier name
 * (TIER_LABELS_AR) only when no sold plan matches.
 *
 * Pure: relative imports only, so `node --test` loads it
 * (currentPlanLabel.test.ts).
 */
import { resolveItem } from "../payments/catalog.ts";
import { TIER_LABELS_AR } from "../../hooks/featureAccess.ts";
import type { PracticeKind } from "../auth/practiceKind.ts";
import type { UserTier } from "../../hooks/useUser.ts";
import type { UserType } from "../../types/database.ts";

type SoldTier = Partial<Record<UserTier, string>>;

/** Account type → tier → the catalog item its family sells for that tier. */
const SOLD_PLAN_ID: Partial<Record<UserType, SoldTier>> = {
  firm:       { corp: "firm-basic", enterprise: "firm-enterprise" },
  individual: { ai: "ind-ai", pro: "ind-preventive", max: "ind-litigation" },
  lawyer:     { pro: "lawyer-pro" },
};

/** A `lawyer` account whose practice kind is 'consultant' (Art. 18). */
const CONSULTANT_SOLD_PLAN_ID: SoldTier = { pro: "consultant-independent" };

export function currentPlanLabelAr(
  userType: UserType | null | undefined,
  practiceKind: PracticeKind | null | undefined,
  tier: UserTier,
): string {
  const table =
    userType === "lawyer" && practiceKind === "consultant"
      ? CONSULTANT_SOLD_PLAN_ID
      : userType
        ? SOLD_PLAN_ID[userType]
        : undefined;
  const itemId = table?.[tier];
  // resolve, not sell: a holder of a retired plan still sees its name
  const item = itemId ? resolveItem(itemId) : undefined;
  return item?.labelAr ?? TIER_LABELS_AR[tier];
}
