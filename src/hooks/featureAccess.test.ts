import test from "node:test";
import assert from "node:assert/strict";

import { resolveFeatureAccess, TIER_RANK, FEATURE_GATES, type FeatureAdminFlags } from "./featureAccess.ts";
import {
  DEFAULT_FEATURES,
  DEFAULT_FIRM_FEATURES,
  DEFAULT_SECTOR_PROFILES,
  DEFAULT_PLATFORM_FLAGS,
  MOCK_CURRENT_COMPANY_ID,
  MOCK_CURRENT_FIRM_ID,
  MOCK_CURRENT_GOVERNMENT_ID,
  MOCK_CURRENT_NGO_ID,
  MOCK_CURRENT_MICRO_ID,
} from "./useAdminSettingsHelper.ts";

/** Full, realistic admin-flags fixture — the scenario the mock company/firm
 *  switcher actually stores — with a couple of fields overridable per test. */
function makeAdminFlags(overrides: Partial<FeatureAdminFlags> = {}): FeatureAdminFlags {
  return {
    mounted: true,
    currentCompanyFeatures: DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID],
    currentFirmFeatures: DEFAULT_FIRM_FEATURES[MOCK_CURRENT_FIRM_ID],
    currentGovernmentProfile: DEFAULT_SECTOR_PROFILES.government[MOCK_CURRENT_GOVERNMENT_ID],
    currentNgoProfile: DEFAULT_SECTOR_PROFILES.ngo[MOCK_CURRENT_NGO_ID],
    currentMicroProfile: DEFAULT_SECTOR_PROFILES.micro[MOCK_CURRENT_MICRO_ID],
    platformFlags: DEFAULT_PLATFORM_FLAGS,
    ...overrides,
  };
}

test("production ignores the admin-flag block entirely — flag off, tier gate passes", () => {
  // "governance" sits in BOTH the admin-flag block (company.hasGovernance)
  // and FEATURE_GATES ("corp"). Disable the flag but give a corp tier: in
  // production nothing a viewer wrote to their own localStorage should be
  // able to hide the feature.
  const flags = makeAdminFlags({
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasGovernance: false },
  });
  assert.equal(resolveFeatureAccess("governance", "corp", flags, /* isProduction */ true), true);
});

test("demo mode honours the same admin flag the tier gate would have allowed", () => {
  // Identical inputs, isProduction:false — the disabled company flag must
  // still block access ahead of the tier gate, exactly as before this change.
  const flags = makeAdminFlags({
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasGovernance: false },
  });
  assert.equal(resolveFeatureAccess("governance", "corp", flags, /* isProduction */ false), false);
});

test("tier gate is unchanged by isProduction when the admin flag is enabled", () => {
  const flags = makeAdminFlags({
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasGovernance: true },
  });
  // free < corp (the minimum FEATURE_GATES tier for "governance") in both modes.
  assert.equal(resolveFeatureAccess("governance", "free", flags, true), false);
  assert.equal(resolveFeatureAccess("governance", "free", flags, false), false);
  // corp meets the gate in both modes once the flag is enabled.
  assert.equal(resolveFeatureAccess("governance", "corp", flags, true), true);
  assert.equal(resolveFeatureAccess("governance", "corp", flags, false), true);
});

test("a feature with no FEATURE_GATES entry falls through to unrestricted in production, regardless of the admin flag", () => {
  // "legal-library" is only ever gated by currentCompanyFeatures.hasLegalLibrary
  // — it has no FEATURE_GATES entry at all. In production the admin-flag
  // block is skipped, so `!minTier` is hit and access is unrestricted.
  const flags = makeAdminFlags({
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasLegalLibrary: false },
  });
  assert.equal(resolveFeatureAccess("legal-library", "free", flags, true), true);
  // Demo mode still honours the disabled flag.
  assert.equal(resolveFeatureAccess("legal-library", "free", flags, false), false);
});

