/**
 * serviceOrders.ts — client-side wrapper for creating/reading AI service
 * orders (service_requests rows with receiver='ai_workspace').
 *
 * Thin wrapper over the existing generic POST /api/v1/service-requests route
 * (see src/app/api/v1/service-requests/route.ts) — no new API route.
 */

"use client";

import { apiMutate } from "@/lib/services/api";
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

/**
 * Thrown by getServiceOrder specifically when the server says 404 — i.e. the
 * order genuinely doesn't exist (or isn't visible to this caller). Any other
 * failure (network drop, 401, 500, ...) throws a plain Error instead, so
 * callers can tell "this order isn't there" apart from "we couldn't check."
 */
export class ServiceOrderNotFoundError extends Error {
  constructor() {
    super("الطلب غير موجود");
    this.name = "ServiceOrderNotFoundError";
  }
}

// listMyServiceOrders/getServiceOrder intentionally bypass the shared
// apiGet() helper (src/lib/services/api.ts) and fetch directly: apiGet()
// discards the HTTP status code when it throws, which is exactly the signal
// the detail page needs to tell "not found" (404) apart from "failed to
// load" (network error, 401, 500, ...). Both functions used to swallow every
// failure into an empty result ([] / null), which made a DB hiccup or an
// expired session indistinguishable from "you have no orders" / "this order
// doesn't exist" — a false statement about the client's data. They now throw
// on failure so the pages can render a real error state instead.
export async function listMyServiceOrders(): Promise<ServiceOrder[]> {
  const res = await fetch("/api/v1/service-requests?receiver=ai_workspace", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("تعذّر تحميل الطلبات");
  }
  const body = await res.json();
  return (body.data as ServiceOrder[] | undefined) ?? [];
}

export async function getServiceOrder(id: string): Promise<ServiceOrder> {
  const res = await fetch(`/api/v1/service-requests/${id}`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new ServiceOrderNotFoundError();
  }
  if (!res.ok) {
    throw new Error("تعذّر تحميل الطلب");
  }
  const body = await res.json();
  // A 200 with no `data` is a contract violation, not a legitimate empty
  // result (unlike the list endpoint, a single-resource GET has no "empty"
  // state) — treat it as a failure rather than silently handing the caller
  // `undefined` typed as ServiceOrder.
  if (!body?.data) {
    throw new Error("تعذّر تحميل الطلب");
  }
  return body.data as ServiceOrder;
}

export const ORDER_STATUS_AR: Record<ServiceOrder["status"], { label: string; tone: string }> = {
  pending_assignment: { label: "بانتظار الاستلام", tone: "amber" },
  assigned:           { label: "قيد التنفيذ",      tone: "blue"  },
  in_review:          { label: "قيد التنفيذ",      tone: "blue"  },
  completed:          { label: "جاهز",             tone: "emerald" },
  cancelled:          { label: "ملغى",             tone: "zinc"  },
};
