/**
 * servicesWizardRequest.ts — the request the public /services wizard sends to
 * POST /api/v1/service-requests (owner decision ١١٥: it used to be written to
 * the visitor's own browser only, and showed «تم إرسال الطلب»).
 *
 * Built here, not inline in ServiceRequestWizard.tsx, so a unit test can pass
 * the EXACT payload through the route's two pure gates —
 * `validateServiceRequestCreate` and `checkOrderIntake` — and prove a real
 * submit is accepted (servicesWizardRequest.test.ts). No imports.
 *
 *   receiver "ai_workspace" — the نظامي team's queue, the one the admin console
 *     reads; the marketplace receivers this form used to name are closed while
 *     BETA_MONOPOLY_MODE is on, so a row addressed to them reached nobody.
 *   payment 0 / not_required — the budget is the client's range, not a charge;
 *     it stays in metadata for the team to quote against.
 *   metadata.intake — what the team's brief renders; it carries no `service`
 *     key, so the AI-service intake validators do not apply to it.
 */

export interface ServicesWizardRequestInput {
  id: string;
  title: string;
  serviceTitleAr: string;
  description: string;
  requester: {
    userId?: string;
    name: string;
    role: unknown;
    tier: unknown;
    businessRole?: unknown;
  };
  serviceId: string;
  userRole: string;
  region: string;
  deadline: string;
  budgetMin: number;
  budgetMax: number;
  confidential: boolean;
  assignmentMethod: string;
  barNumber: string;
  courtName: string;
  caseNumber: string;
  serviceType: string;
  /** Verbatim from useOrderAttachments — every consumer reads `.documentId` off each entry. */
  attachments: readonly unknown[];
}

export function buildServicesWizardRequest(input: ServicesWizardRequestInput) {
  return {
    id: input.id,
    type: "service" as const,
    title: input.title,
    description: input.description,
    requester: input.requester,
    receiver: "ai_workspace" as const,
    status: "pending_assignment" as const,
    payment: { amount: 0, status: "not_required" as const },
    sourcePath: "/services",
    metadata: {
      serviceTitleAr: input.serviceTitleAr,
      schemaVersion: 1,
      intake: {
        description: input.description,
        region: input.region,
        deadline: input.deadline,
      },
      serviceId: input.serviceId,
      userRole: input.userRole,
      region: input.region,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      deadline: input.deadline,
      confidential: input.confidential,
      assignmentMethod: input.assignmentMethod,
      // Counts the UPLOADED files — a file whose upload failed is not in
      // `attachments`, so the number the fulfiller reads is what they can open.
      fileCount: input.attachments.length,
      barNumber: input.barNumber || null,
      courtName: input.courtName || null,
      caseNumber: input.caseNumber || null,
      serviceType: input.serviceType || null,
      attachments: input.attachments,
    },
    auditEvent: "service_marketplace_request_sent",
  };
}