test("demo mode before mount leaves the ~40 admin-flag checks inert (falls through to the tier gate)", () => {
  const flags = makeAdminFlags({
    mounted: false,
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasGovernance: false },
  });
  // Flag would block if consulted, but pre-mount it never fires — tier gate decides.
  assert.equal(resolveFeatureAccess("governance", "corp", flags, false), true);
});

test("the celebrity hydration guard fires identically in both modes before mount (no hydration mismatch)", () => {
  const flags = makeAdminFlags({ mounted: false, platformFlags: { hasCelebrityLayer: true } });
  assert.equal(resolveFeatureAccess("celebrity", "enterprise", flags, true), false);
  assert.equal(resolveFeatureAccess("celebrity", "enterprise", flags, false), false);
});

test("celebrity is unrestricted in production once mounted (no FEATURE_GATES entry, flags skipped)", () => {
  const flags = makeAdminFlags({ mounted: true, platformFlags: { hasCelebrityLayer: false } });
  assert.equal(resolveFeatureAccess("celebrity", "free", flags, true), true);
  // Demo mode still honours the disabled platform flag once mounted.
  assert.equal(resolveFeatureAccess("celebrity", "free", flags, false), false);
});

test("team-legal-department: production ignores hasInternalLegal, decides on tier alone", () => {
  // The business team page used to filter legal_manager/legal_staff rows by
  // reading currentCompanyFeatures.hasInternalLegal straight from the
  // localStorage-backed admin flags — a viewer could flip that key in
  // production. Now it goes through can("team-legal-department"), which in
  // production consults only the "pro" FEATURE_GATES entry.
  const flags = makeAdminFlags({
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasInternalLegal: false },
  });
  assert.equal(resolveFeatureAccess("team-legal-department", "pro", flags, /* isProduction */ true), true);
  assert.equal(resolveFeatureAccess("team-legal-department", "free", flags, /* isProduction */ true), false);
});

test("team-legal-department: demo mode still honours the hasInternalLegal flag ahead of the tier gate", () => {
  const flagsOff = makeAdminFlags({
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasInternalLegal: false },
  });
  assert.equal(resolveFeatureAccess("team-legal-department", "pro", flagsOff, /* isProduction */ false), false);

  const flagsOn = makeAdminFlags({
    currentCompanyFeatures: { ...DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID], hasInternalLegal: true },
  });
  assert.equal(resolveFeatureAccess("team-legal-department", "pro", flagsOn, /* isProduction */ false), true);
  // Tier gate still applies once the flag is on.
  assert.equal(resolveFeatureAccess("team-legal-department", "free", flagsOn, /* isProduction */ false), false);
});

test("firm-legal-library: production ignores hasLegalLibrary, free tier is unrestricted", () => {
  // FirmProfileReadinessPanel used to decide the "المكتبة القانونية" chip by
  // reading currentFirmFeatures.hasLegalLibrary directly. Now it goes through
  // can("firm-legal-library"), "free" tier like every other firm-* gate.
  const flags = makeAdminFlags({
    currentFirmFeatures: { ...DEFAULT_FIRM_FEATURES[MOCK_CURRENT_FIRM_ID], hasLegalLibrary: false },
  });
  assert.equal(resolveFeatureAccess("firm-legal-library", "free", flags, /* isProduction */ true), true);
});

test("firm-legal-library: demo mode still honours the hasLegalLibrary flag", () => {
  const flags = makeAdminFlags({
    currentFirmFeatures: { ...DEFAULT_FIRM_FEATURES[MOCK_CURRENT_FIRM_ID], hasLegalLibrary: false },
  });
  assert.equal(resolveFeatureAccess("firm-legal-library", "free", flags, /* isProduction */ false), false);
});

test("TIER_RANK and FEATURE_GATES are internally consistent for every gated key", () => {
  for (const [featureKey, minTier] of Object.entries(FEATURE_GATES)) {
    assert.ok(minTier in TIER_RANK, `FEATURE_GATES["${featureKey}"] references unknown tier "${minTier}"`);
  }
});
