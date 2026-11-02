/**
 * useSubscription — Subscription tier gating hook
 * ─────────────────────────────────────────────────────────
 * Reads the user's current tier and returns feature availability.
 *
 * TIERS (ascending access):
 *   free < shield < ai < pro < max < corp < enterprise
 *
 * USAGE in Sidebar / components:
 *   const { can } = useSubscription();
 *   if (!can("governance")) → show UpgradeBadge
 */

"use client";

import { useUser, type UserTier } from "@/hooks/useUser";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { isSupabaseMode } from "@/lib/services/api";
import { TIER_RANK, FEATURE_GATES, TIER_LABELS_AR, resolveFeatureAccess, lockTierLabelAr } from "@/hooks/featureAccess";

// ─── Tier → Arabic label ───────────────────────────────────────────────────────
// The one canonical copy lives in ./featureAccess.ts (pure, so `node --test`
// loads it — src/lib/pricing/currentPlanLabel.ts falls back to it) and is
// re-exported here, so `import { TIER_LABELS_AR } from "@/hooks/useSubscription"`
// keeps working.
export { TIER_LABELS_AR };

/** Arabic label for a LOCK's minimum tier (its one caller is the sidebar's
 *  UpgradeBadge). Never prints a raw English key, and never names a plan
 *  nothing sells (Wave 1 task 6, H: shield) — both fall back to a generic
 *  upgrade word. A holder's own plan name comes from currentPlanLabel.ts. */
export function tierLabelAr(tier: string): string {
  return lockTierLabelAr(tier) ?? "ترقية";
}

// ─── Feature → minimum tier required ─────────────────────────────────────────
// Moved to ./featureAccess.ts (re-exported below) so it can be unit-tested
// without a React/DOM runtime — see resolveFeatureAccess.

export interface SubscriptionState {
  tier: UserTier;
  tierRank: number;
  /** Returns true if the current tier can access the given feature key */
  can: (featureKey: string) => boolean;
  /** Returns the minimum tier label required for a feature (for upgrade badge copy) */
  requiredTier: (featureKey: string) => UserTier | null;
  /** Returns true if the user should see an upgrade nudge for this feature */
  shouldUpgrade: (featureKey: string) => boolean;
  /** Returns true if the user is in demo mode (for demo-specific UI hints) */
  isDemo: boolean;
}

export function useSubscription(): SubscriptionState {
  const user = useUser();
  const tier = user.tier ?? "free";
  const tierRank = TIER_RANK[tier] ?? 0;

  const {
    currentCompanyFeatures,
    currentFirmFeatures,
    currentGovernmentProfile,
    currentNgoProfile,
    currentMicroProfile,
    platformFlags,
    mounted,
  } = useAdminSettings();

  // Production (Supabase mode) MUST NOT let the browser-local admin/demo
  // overrides below decide real access — see resolveFeatureAccess for why
  // and for the byte-for-byte-preserved demo-mode logic.
  function can(featureKey: string): boolean {
    return resolveFeatureAccess(
      featureKey,
      tier,
      {
        mounted,
        currentCompanyFeatures,
        currentFirmFeatures,
        currentGovernmentProfile,
        currentNgoProfile,
        currentMicroProfile,
        platformFlags,
      },
      isSupabaseMode,
    );
  }

  function requiredTier(featureKey: string): UserTier | null {
    const minTier = FEATURE_GATES[featureKey];
    if (!minTier) return null;
    if (can(featureKey)) return null;
    return minTier;
  }

  function shouldUpgrade(featureKey: string): boolean {
    return !can(featureKey);
  }

  return { tier, tierRank, can, requiredTier, shouldUpgrade, isDemo: tier === "free" };
}
