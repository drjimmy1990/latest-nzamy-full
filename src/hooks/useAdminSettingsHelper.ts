"use client";

import type {
  BusinessCompanySize,
  BusinessLegalStructure,
  BusinessServiceModel,
} from "@/types/businessBackendReady";
import type {
  FirmPlanId,
  FirmPracticeModel,
  FirmSize,
  FirmStructure,
} from "@/types/firmBackendReady";
import type {
  GovernmentEntityType,
  GovernmentPlanId,
  MicroBusinessType,
  MicroPlanId,
  NgoOrganizationType,
  NgoPlanId,
} from "@/types/sectorBackendReady";

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface CompanyFeatures {
  companyId: string;
  profileScenarioId: string;
  companySize: BusinessCompanySize;
  legalStructure: BusinessLegalStructure;
  serviceModel: BusinessServiceModel;
  hasInternalLegal: boolean;
  hasLegalAdvisor: boolean;
  hasDepartments: boolean;
  hasHrFinanceAccess: boolean;
  hasAiCorpTools: boolean;
  hasLegalLibrary: boolean;
  hasCommunitySupervisors: boolean;
  hasSecondment: boolean;
  hasLitigation: boolean;
  hasMarketplace: boolean;
  hasGovernance: boolean;
}

export interface FirmFeatures {
  firmId: string;
  profileScenarioId: string;
  firmSize: FirmSize;
  structure: FirmStructure;
  practiceModel: FirmPracticeModel;
  plan: FirmPlanId;
  baseSeats: number;
  activeSeats: number;
  annualPoints: number;
  availablePoints: number;
  hasDepartments: boolean;
  hasBranches: boolean;
  hasFinance: boolean;
  hasHr: boolean;
  hasGovernance: boolean;
  hasChineseWalls: boolean;
  hasClientPortal: boolean;
  hasBranding: boolean;
  hasMarketplace: boolean;
  hasExternalCollaboration: boolean;
  hasSecondment: boolean;
  hasSharedRooms: boolean;
  hasAdvancedAi: boolean;
  hasFirmMemory: boolean;
  hasLegalLibrary: boolean;
  hasProviderAddons: boolean;
  hasAnalytics: boolean;
  hasHealthCheck: boolean;
  hasFirmPointsWallet: boolean;
}

export interface GovernmentSectorFeatures {
  governmentId: string;
  profileScenarioId: string;
  entityType: GovernmentEntityType;
  departmentName: string;
  plan: GovernmentPlanId;
  activeUsers: number;
  hasJudiciary: boolean;
  hasProsecution: boolean;
  hasInvestigation: boolean;
  hasPolice: boolean;
  hasCounsel: boolean;
  hasCompliance: boolean;
  hasReports: boolean;
  hasContracts: boolean;
  hasSso: boolean;
  hasAiByRole: boolean;
}

export interface NgoSectorFeatures {
  ngoId: string;
  profileScenarioId: string;
  organizationType: NgoOrganizationType;
  plan: NgoPlanId;
  activeVolunteers: number;
  volunteersLimit: number;
  programsCount: number;
  boardSeats: number;
  hasVolunteers: boolean;
  hasDonations: boolean;
  hasAwqaf: boolean;
  hasBoard: boolean;
  hasPrograms: boolean;
  hasCompliance: boolean;
  hasReports: boolean;
  hasAi: boolean;
}

export interface MicroSectorFeatures {
  microId: string;
  profileScenarioId: string;
  businessType: MicroBusinessType;
  plan: MicroPlanId;
  employeesCount: number;
  licensesCount: number;
  requirementsScore: number;
  hasRequirements: boolean;
  hasContracts: boolean;
  hasDocuments: boolean;
  hasWallet: boolean;
  hasRequests: boolean;
  hasMarketplace: boolean;
  hasCases: boolean;
  hasAi: boolean;
}

export interface SectorProfilesState {
  government: Record<string, GovernmentSectorFeatures>;
  ngo: Record<string, NgoSectorFeatures>;
  micro: Record<string, MicroSectorFeatures>;
}

export interface PlatformFeatureFlags {
  hasCelebrityLayer: boolean;
}

