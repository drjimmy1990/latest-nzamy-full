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
  /**
   * Must stay in lockstep with the `service_requests_type_check` CHECK
   * constraint — see supabase/migrations/20260814_service_orders_types.sql,
   * which allows exactly these eight values. The four `ai_*` ones are what
   * `SERVICE_TYPE_BY_KEY` (src/lib/services/orderIntake.ts) maps the four
   * premium services onto, so every order placed through `createServiceOrder`
   * arrives as one of them.
   */
  type:
    | "service"
    | "consultation"
    | "business_case"
    | "ngo_volunteer"
    | "ai_draft"
    | "ai_contracts"
    | "ai_wargaming"
    | "ai_legal_opinion";
  title: string;
  description: string;
  requester: WorkflowRequester;
  /**
   * The server-set owner column, snake_case because it is passed through
   * verbatim: POST /api/v1/service-requests writes
   * `requester_user_id: user.id` from the session (client input is ignored),
   * and the GET route's `toWorkflowRequest` spreads the raw row, so every row
   * that comes back from the API carries it.
   *
   * This — not the client-supplied `requester` jsonb — is the authoritative
   * answer to "whose request is this". Optional because rows built locally
   * (the localStorage/demo path) never have it.
   */
  requester_user_id?: string | null;
  receiver: "lawyer" | "firm" | "provider" | "business_legal" | "ngo_admin" | "government_reviewer" | "ai_workspace";
  status: WorkflowRequestStatus;
  payment: WorkflowPayment;
  sourcePath: string;
  /**
   * Scalars OR one level of nesting. It was scalars-only, which silently made
   * `metadata.intake` — the object EVERY fulfilment brief is rendered from
   * (buildOrderPrompt reads `metadata.intake` and nothing else) — untypeable
   * on this path. The consultation wizard hit exactly that and shipped its
   * answers as flat keys the brief cannot see.
   *
   * Deliberately not `unknown`: the value is written straight into a jsonb
   * column and read back by label maps that expect scalars at the leaves.
   * One level of nesting is what `intake` needs and is where this stops.
   */
  metadata?: Record<
    string,
    | string | number | boolean | null
    | Record<string, string | number | boolean | null | undefined>
    | Array<Record<string, string | number | boolean | null | undefined>>
  >;
  assignedTo?: string | null;
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
