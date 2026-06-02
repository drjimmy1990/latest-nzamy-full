import type { AdminReadinessStatus } from "@/types/adminBackendReady";

export type GovernmentEntityType =
  | "court"
  | "prosecution"
  | "police"
  | "ministry"
  | "regulator"
  | "municipality"
  | "public_authority";

export type GovernmentRoleKey =
  | "judge"
  | "prosecution"
  | "investigator"
  | "police_officer"
  | "government_counsel"
  | "compliance_regulator";

export type GovernmentPlanId = "gov-eval" | "gov-department" | "gov-enterprise";

export type GovernmentServiceKey =
  | "judiciary"
  | "prosecution"
  | "investigation"
  | "police"
  | "counsel"
  | "compliance"
  | "reports"
  | "contracts"
  | "sso"
  | "ai_by_role";

export interface GovernmentProfileContract {
  governmentId: string;
  entityName: string;
  entityType: GovernmentEntityType;
  departmentName: string;
  enabledRoles: GovernmentRoleKey[];
  plan: GovernmentPlanId;
  activeUsers: number;
  integrations: string[];
  verificationStatus: "evaluation" | "approved" | "needs_review" | "paused";
  lastReadinessReviewAt: string;
}

export interface GovernmentRoleContract {
  role: GovernmentRoleKey;
  label: string;
  scope: "case" | "department" | "entity" | "oversight";
  permissions: string[];
  aiTools: string[];
  restrictedFrom: GovernmentRoleKey[];
}

export type NgoOrganizationType = "charity" | "waqf" | "foundation" | "campaign";
export type NgoPlanId = "ngo-free" | "ngo-impact" | "ngo-institutional";

export type NgoServiceKey =
  | "volunteers"
  | "donations"
  | "awqaf"
  | "board"
  | "programs"
  | "compliance"
  | "reports"
  | "ai";

export interface NgoProfileContract {
  ngoId: string;
  organizationName: string;
  organizationType: NgoOrganizationType;
  plan: NgoPlanId;
  activeVolunteers: number;
  volunteersLimit: number;
  programsCount: number;
  boardSeats: number;
  complianceStatus: "healthy" | "watch" | "needs_review";
  reportingCycle: "monthly" | "quarterly" | "annual";
  lastReadinessReviewAt: string;
}

export type MicroBusinessType =
  | "retail"
  | "restaurant"
  | "clinic"
  | "workshop"
  | "professional_services"
  | "online_store";

export type MicroPlanId = "micro-free" | "micro-shield";

export type MicroServiceKey =
  | "requirements"
  | "contracts"
  | "documents"
  | "wallet"
  | "requests"
  | "marketplace"
  | "cases"
  | "ai";

export interface MicroProfileContract {
  microId: string;
  businessName: string;
  businessType: MicroBusinessType;
  plan: MicroPlanId;
  employeesCount: number;
  licensesCount: number;
  requirementsScore: number;
  litigationBoundary: "advisory_only" | "marketplace_escalation" | "case_tracking";
  activeServices: MicroServiceKey[];
  lastReadinessReviewAt: string;
}

export type SectorProfileType = "government" | "ngo" | "micro";

export interface SectorEntitlement {
  key: GovernmentServiceKey | NgoServiceKey | MicroServiceKey;
  sector: SectorProfileType;
  label: string;
  description: string;
  routes: string[];
  contract: string;
  readiness: AdminReadinessStatus;
}

export interface SectorPlanContract {
  id: GovernmentPlanId | NgoPlanId | MicroPlanId;
  sector: SectorProfileType;
  label: string;
  pricingModel: "free" | "annual_fixed" | "annual_quote";
  yearlyPrice?: number;
  includedUsers?: number;
  usageModel: "limits" | "contract_scope";
  betaLocked: boolean;
  note: string;
}

export interface SectorAuditEvent {
  id: string;
  sector: SectorProfileType;
  actor: string;
  action: string;
  targetType:
    | "government_profile"
    | "ngo_profile"
    | "micro_profile"
    | "sector_plan"
    | "sector_entitlement"
    | "sector_role";
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  timestamp: string;
}

export interface SectorProfileScenario {
  id: string;
  sector: SectorProfileType;
  title: string;
  description: string;
  recommendedServices: Array<GovernmentServiceKey | NgoServiceKey | MicroServiceKey>;
  dashboardRoutes: string[];
  adminRoute: string;
  readiness: AdminReadinessStatus;
  backendBoundary: string;
  betaNotes: string;
}

export interface SectorAdminControl {
  id: string;
  title: string;
  sector: SectorProfileType;
  route: string;
  contract: string;
  readiness: AdminReadinessStatus;
  note: string;
}