// ─── Default values ──────────────────────────────────────────────────────────
export const DEFAULT_FEATURES: Record<string, CompanyFeatures> = {
  "C-001": {
    companyId: "C-001",
    profileScenarioId: "large-legal-dept",
    companySize: "large",
    legalStructure: "legal_department",
    serviceModel: "platform_and_litigation",
    hasInternalLegal: true,
    hasLegalAdvisor: true,
    hasDepartments: true,
    hasHrFinanceAccess: true,
    hasAiCorpTools: true,
    hasLegalLibrary: true,
    hasCommunitySupervisors: true,
    hasSecondment: true,
    hasLitigation: true,
    hasMarketplace: true,
    hasGovernance: true,
  },
  "C-002": {
    companyId: "C-002",
    profileScenarioId: "small-external-counsel",
    companySize: "small",
    legalStructure: "external_counsel",
    serviceModel: "platform_and_litigation",
    hasInternalLegal: false,
    hasLegalAdvisor: false,
    hasDepartments: false,
    hasHrFinanceAccess: true,
    hasAiCorpTools: false,
    hasLegalLibrary: true,
    hasCommunitySupervisors: false,
    hasSecondment: false,
    hasLitigation: true,
    hasMarketplace: true,
    hasGovernance: false,
  },
  "C-003": {
    companyId: "C-003",
    profileScenarioId: "medium-internal-advisor",
    companySize: "medium",
    legalStructure: "internal_advisor",
    serviceModel: "platform_only",
    hasInternalLegal: true,
    hasLegalAdvisor: true,
    hasDepartments: true,
    hasHrFinanceAccess: true,
    hasAiCorpTools: true,
    hasLegalLibrary: true,
    hasCommunitySupervisors: false,
    hasSecondment: false,
    hasLitigation: false,
    hasMarketplace: false,
    hasGovernance: true,
  },
  "C-004": {
    companyId: "C-004",
    profileScenarioId: "owner-only-service",
    companySize: "owner_only",
    legalStructure: "owner_managed",
    serviceModel: "advisory_only",
    hasInternalLegal: false,
    hasLegalAdvisor: false,
    hasDepartments: false,
    hasHrFinanceAccess: false,
    hasAiCorpTools: false,
    hasLegalLibrary: true,
    hasCommunitySupervisors: false,
    hasSecondment: false,
    hasLitigation: false,
    hasMarketplace: true,
    hasGovernance: false,
  },
  "C-005": {
    companyId: "C-005",
    profileScenarioId: "enterprise-hybrid",
    companySize: "enterprise",
    legalStructure: "hybrid",
    serviceModel: "secondment",
    hasInternalLegal: true,
    hasLegalAdvisor: true,
    hasDepartments: true,
    hasHrFinanceAccess: true,
    hasAiCorpTools: true,
    hasLegalLibrary: true,
    hasCommunitySupervisors: true,
    hasSecondment: true,
    hasLitigation: true,
    hasMarketplace: true,
    hasGovernance: true,
  },
};

export const DEFAULT_PLATFORM_FLAGS: PlatformFeatureFlags = {
  hasCelebrityLayer: false,
};

export const DEFAULT_FIRM_FEATURES: Record<string, FirmFeatures> = {
  "F-001": {
    firmId: "F-001",
    profileScenarioId: "mid-practice-departments",
    firmSize: "mid_firm",
    structure: "practice_departments",
    practiceModel: "full_service",
    plan: "firm-growth",
    baseSeats: 10,
    activeSeats: 14,
    annualPoints: 120000,
    availablePoints: 74200,
    hasDepartments: true,
    hasBranches: false,
    hasFinance: true,
    hasHr: true,
    hasGovernance: true,
    hasChineseWalls: false,
    hasClientPortal: true,
    hasBranding: true,
    hasMarketplace: true,
    hasExternalCollaboration: true,
    hasSecondment: false,
    hasSharedRooms: true,
    hasAdvancedAi: true,
    hasFirmMemory: true,
    hasLegalLibrary: true,
    hasProviderAddons: true,
    hasAnalytics: true,
    hasHealthCheck: true,
    hasFirmPointsWallet: true,
  },
  "F-002": {
    firmId: "F-002",
    profileScenarioId: "solo-office-basic",
    firmSize: "solo_office",
    structure: "single_partner",
    practiceModel: "boutique",
    plan: "firm-basic",
    baseSeats: 3,
    activeSeats: 3,
    annualPoints: 30000,
    availablePoints: 8200,
    hasDepartments: false,
    hasBranches: false,
    hasFinance: false,
    hasHr: false,
    hasGovernance: false,
    hasChineseWalls: false,
    hasClientPortal: true,
    hasBranding: false,
    hasMarketplace: true,
    hasExternalCollaboration: false,
    hasSecondment: false,
    hasSharedRooms: false,
    hasAdvancedAi: false,
    hasFirmMemory: false,
    hasLegalLibrary: true,
    hasProviderAddons: false,
    hasAnalytics: false,
    hasHealthCheck: false,
    hasFirmPointsWallet: true,
  },
  "F-003": {
    firmId: "F-003",
    profileScenarioId: "large-multi-branch-scale",
    firmSize: "large_firm",
    structure: "multi_branch",
    practiceModel: "mixed",
    plan: "firm-scale",
    baseSeats: 25,
    activeSeats: 42,
    annualPoints: 360000,
    availablePoints: 221500,
    hasDepartments: true,
    hasBranches: true,
    hasFinance: true,
    hasHr: true,
    hasGovernance: true,
    hasChineseWalls: true,
    hasClientPortal: true,
    hasBranding: true,
    hasMarketplace: true,
    hasExternalCollaboration: true,
    hasSecondment: true,
    hasSharedRooms: true,
    hasAdvancedAi: true,
    hasFirmMemory: true,
    hasLegalLibrary: true,
    hasProviderAddons: true,
    hasAnalytics: true,
    hasHealthCheck: true,
    hasFirmPointsWallet: true,
  },
};

