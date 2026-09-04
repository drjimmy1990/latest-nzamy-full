/**
 * featureAccess — pure feature-gate resolution behind useSubscription().can()
 * ─────────────────────────────────────────────────────────────────────────
 * Split out of useSubscription.ts so the decision logic can be unit-tested
 * with plain `node --test`: every import below is either relative or
 * `import type` (erased at build time, including by Node's own type
 * stripping — no React, no localStorage, no "@/" path-alias runtime
 * resolution required to exercise it).
 */

import type { UserTier } from "@/hooks/useUser";
import type {
  CompanyFeatures,
  FirmFeatures,
  GovernmentSectorFeatures,
  NgoSectorFeatures,
  MicroSectorFeatures,
  PlatformFeatureFlags,
} from "@/hooks/useAdminSettingsHelper";

// ─── Tier numeric ranking ──────────────────────────────────────────────────────
export const TIER_RANK: Record<UserTier, number> = {
  free:       0,
  shield:     1,
  ai:         2,
  pro:        3,
  max:        4,
  corp:       5,
  enterprise: 6,
};

// ─── Feature → minimum tier required ─────────────────────────────────────────
export const FEATURE_GATES: Record<string, UserTier> = {
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
  "team-legal-department": "pro", // legal_manager/legal_staff roster rows on the team page — same tier as the hasInternalLegal-gated siblings above (team-manage, hr-contracts, dept-reviews)
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
  "firm-legal-library": "free", // matches every other firm-* gate — no server entitlement truth yet

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

  // Library access gates
  "library-full-access":    "pro",   // Full access to all library content
  "library-advanced-search":"ai",    // Advanced search & filtering
};

/**
 * The ~40 browser-local admin/demo-scenario overrides `can()` used to
 * consult ahead of the tier gate — read from localStorage by
 * useAdminSettings (mock company/firm/sector-profile scenario switcher).
 * Anyone can flip these in their own devtools, so `resolveFeatureAccess`
 * only ever applies them when `isProduction` is false.
 */
export interface FeatureAdminFlags {
  /** False until useAdminSettings' mount effect has read localStorage — the
   *  SSR/first-paint value, identical on server and client. */
  mounted: boolean;
  currentCompanyFeatures: CompanyFeatures;
  currentFirmFeatures: FirmFeatures;
  currentGovernmentProfile: GovernmentSectorFeatures;
  currentNgoProfile: NgoSectorFeatures;
  currentMicroProfile: MicroSectorFeatures;
  platformFlags: PlatformFeatureFlags;
}

/**
 * Decide whether `tier` may access `featureKey`.
 *
 * - Production (Supabase mode, `isProduction: true`): `adminFlags` is
 *   ignored outright — only the tier gate (`FEATURE_GATES`) decides.
 *   Nothing a viewer can write into their own browser's localStorage
 *   changes the answer.
 * - Demo mode (`isProduction: false`): reproduces the original `can()`
 *   byte-for-byte — the admin/demo-scenario overrides in `adminFlags` can
 *   still hide a feature ahead of the tier gate, once `mounted`.
 *
 * The one line outside the `isProduction` branch (`celebrity` + `!mounted`)
 * is a hydration guard, not a demo override: it renders the same `false`
 * on the server and on the client's first paint in EITHER mode, so
 * switching backends never produces a React hydration mismatch on this key.
 */
export function resolveFeatureAccess(
  featureKey: string,
  tier: UserTier,
  adminFlags: FeatureAdminFlags,
  isProduction: boolean,
): boolean {
  const tierRank = TIER_RANK[tier] ?? 0;

  if (!isProduction) {
    const {
      mounted,
      currentCompanyFeatures,
      currentFirmFeatures,
      currentGovernmentProfile,
      currentNgoProfile,
      currentMicroProfile,
      platformFlags,
    } = adminFlags;

    // If Admin explicitly disabled the feature for this company, block access
    if (mounted) {
      if (featureKey === "seconded-counsel" && !currentCompanyFeatures.hasSecondment) return false;
      if (featureKey === "business-litigation" && !currentCompanyFeatures.hasLitigation) return false;
      if (featureKey === "marketplace" && !currentCompanyFeatures.hasMarketplace) return false;
      if (featureKey === "governance" && !currentCompanyFeatures.hasGovernance) return false;
      if (featureKey === "departments" && !currentCompanyFeatures.hasDepartments) return false;
      if (featureKey === "team-manage" && !currentCompanyFeatures.hasInternalLegal && !currentCompanyFeatures.hasDepartments) return false;
      if (featureKey === "team-legal-department" && !currentCompanyFeatures.hasInternalLegal) return false;
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
      if (featureKey === "firm-legal-library" && !currentFirmFeatures.hasLegalLibrary) return false;

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
  }
  if (featureKey === "celebrity" && !adminFlags.mounted) return false;

  const minTier = FEATURE_GATES[featureKey];
  if (!minTier) return true; // unknown feature = unrestricted
  return tierRank >= TIER_RANK[minTier];
}
