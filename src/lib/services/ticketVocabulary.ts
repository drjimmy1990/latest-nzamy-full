/**
 * ticketVocabulary.ts — the ONE vocabulary of a support ticket's category,
 * priority and status.
 * ─────────────────────────────────────────────────────────
 * `public.support_tickets` (20260706_content_and_ops.sql) has a CHECK
 * constraint on `priority` and on `status` but NONE on `category` — that
 * column is free text at the database level. TICKET_CATEGORIES below is this
 * app's own allowlist, enforced at the API layer (POST /api/v1/tickets),
 * not by the database. Pure — no I/O — so the route, the client service and
 * node --test all read the same list.
 */

export const TICKET_CATEGORIES = ["technical", "billing", "account", "content", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_AR: Record<TicketCategory, string> = {
  technical: "مشكلة تقنية",
  billing: "الفواتير والاشتراك",
  account: "الحساب والملف الشخصي",
  content: "محتوى المكتبة القانونية",
  other: "أخرى",
};

/** Mirrors the `priority` CHECK on `public.support_tickets`. */
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_AR: Record<TicketPriority, string> = {
  low: "منخفضة",
  normal: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};

/** Mirrors the `status` CHECK on `public.support_tickets`. Set by admins only — never by this route's POST. */
export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_AR: Record<TicketStatus, string> = {
  open: "مفتوحة",
  pending: "قيد المتابعة",
  resolved: "تم الحل",
  closed: "مغلقة",
};

export function isTicketCategory(v: unknown): v is TicketCategory {
  return typeof v === "string" && (TICKET_CATEGORIES as readonly string[]).includes(v);
}
export function isTicketPriority(v: unknown): v is TicketPriority {
  return typeof v === "string" && (TICKET_PRIORITIES as readonly string[]).includes(v);
}
export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);
}