export const DEFAULT_SECTOR_PROFILES: SectorProfilesState = {
  government: {
    "G-001": {
      governmentId: "G-001",
      profileScenarioId: "gov-justice-mixed",
      entityType: "court",
      departmentName: "الدائرة العدلية التجريبية",
      plan: "gov-department",
      activeUsers: 38,
      hasJudiciary: true,
      hasProsecution: true,
      hasInvestigation: true,
      hasPolice: false,
      hasCounsel: true,
      hasCompliance: true,
      hasReports: true,
      hasContracts: true,
      hasSso: false,
      hasAiByRole: true,
    },
    "G-002": {
      governmentId: "G-002",
      profileScenarioId: "gov-police-investigation",
      entityType: "police",
      departmentName: "إدارة الضبط والتحقيق",
      plan: "gov-eval",
      activeUsers: 18,
      hasJudiciary: false,
      hasProsecution: false,
      hasInvestigation: true,
      hasPolice: true,
      hasCounsel: false,
      hasCompliance: true,
      hasReports: true,
      hasContracts: false,
      hasSso: false,
      hasAiByRole: true,
    },
    "G-003": {
      governmentId: "G-003",
      profileScenarioId: "gov-counsel-compliance",
      entityType: "ministry",
      departmentName: "الإدارة القانونية والعقود",
      plan: "gov-enterprise",
      activeUsers: 124,
      hasJudiciary: false,
      hasProsecution: false,
      hasInvestigation: false,
      hasPolice: false,
      hasCounsel: true,
      hasCompliance: true,
      hasReports: true,
      hasContracts: true,
      hasSso: true,
      hasAiByRole: true,
    },
  },
  ngo: {
    "N-001": {
      ngoId: "N-001",
      profileScenarioId: "ngo-charity-impact",
      organizationType: "charity",
      plan: "ngo-impact",
      activeVolunteers: 48,
      volunteersLimit: 120,
      programsCount: 7,
      boardSeats: 7,
      hasVolunteers: true,
      hasDonations: true,
      hasAwqaf: false,
      hasBoard: true,
      hasPrograms: true,
      hasCompliance: true,
      hasReports: true,
      hasAi: true,
    },
    "N-002": {
      ngoId: "N-002",
      profileScenarioId: "ngo-waqf-institutional",
      organizationType: "waqf",
      plan: "ngo-institutional",
      activeVolunteers: 16,
      volunteersLimit: 60,
      programsCount: 4,
      boardSeats: 9,
      hasVolunteers: true,
      hasDonations: true,
      hasAwqaf: true,
      hasBoard: true,
      hasPrograms: true,
      hasCompliance: true,
      hasReports: true,
      hasAi: true,
    },
    "N-003": {
      ngoId: "N-003",
      profileScenarioId: "ngo-charity-impact",
      organizationType: "campaign",
      plan: "ngo-free",
      activeVolunteers: 8,
      volunteersLimit: 20,
      programsCount: 1,
      boardSeats: 3,
      hasVolunteers: true,
      hasDonations: false,
      hasAwqaf: false,
      hasBoard: false,
      hasPrograms: true,
      hasCompliance: true,
      hasReports: false,
      hasAi: false,
    },
  },
  micro: {
    "M-001": {
      microId: "M-001",
      profileScenarioId: "micro-simple-shield",
      businessType: "retail",
      plan: "micro-shield",
      employeesCount: 6,
      licensesCount: 4,
      requirementsScore: 82,
      hasRequirements: true,
      hasContracts: true,
      hasDocuments: true,
      hasWallet: true,
      hasRequests: true,
      hasMarketplace: true,
      hasCases: true,
      hasAi: true,
    },
    "M-002": {
      microId: "M-002",
      profileScenarioId: "micro-simple-shield",
      businessType: "restaurant",
      plan: "micro-free",
      employeesCount: 3,
      licensesCount: 2,
      requirementsScore: 66,
      hasRequirements: true,
      hasContracts: true,
      hasDocuments: true,
      hasWallet: false,
      hasRequests: true,
      hasMarketplace: true,
      hasCases: false,
      hasAi: false,
    },
  },
};

