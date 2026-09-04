/**
 * ticketsService.ts — support tickets filed from the settings Help tab, out
 * of the browser (Phase 6). HelpTab.tsx currently submits to nowhere; this
 * is the contract its rewiring (screens phase) calls.
 * ─────────────────────────────────────────────────────────
 *   GET  /api/v1/tickets  — mine, newest first
 *   POST /api/v1/tickets  — file a new one
 *
 * Backed by `public.support_tickets`. The admin queue
 * (adminListFeatureRequests's sibling — /api/v1/admin/tickets) is a separate
 * surface and not exposed here.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import { TICKET_CATEGORIES, TICKET_CATEGORY_AR, TICKET_PRIORITIES, TICKET_PRIORITY_AR, TICKET_STATUS_AR, type TicketCategory, type TicketPriority, type TicketStatus } from "@/lib/services/ticketVocabulary";

export { TICKET_CATEGORIES, TICKET_CATEGORY_AR, TICKET_PRIORITIES, TICKET_PRIORITY_AR, TICKET_STATUS_AR };
export type { TicketCategory, TicketPriority, TicketStatus };

/** Mirrors the row `/api/v1/tickets` returns (camelCase — the route's `toTicketDto`). */
export interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: TicketCategory | string | null;
  priority: TicketPriority | string;
  status: TicketStatus | string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketInput {
  subject: string;
  message: string;
  category: TicketCategory;
  priority?: TicketPriority;
}

const BASE = "/api/v1/tickets";
const DEMO = "تذاكر الدعم غير متاحة في وضع العرض التجريبي";

/** The signed-in caller's own tickets, newest first. */
export async function getMyTickets(): Promise<ListRead<Ticket>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(await apiGet<{ data: Ticket[]; total?: number }>(BASE));
  } catch (error) {
    console.error("[ticketsService] getMyTickets failed:", error);
    return listFailed<Ticket>();
  }
}

/** Files a new support ticket. Throws with an Arabic message on failure. */
export async function submitTicket(input: TicketInput): Promise<Ticket> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: Ticket }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم التذكرة المحفوظة.");
  return res.data;
}
