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

// ─── Tier numeric ranking ──────────────────────────────────────────────────────
const TIER_RANK: Record<UserTier, number> = {
  free:       0,
  shield:     1,
  ai:         2,
  pro:        3,
  max:        4,
  corp:       5,
  enterprise: 6,
};

// ─── Feature → minimum tier required ─────────────────────────────────────────
const FEATURE_GATES: Record<string, UserTier> = {
  // Business / Corporate features
  governance:           "corp",
  "health-check":       "pro",
  "seconded-counsel":   "corp",
  "business-litigation":"pro",
  departments:          "corp",
  "hr-contracts":       "pro",
  "dept-reviews":       "pro",
  kanban:               "pro",
  "procedures-expert":  "ai",
  marketplace:          "shield",
  "team-manage":        "pro",
  finance:              "pro",
  reports:              "shield",
  wallet:               "free",
  reviews:              "free",
  hearings:             "pro",

  // Law firm B2B subscription features
  "firm-cases":         "free",
  "firm-team":          "free",
  "firm-departments":   "free",
  "firm-branches":      "free",
  "firm-finance":       "free",
  "firm-hr":            "free",
  "firm-governance":    "free",
  "firm-chinese-walls": "free",
  "firm-client-portal": "free",
  "firm-branding":      "free",
  "firm-marketplace":   "free",
  "firm-collaboration": "free",
  "firm-secondment":    "free",
  "firm-shared-rooms":  "free",
  "firm-ai":            "free",
  "firm-analytics":     "free",
  "firm-health-check":  "free",
  "firm-wallet":        "free",

  // Government sector gates — local Backend-ready entitlements
  "gov-judiciary":      "free",
  "gov-prosecution":    "free",
  "gov-investigation":  "free",
  "gov-police":         "free",
  "gov-counsel":        "free",
  "gov-compliance":     "free",
  "gov-reports":        "free",
  "gov-contracts":      "free",
  "gov-sso":            "free",
  "gov-ai":             "free",

  // NGO / Awqaf gates
  "ngo-volunteers":     "free",
  "ngo-donations":      "free",
  "ngo-awqaf":          "free",
  "ngo-board":          "free",
  "ngo-programs":       "free",
  "ngo-compliance":     "free",
  "ngo-reports":        "free",
  "ngo-ai":             "free",

  // Micro business gates
  "micro-requirements": "free",
  "micro-contracts":    "free",
  "micro-documents":    "free",
  "micro-wallet":       "free",
  "micro-requests":     "free",
  "micro-marketplace":  "free",
  "micro-cases":        "free",
  "micro-ai":           "free",

  // AI features
  "ai-consult":         "free",
  "ai-contracts":       "shield",
  "ai-corp":            "corp",
  "ai-gov":             "free",   // government users — free tier access to gov tools
  "ai-ngo":             "free",   // NGO users — free tier access to ngo tools
};

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

  function can(featureKey: string): boolean {
    // If Admin explicitly disabled the feature for this company, block access
    if (mounted) {
      if (featureKey === "seconded-counsel" && !currentCompanyFeatures.hasSecondment) return false;
      if (featureKey === "business-litigation" && !currentCompanyFeatures.hasLitigation) return false;
      if (featureKey === "marketplace" && !currentCompanyFeatures.hasMarketplace) return false;
      if (featureKey === "governance" && !currentCompanyFeatures.hasGovernance) return false;
      if (featureKey === "departments" && !currentCompanyFeatures.hasDepartments) return false;
      if (featureKey === "team-manage" && !currentCompanyFeatures.hasInternalLegal && !currentCompanyFeatures.hasDepartments) return false;
      if (featureKey === "hr-contracts" && !currentCompanyFeatures.hasHrFinanceAccess) return false;
      if (featureKey === "dept-reviews" && !currentCompanyFeatures.hasInternalLegal && !currentCompanyFeatures.hasDepartments) return false;
      if (featureKey === "reports" && !currentCompanyFeatures.hasHrFinanceAccess) return false;
      if (featureKey === "finance" && !currentCompanyFeatures.hasHrFinanceAccess) return false;
      if (featureKey === "ai-corp" && !currentCompanyFeatures.hasAiCorpTools) return false;
      if (featureKey === "legal-library" && !currentCompanyFeatures.hasLegalLibrary) return false;
      if (featureKey === "hearings" && !currentCompanyFeatures.hasLitigation) return false;
      if (featureKey === "celebrity" && !platformFlags.hasCelebrityLayer) return false;

      if (featureKey === "firm-departments" && !currentFirmFeatures.hasDepartments) return false;
      if (featureKey === "firm-branches" && !currentFirmFeatures.hasBranches) return false;
      if (featureKey === "firm-finance" && !currentFirmFeatures.hasFinance) return false;
      if (featureKey === "firm-hr" && !currentFirmFeatures.hasHr) return false;
      if (featureKey === "firm-governance" && !currentFirmFeatures.hasGovernance) return false;
      if (featureKey === "firm-chinese-walls" && !currentFirmFeatures.hasChineseWalls) return false;
      if (featureKey === "firm-client-portal" && !currentFirmFeatures.hasClientPortal) return false;
      if (featureKey === "firm-branding" && !currentFirmFeatures.hasBranding) return false;
      if (featureKey === "firm-marketplace" && !currentFirmFeatures.hasMarketplace) return false;
      if (featureKey === "firm-collaboration" && !currentFirmFeatures.hasExternalCollaboration) return false;
      if (featureKey === "firm-secondment" && !currentFirmFeatures.hasSecondment) return false;
      if (featureKey === "firm-shared-rooms" && !currentFirmFeatures.hasSharedRooms) return false;
      if (featureKey === "firm-ai" && !currentFirmFeatures.hasAdvancedAi) return false;
      if (featureKey === "firm-analytics" && !currentFirmFeatures.hasAnalytics) return false;
      if (featureKey === "firm-health-check" && !currentFirmFeatures.hasHealthCheck) return false;
      if (featureKey === "firm-wallet" && !currentFirmFeatures.hasFirmPointsWallet) return false;

      if (featureKey === "gov-judiciary" && !currentGovernmentProfile.hasJudiciary) return false;
      if (featureKey === "gov-prosecution" && !currentGovernmentProfile.hasProsecution) return false;
      if (featureKey === "gov-investigation" && !currentGovernmentProfile.hasInvestigation) return false;
      if (featureKey === "gov-police" && !currentGovernmentProfile.hasPolice) return false;
      if (featureKey === "gov-counsel" && !currentGovernmentProfile.hasCounsel) return false;
      if (featureKey === "gov-compliance" && !currentGovernmentProfile.hasCompliance) return false;
      if (featureKey === "gov-reports" && !currentGovernmentProfile.hasReports) return false;
      if (featureKey === "gov-contracts" && !currentGovernmentProfile.hasContracts) return false;
      if (featureKey === "gov-sso" && !currentGovernmentProfile.hasSso) return false;
      if (featureKey === "gov-ai" && !currentGovernmentProfile.hasAiByRole) return false;

      if (featureKey === "ngo-volunteers" && !currentNgoProfile.hasVolunteers) return false;
      if (featureKey === "ngo-donations" && !currentNgoProfile.hasDonations) return false;
      if (featureKey === "ngo-awqaf" && !currentNgoProfile.hasAwqaf) return false;
      if (featureKey === "ngo-board" && !currentNgoProfile.hasBoard) return false;
      if (featureKey === "ngo-programs" && !currentNgoProfile.hasPrograms) return false;
      if (featureKey === "ngo-compliance" && !currentNgoProfile.hasCompliance) return false;
      if (featureKey === "ngo-reports" && !currentNgoProfile.hasReports) return false;
      if (featureKey === "ngo-ai" && !currentNgoProfile.hasAi) return false;

      if (featureKey === "micro-requirements" && !currentMicroProfile.hasRequirements) return false;
      if (featureKey === "micro-contracts" && !currentMicroProfile.hasContracts) return false;
      if (featureKey === "micro-documents" && !currentMicroProfile.hasDocuments) return false;
      if (featureKey === "micro-wallet" && !currentMicroProfile.hasWallet) return false;
      if (featureKey === "micro-requests" && !currentMicroProfile.hasRequests) return false;
      if (featureKey === "micro-marketplace" && !currentMicroProfile.hasMarketplace) return false;
      if (featureKey === "micro-cases" && !currentMicroProfile.hasCases) return false;
      if (featureKey === "micro-ai" && !currentMicroProfile.hasAi) return false;
    }
    if (featureKey === "celebrity" && !mounted) return false;

    const minTier = FEATURE_GATES[featureKey];
    if (!minTier) return true; // unknown feature = unrestricted
    return tierRank >= TIER_RANK[minTier];
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
