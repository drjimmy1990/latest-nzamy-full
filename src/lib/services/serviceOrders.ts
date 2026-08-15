/**
 * serviceOrders.ts — client-side wrapper for creating/reading AI service
 * orders (service_requests rows with receiver='ai_workspace').
 *
 * Thin wrapper over the existing generic POST /api/v1/service-requests route
 * (see src/app/api/v1/service-requests/route.ts) — no new API route.
 */

"use client";

import { apiGet, apiMutate } from "@/lib/services/api";
import {
  SERVICE_TYPE_BY_KEY, SERVICE_TITLE_AR,
  type ServiceKey, type OrderAttachment,
} from "@/lib/services/orderIntake";

export interface ServiceOrderDeliverable {
  documentId: string;
  fileName: string;
  notes?: string;
  deliveredAt: string;
  deliveredBy: string;
}

export interface ServiceOrder {
  id: string;
  type: string;
  title: string;
  description: string;
  status: "pending_assignment" | "assigned" | "in_review" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  metadata: {
    service?: ServiceKey;
    serviceTitleAr?: string;
    schemaVersion?: number;
    intake?: Record<string, unknown>;
    attachments?: OrderAttachment[];
    deliverable?: ServiceOrderDeliverable;
    cancelReason?: string;
  };
}

export async function createServiceOrder(args: {
  service: ServiceKey;
  title: string;
  description: string;
  intake: Record<string, unknown>;
  attachments: OrderAttachment[];
  requester: { name?: string; phone?: string; email?: string };
}): Promise<ServiceOrder> {
  const res = await apiMutate<{ data: ServiceOrder }>("/api/v1/service-requests", "POST", {
    title: args.title,
    description: args.description,
    type: SERVICE_TYPE_BY_KEY[args.service],
    receiver: "ai_workspace",
    status: "pending_assignment",
    sourcePath: `/ai/${args.service === "legal_opinion" ? "legal-opinion" : args.service}`,
    payment: { amount: 0, status: "not_required" },
    requester: args.requester,
    metadata: {
      service: args.service,
      serviceTitleAr: SERVICE_TITLE_AR[args.service],
      schemaVersion: 1,
      intake: args.intake,
      attachments: args.attachments,
    },
  });
  return res.data;
}

export async function listMyServiceOrders(): Promise<ServiceOrder[]> {
  try {
    const res = await apiGet<{ data: ServiceOrder[] }>(
      "/api/v1/service-requests?receiver=ai_workspace",
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

export async function getServiceOrder(id: string): Promise<ServiceOrder | null> {
  try {
    const res = await apiGet<{ data: ServiceOrder }>(`/api/v1/service-requests/${id}`);
    return res.data ?? null;
  } catch {
    return null;
  }
}

export const ORDER_STATUS_AR: Record<ServiceOrder["status"], { label: string; tone: string }> = {
  pending_assignment: { label: "بانتظار الاستلام", tone: "amber" },
  assigned:           { label: "قيد التنفيذ",      tone: "blue"  },
  in_review:          { label: "قيد التنفيذ",      tone: "blue"  },
  completed:          { label: "جاهز",             tone: "emerald" },
  cancelled:          { label: "ملغى",             tone: "zinc"  },
};
