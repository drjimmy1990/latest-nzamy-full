"use client";

import type { AffiliationRole, BusinessRole, GovernmentRole, ProviderRole, UserTier, UserType } from "@/hooks/useUser";
import {
  createWorkflowId as createWorkflowIdFromRepository,
  createWorkflowRequestLocal,
  readWorkflowRequestsLocal,
  updateWorkflowRequestLocal,
} from "@/lib/clientWorkflowRepository";

export type WorkflowRequester = {
  userId?: string;
  name: string;
  role: UserType;
  tier: UserTier;
  businessRole?: BusinessRole;
  affiliationRole?: AffiliationRole;
  governmentRole?: GovernmentRole;
  providerRole?: ProviderRole;
  roleLabel?: string;
  entityName?: string;
  entityType?: string;
};

export type WorkflowPayment = {
  amount: number;
  coupon?: string;
  walletUsed?: number;
  status: "included" | "pending" | "paid" | "not_required";
};

export type WorkflowRequestStatus =
  | "draft"
  | "pending_payment"
  | "pending_assignment"
  | "assigned"
  | "in_review"
  | "completed"
  | "cancelled";

export type WorkflowRequest = {
  id: string;
  createdAt: string;
  type: "service" | "consultation" | "business_case" | "ngo_volunteer" | "ai_draft";
  title: string;
  description: string;
  requester: WorkflowRequester;
  receiver: "lawyer" | "firm" | "provider" | "business_legal" | "ngo_admin" | "government_reviewer" | "ai_workspace";
  status: WorkflowRequestStatus;
  payment: WorkflowPayment;
  sourcePath: string;
  metadata?: Record<string, string | number | boolean | null>;
  auditTrail: Array<{ at: string; event: string; by: string }>;
};

export function createWorkflowId(prefix = "NZ"): string {
  return createWorkflowIdFromRepository(prefix);
}

export function readWorkflowRequests(): WorkflowRequest[] {
  return readWorkflowRequestsLocal();
}

export function saveWorkflowRequest(
  input: Omit<WorkflowRequest, "createdAt" | "auditTrail"> & { auditEvent?: string },
): WorkflowRequest {
  return createWorkflowRequestLocal(input);
}

export function readWorkflowRequestsByReceiver(receiver: WorkflowRequest["receiver"]): WorkflowRequest[] {
  return readWorkflowRequests().filter((request) => request.receiver === receiver);
}

export function updateWorkflowRequest(
  id: string,
  patch: Partial<Omit<WorkflowRequest, "id" | "createdAt" | "auditTrail">>,
  auditEvent = "updated",
  by = "demo-user",
): WorkflowRequest | null {
  return updateWorkflowRequestLocal(id, patch, auditEvent, by);
}
