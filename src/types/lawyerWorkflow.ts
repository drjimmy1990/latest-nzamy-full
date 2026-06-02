export type LawyerTeamRole = "trainee" | "admin_assistant" | "part_time_lawyer";
export type WorkflowStatus = "draft" | "pending" | "active" | "completed" | "cancelled" | "disputed";
export type MoneyCurrency = "SAR";

export interface LawyerServicePricing {
  adminPricingKey: string;
  titleAr: string;
  titleEn: string;
  pointCost: number;
  betaFree: boolean;
  enabled: boolean;
}

export interface LawyerCreditWallet {
  lawyerId: string;
  balance: number;
  expiresAt?: string;
  lastTopupPackageId?: "lawyer-basic" | "lawyer-advanced" | "lawyer-elite" | "lawyer-royal";
}

export interface LawyerTeamMember {
  id: string;
  lawyerId: string;
  email: string;
  name?: string;
  role: LawyerTeamRole;
  active: boolean;
  invitedAt: string;
  acceptedAt?: string;
}

export interface CaseCollaborator {
  id: string;
  caseId: string;
  ownerLawyerId: string;
  collaboratorUserId: string;
  role: "co_counsel" | "assistant" | "provider" | "viewer";
  feeSplitPercent?: number;
  permissions: ("read" | "write_tasks" | "upload_documents" | "internal_notes" | "finance")[];
  status: WorkflowStatus;
}

export interface CaseShareToken {
  id: string;
  caseId: string;
  createdByLawyerId: string;
  url: string;
  scope: ("tasks" | "hearings" | "documents" | "updates")[];
  expiresAt: string;
  revokedAt?: string;
  views: number;
}

export interface MarketplaceRequest {
  id: string;
  requesterUserId: string;
  requesterType: "lawyer" | "firm" | "corporate" | "micro";
  title: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  currency: MoneyCurrency;
  status: WorkflowStatus;
}

export interface MarketplaceOffer {
  id: string;
  requestId: string;
  providerUserId: string;
  price: number;
  currency: MoneyCurrency;
  message: string;
  deliveryTime: string;
  status: "pending" | "accepted" | "rejected";
}

export interface MarketplaceWorkspace {
  id: string;
  requestId: string;
  acceptedOfferId: string;
  commissionPercent: 15;
  escrowStatus: "pending" | "funded" | "released" | "refunded" | "disputed";
  status: WorkflowStatus;
}

export interface SecondmentContract {
  id: string;
  lawyerId: string;
  companyId: string;
  monthlyHourLimit: number;
  hourlyRate: number;
  currency: MoneyCurrency;
  status: WorkflowStatus;
}

export interface SecondmentTimeEntry {
  id: string;
  contractId: string;
  date: string;
  hours: number;
  description: string;
  billable: boolean;
}

export interface Referral {
  id: string;
  sourceLawyerId: string;
  targetLawyerId?: string;
  clientId?: string;
  caseId?: string;
  commissionPercent?: number;
  status: WorkflowStatus;
}
