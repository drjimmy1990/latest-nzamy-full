import type { AdminReadinessStatus } from "@/types/adminBackendReady";

export type BusinessCompanySize =
  | "owner_only"
  | "small"
  | "medium"
  | "large"
  | "enterprise";

export type BusinessLegalStructure =
  | "owner_managed"
  | "external_counsel"
  | "internal_advisor"
  | "legal_department"
  | "hybrid";

export type BusinessServiceModel =
  | "platform_only"
  | "litigation_only"
  | "platform_and_litigation"
  | "secondment"
  | "advisory_only";

export type BusinessProfileStatus = "active" | "trial" | "paused" | "needs_review";

export type BusinessRole =
  | "owner"
  | "legal_manager"
  | "legal_staff"
  | "compliance_officer"
  | "seconded"
  | "department_head"
  | "hr_manager"
  | "finance_manager"
  | "employee";

export type BusinessServiceKey =
  | "legal_requests"
  | "litigation"
  | "contract_review"
  | "legal_library"
  | "ai_corp_tools"
  | "marketplace"
  | "secondment"
  | "governance"
  | "hr_contracts"
  | "finance_reports"
  | "departments"
  | "community_supervision";

export interface BusinessProfileContract {
  companyId: string;
  companyName: string;
  companySize: BusinessCompanySize;
  legalStructure: BusinessLegalStructure;
  serviceModel: BusinessServiceModel;
  status: BusinessProfileStatus;
  plan: "free" | "shield" | "pro" | "corp" | "enterprise";
  hasInternalLegal: boolean;
  hasLegalAdvisor: boolean;
  hasDepartments: boolean;
  hasHrFinanceAccess: boolean;
  activeServices: BusinessServiceKey[];
  roles: BusinessRole[];
  adminOwner: string;
  lastProfileReviewAt: string;
}

export interface BusinessProfileScenario {
  id: string;
  title: string;
  companySize: BusinessCompanySize;
  legalStructure: BusinessLegalStructure;
  serviceModel: BusinessServiceModel;
  hasInternalLegal: boolean;
  description: string;
  roles: BusinessRole[];
  recommendedServices: BusinessServiceKey[];
  dashboardRoutes: string[];
  adminRoute: string;
  readiness: AdminReadinessStatus;
  backendBoundary: string;
  betaNotes: string;
}

export interface BusinessServiceEntitlement {
  key: BusinessServiceKey;
  label: string;
  description: string;
  availableForSizes: BusinessCompanySize[];
  needsInternalLegal?: boolean;
  needsAdminFlag?: boolean;
  routes: string[];
  contract: string;
  readiness: AdminReadinessStatus;
}

export interface BusinessAdminControl {
  id: string;
  title: string;
  route: string;
  contract: string;
  readiness: AdminReadinessStatus;
  note: string;
}
