/**
 * The query of GET /api/v1/admin/tickets, checked before it reaches the
 * database.
 *
 *   status   — one of the four the table's CHECK allows, or absent.
 *   user_id  — the tickets one account opened (the user page's «تذاكر الدعم»
 *              tab, live check of 13 Nov row 31 — it showed three invented
 *              tickets #١٢٨ / #١٠٤ / #٨٩ for every user). Must be a uuid.
 *   limit    — 1..500 when given; absent keeps the queue page's whole list
 *              exactly as before (a silent cap would hide older tickets).
 */
import { isUuid } from "./viewAsCore.ts";

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKETS_MAX_LIMIT = 500;

export type TicketsQuery =
  | { ok: true; status: TicketStatus | null; userId: string | null; limit: number | null }
  | { ok: false; error: string };

export function parseTicketsQuery(params: URLSearchParams): TicketsQuery {
  const status = params.get("status");
  if (status !== null && status !== "" && !(TICKET_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "حالة التذكرة غير معروفة." };
  }
  const userId = params.get("user_id");
  if (userId !== null && userId !== "" && !isUuid(userId)) {
    return { ok: false, error: "معرّف المستخدم غير صالح." };
  }
  const rawLimit = params.get("limit");
  let limit: number | null = null;
  if (rawLimit !== null && rawLimit !== "") {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) return { ok: false, error: "عدد التذاكر المطلوب غير صالح." };
    limit = Math.min(n, TICKETS_MAX_LIMIT);
  }
  return {
    ok: true,
    status: status ? (status as TicketStatus) : null,
    userId: userId ? userId : null,
    limit,
  };
}

/** The Arabic word for a ticket's status; an unknown value is shown as «—». */
export function ticketStatusAr(status: unknown): string {
  switch (status) {
    case "open": return "مفتوحة";
    case "pending": return "قيد المتابعة";
    case "resolved": return "محلولة";
    case "closed": return "مغلقة";
    default: return "—";
  }
}
