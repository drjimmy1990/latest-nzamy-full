/**
 * _shared.ts — validation and row → DTO mapping for /api/v1/tickets.
 * ─────────────────────────────────────────────────────────
 * Backed by `public.support_tickets` (20260706_content_and_ops.sql):
 *   id, user_id, subject, body, category, priority, status, assignee_id,
 *   metadata, created_at, updated_at.
 * RLS already ships an owner insert policy ("tickets_insert_own": user_id =
 * auth.uid()) and an owner select policy ("tickets_select_own": same check),
 * plus an admin "for all" policy — so this route uses the caller's own
 * RLS-scoped client for both verbs, never the service role.
 *
 * Only `subject`, `body` and `category` reach a screen today (HelpTab's
 * form). `priority` is accepted too because the column already has a real
 * CHECK the API can validate against — but it is OPTIONAL and defaults to
 * the same 'normal' the column itself defaults to, so a caller that only
 * sends { subject, message, category } still works. `status` and
 * `assignee_id` are admin-only (see /api/v1/admin/tickets) — this route
 * never accepts them from the caller and never returns them, so a user
 * cannot read who their ticket is assigned to or slip a status.
 */

// Relative import (not the `@/` alias) so this module — and its test — run
// under plain `node --test` with no path-alias loader configured.
import { TICKET_CATEGORIES, TICKET_PRIORITIES, isTicketCategory, isTicketPriority, type TicketCategory, type TicketPriority } from "../../../../lib/services/ticketVocabulary.ts";

export const TICKET_SELECT = "id, subject, body, category, priority, status, created_at, updated_at";

export interface TicketRow {
  id: string;
  subject: string;
  body: string | null;
  category: string | null;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TicketDto {
  id: string;
  subject: string;
  message: string;
  category: string | null;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Pure row → DTO mapping. `body` (the DB column) becomes `message` (the API field) both ways. */
export function toTicketDto(row: TicketRow): TicketDto {
  return {
    id: row.id,
    subject: row.subject,
    message: row.body ?? "",
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SUBJECT_MIN = 3;
const SUBJECT_MAX = 160;
const MESSAGE_MIN = 5;
const MESSAGE_MAX = 4000;

export interface TicketInput {
  subject: string;
  message: string;
  category: TicketCategory;
  priority: TicketPriority;
}

export type TicketValidation = { ok: true; value: TicketInput } | { ok: false; error: string };

/**
 * Validates a POST /api/v1/tickets body. Pure — no I/O — so it is tested
 * directly rather than through an HTTP round-trip.
 */
export function validateTicketInput(body: unknown): TicketValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "بيانات غير صالحة" };
  }
  const b = body as Record<string, unknown>;

  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) {
    return { ok: false, error: `الموضوع يجب أن يكون بين ${SUBJECT_MIN} و${SUBJECT_MAX} حرفًا.` };
  }

  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return { ok: false, error: `الرسالة يجب أن تكون بين ${MESSAGE_MIN} و${MESSAGE_MAX} حرفًا.` };
  }

  if (!isTicketCategory(b.category)) {
    return { ok: false, error: `التصنيف يجب أن يكون أحد: ${TICKET_CATEGORIES.join(", ")}` };
  }

  let priority: TicketPriority = "normal";
  if (b.priority !== undefined && b.priority !== null) {
    if (!isTicketPriority(b.priority)) {
      return { ok: false, error: `الأولوية يجب أن تكون أحد: ${TICKET_PRIORITIES.join(", ")}` };
    }
    priority = b.priority;
  }

  return { ok: true, value: { subject, message, category: b.category, priority } };
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514 CHECK · 23503 FK · 42501 RLS. */
export function ticketDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "هذه التذكرة مسجَّلة مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات التذكرة غير صالحة." };
  if (code === "23503") return { status: 400, message: "التذكرة تشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ التذكرة." };
}