// ─── Constants IDs ───────────────────────────────────────────────────────────
export const MOCK_CURRENT_COMPANY_ID = "C-001";
export const MOCK_CURRENT_FIRM_ID = "F-001";
export const MOCK_CURRENT_GOVERNMENT_ID = "G-001";
export const MOCK_CURRENT_NGO_ID = "N-001";
export const MOCK_CURRENT_MICRO_ID = "M-001";

// ─── Types for storage ────────────────────────────────────────────────────────
export type StoredCompanyFeatures = Partial<CompanyFeatures> & { companyId?: string };
export type StoredFirmFeatures = Partial<FirmFeatures> & { firmId?: string };
export type StoredGovernmentFeatures = Partial<GovernmentSectorFeatures> & { governmentId?: string };
export type StoredNgoFeatures = Partial<NgoSectorFeatures> & { ngoId?: string };
export type StoredMicroFeatures = Partial<MicroSectorFeatures> & { microId?: string };

// ─── Helper functions ─────────────────────────────────────────────────────────
export function buildDefaultCompanyFeatures(companyId: string): CompanyFeatures {
  return {
    companyId,
    profileScenarioId: "owner-only-service",
    companySize: "owner_only",
    legalStructure: "owner_managed",
    serviceModel: "advisory_only",
    hasInternalLegal: false,
    hasLegalAdvisor: false,
    hasDepartments: false,
    hasHrFinanceAccess: false,
    hasAiCorpTools: false,
    hasLegalLibrary: true,
    hasCommunitySupervisors: false,
    hasSecondment: false,
    hasLitigation: false,
    hasMarketplace: true,
    hasGovernance: false,
  };
}

export function normalizeCompanyFeatures(raw: Record<string, StoredCompanyFeatures> | null): Record<string, CompanyFeatures> {
  const next: Record<string, CompanyFeatures> = { ...DEFAULT_FEATURES };
  if (!raw) return next;

  Object.entries(raw).forEach(([companyId, value]) => {
    const fallback = DEFAULT_FEATURES[companyId] ?? buildDefaultCompanyFeatures(companyId);
    next[companyId] = { ...fallback, ...value, companyId };
  });

  return next;
}

export function readStoredCompanyFeatures(): Record<string, CompanyFeatures> {
  const stored = localStorage.getItem("nzamy_admin_features");
  if (!stored) return DEFAULT_FEATURES;

  try {
    return normalizeCompanyFeatures(JSON.parse(stored) as Record<string, StoredCompanyFeatures>);
  } catch {
    return DEFAULT_FEATURES;
  }
}

export function buildDefaultFirmFeatures(firmId: string): FirmFeatures {
  return {
    firmId,
    profileScenarioId: "solo-office-basic",
    firmSize: "solo_office",
    structure: "single_partner",
    practiceModel: "boutique",
    plan: "firm-basic",
    baseSeats: 3,
    activeSeats: 3,
    annualPoints: 30000,
    availablePoints: 30000,
    hasDepartments: false,
    hasBranches: false,
    hasFinance: false,
    hasHr: false,
    hasGovernance: false,
    hasChineseWalls: false,
    hasClientPortal: true,
    hasBranding: false,
    hasMarketplace: true,
    hasExternalCollaboration: false,
    hasSecondment: false,
    hasSharedRooms: false,
    hasAdvancedAi: false,
    hasFirmMemory: false,
    hasLegalLibrary: true,
    hasProviderAddons: false,
    hasAnalytics: false,
    hasHealthCheck: false,
    hasFirmPointsWallet: true,
  };
}

