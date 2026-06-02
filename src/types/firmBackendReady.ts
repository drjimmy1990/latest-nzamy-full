import type { AdminReadinessStatus } from "@/types/adminBackendReady";

export type FirmSize =
  | "solo_office"
  | "small_firm"
  | "mid_firm"
  | "large_firm"
  | "enterprise_firm";

export type FirmStructure =
  | "single_partner"
  | "partners"
  | "practice_departments"
  | "multi_branch"
  | "network_hybrid";

export type FirmPracticeModel =
  | "litigation"
  | "full_service"
  | "boutique"
  | "corporate_advisory"
  | "mixed";

export type FirmProfileStatus = "active" | "beta" | "paused" | "needs_review";

export type FirmPlanId = "firm-basic" | "firm-growth" | "firm-scale" | "firm-enterprise";

export type FirmRole =
  | "managing_partner"
  | "partner"
  | "senior_lawyer"
  | "lawyer"
  | "trainee"
  | "legal_secretary"
  | "office_admin"
  | "finance_manager"
  | "hr_manager"
  | "compliance_manager"
  | "external_of_counsel"
  | "legal_consultant"
  | "in_house_counsel";

export type FirmPermissionScope =
  | "firm"
  | "department"
  | "assigned_cases"
  | "own_work"
  | "finance"
  | "points"
  | "settings"
  | "audit";

export type FirmServiceKey =
  | "core_cases"
  | "client_portal"
  | "practice_departments"
  | "branches"
  | "finance"
  | "hr"
  | "governance"
  | "chinese_walls"
  | "marketplace"
  | "external_collaboration"
  | "secondment"
  | "shared_rooms"
  | "advanced_ai"
  | "legal_library"
  | "analytics"
  | "health_check"
  | "firm_points_wallet";

export interface FirmProfileContract {
  firmId: string;
  firmName: string;
  firmSize: FirmSize;
  structure: FirmStructure;
  practiceModel: FirmPracticeModel;
  status: FirmProfileStatus;
  plan: FirmPlanId;
  baseSeats: number;
  activeSeats: number;
  branchesCount: number;
  practiceDepartments: string[];
  operationsDepartments: string[];
  activeServices: FirmServiceKey[];
  roles: FirmRole[];
  adminOwner: string;
  lastProfileReviewAt: string;
}

export interface FirmRoleContract {
  role: FirmRole;
  label: string;
  scopes: FirmPermissionScope[];
  permissions: string[];
  canViewFirmWallet: boolean;
  canViewDepartmentWallet: boolean;
  canRequestTopUp: boolean;
}

export interface FirmPlanContract {
  plan: FirmPlanId;
  annualPrice: number;
  includedSeats: number;
  extraSeatAnnualPrice: number | null;
  includedAnnualPoints: number;
  maxSeats: number | null;
  betaLocked: boolean;
}

export interface FirmPointsWallet {
  firmId: string;
  totalAnnualPoints: number;
  availablePoints: number;
  reservedPoints: number;
  departmentBudgets: Array<{
    departmentId: string;
    departmentName: string;
    allocatedPoints: number;
    spentPoints: number;
    managerRole: FirmRole;
  }>;
  lowBalanceThresholdPct: number;
  exhaustedBehavior: "block_consumption_only";
}

export interface FirmAuditEvent {
  id: string;
  actor: string;
  action: string;
  targetType: "firm_profile" | "firm_plan" | "firm_role" | "firm_wallet" | "firm_service";
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  timestamp: string;
}

export interface FirmServiceEntitlement {
  key: FirmServiceKey;
  label: string;
  description: string;
  availableForSizes: FirmSize[];
  needsAdminFlag?: boolean;
  routes: string[];
  contract: string;
  readiness: AdminReadinessStatus;
}

export interface FirmProfileScenario {
  id: string;
  title: string;
  firmSize: FirmSize;
  structure: FirmStructure;
  practiceModel: FirmPracticeModel;
  description: string;
  roles: FirmRole[];
  recommendedServices: FirmServiceKey[];
  dashboardRoutes: string[];
  adminRoute: string;
  readiness: AdminReadinessStatus;
  backendBoundary: string;
  betaNotes: string;
}

export interface FirmAdminControl {
  id: string;
  title: string;
  route: string;
  contract: string;
  readiness: AdminReadinessStatus;
  note: string;
}
