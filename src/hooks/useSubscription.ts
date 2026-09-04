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
import { TIER_RANK, FEATURE_GATES, resolveFeatureAccess } from "@/hooks/featureAccess";

// ─── Tier → Arabic label ───────────────────────────────────────────────────────
// The one canonical copy. Previously duplicated as a local literal inside
// SubscriptionGuard.tsx (still is — that copy is CRITICAL risk to touch, see
// its own file); every NEW caller should read from here instead of adding a
// third copy.
export const TIER_LABELS_AR: Record<UserTier, string> = {
  free:       "المجانية",
  shield:     "التأمين القانوني",
  ai:         "نظامي AI",
  pro:        "الاحترافية",
  max:        "الماكس",
  corp:       "حوكمة الشركات",
  enterprise: "الشركات المتكاملة",
};

/** Arabic label for a tier key that may not be a known `UserTier` (e.g. read
 *  off a route/config value rather than the session). Never prints a raw
 *  English key — falls back to a generic upgrade word. */
export function tierLabelAr(tier: string): string {
  return TIER_LABELS_AR[tier as UserTier] ?? "ترقية";
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