export function normalizeFirmFeatures(raw: Record<string, StoredFirmFeatures> | null): Record<string, FirmFeatures> {
  const next: Record<string, FirmFeatures> = { ...DEFAULT_FIRM_FEATURES };
  if (!raw) return next;

  Object.entries(raw).forEach(([firmId, value]) => {
    const fallback = DEFAULT_FIRM_FEATURES[firmId] ?? buildDefaultFirmFeatures(firmId);
    next[firmId] = { ...fallback, ...value, firmId };
  });

  return next;
}

export function readStoredFirmFeatures(): Record<string, FirmFeatures> {
  const stored = localStorage.getItem("nzamy_admin_firm_features");
  if (!stored) return DEFAULT_FIRM_FEATURES;

  try {
    return normalizeFirmFeatures(JSON.parse(stored) as Record<string, StoredFirmFeatures>);
  } catch {
    return DEFAULT_FIRM_FEATURES;
  }
}

export function buildDefaultGovernmentFeatures(governmentId: string): GovernmentSectorFeatures {
  return {
    governmentId,
    profileScenarioId: "gov-counsel-compliance",
    entityType: "public_authority",
    departmentName: "إدارة قانونية حكومية",
    plan: "gov-eval",
    activeUsers: 5,
    hasJudiciary: false,
    hasProsecution: false,
    hasInvestigation: false,
    hasPolice: false,
    hasCounsel: true,
    hasCompliance: true,
    hasReports: true,
    hasContracts: true,
    hasSso: false,
    hasAiByRole: true,
  };
}

export function buildDefaultNgoFeatures(ngoId: string): NgoSectorFeatures {
  return {
    ngoId,
    profileScenarioId: "ngo-charity-impact",
    organizationType: "charity",
    plan: "ngo-free",
    activeVolunteers: 0,
    volunteersLimit: 20,
    programsCount: 1,
    boardSeats: 3,
    hasVolunteers: true,
    hasDonations: false,
    hasAwqaf: false,
    hasBoard: false,
    hasPrograms: true,
    hasCompliance: true,
    hasReports: false,
    hasAi: false,
  };
}

export function buildDefaultMicroFeatures(microId: string): MicroSectorFeatures {
  return {
    microId,
    profileScenarioId: "micro-simple-shield",
    businessType: "retail",
    plan: "micro-free",
    employeesCount: 1,
    licensesCount: 1,
    requirementsScore: 50,
    hasRequirements: true,
    hasContracts: true,
    hasDocuments: true,
    hasWallet: false,
    hasRequests: true,
    hasMarketplace: true,
    hasCases: false,
    hasAi: false,
  };
}

export function normalizeSectorProfiles(raw: Partial<{
  government: Record<string, StoredGovernmentFeatures>;
  ngo: Record<string, StoredNgoFeatures>;
  micro: Record<string, StoredMicroFeatures>;
}> | null): SectorProfilesState {
  const next: SectorProfilesState = {
    government: { ...DEFAULT_SECTOR_PROFILES.government },
    ngo: { ...DEFAULT_SECTOR_PROFILES.ngo },
    micro: { ...DEFAULT_SECTOR_PROFILES.micro },
  };
  if (!raw) return next;

  Object.entries(raw.government ?? {}).forEach(([governmentId, value]) => {
    const fallback = DEFAULT_SECTOR_PROFILES.government[governmentId] ?? buildDefaultGovernmentFeatures(governmentId);
    next.government[governmentId] = { ...fallback, ...value, governmentId };
  });

  Object.entries(raw.ngo ?? {}).forEach(([ngoId, value]) => {
    const fallback = DEFAULT_SECTOR_PROFILES.ngo[ngoId] ?? buildDefaultNgoFeatures(ngoId);
    next.ngo[ngoId] = { ...fallback, ...value, ngoId };
  });

  Object.entries(raw.micro ?? {}).forEach(([microId, value]) => {
    const fallback = DEFAULT_SECTOR_PROFILES.micro[microId] ?? buildDefaultMicroFeatures(microId);
    next.micro[microId] = { ...fallback, ...value, microId };
  });

  return next;
}

export function readStoredSectorProfiles(): SectorProfilesState {
  const stored = localStorage.getItem("nzamy_admin_sector_profiles");
  if (!stored) return DEFAULT_SECTOR_PROFILES;

  try {
    return normalizeSectorProfiles(JSON.parse(stored) as Partial<{
      government: Record<string, StoredGovernmentFeatures>;
      ngo: Record<string, StoredNgoFeatures>;
      micro: Record<string, StoredMicroFeatures>;
    }>);
  } catch {
    return DEFAULT_SECTOR_PROFILES;
  }
}
