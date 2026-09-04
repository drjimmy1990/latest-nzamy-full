/**
 * _shared.ts — the source CHECK list and the Postgres error → Arabic mapping
 * for every /api/v1/documents/** route (DELETE, POST, restore, hold). Same
 * pattern as src/app/api/v1/lawyer/consultations/_shared.ts:197-209.
 *
 * attachments.id is a bigserial (plain integer), NOT a uuid — every route
 * that takes an `id` route param must guard it with the same `/^\d+$/` check
 * the rest of this codebase already uses (copy/route.ts, deliverable/route.ts,
 * service-requests/[id]/attachments/[attachmentId]/route.ts, admin
 * service-orders) before the value ever reaches PostgREST.
 */

/** Mirrors the CHECK on attachments.source (20260906_phase6_settings_out_of_browser.sql). */
export const DOCUMENT_SOURCE_VALUES = ["upload", "generated", "imported", "contract_version"] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCE_VALUES)[number];

export function isDocumentSource(value: unknown): value is DocumentSource {
  return typeof value === "string" && (DOCUMENT_SOURCE_VALUES as readonly string[]).includes(value);
}

/** attachments.id is a bigserial — reject anything that isn't a bare integer before it reaches a query. */
export function isValidAttachmentId(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Postgres error → HTTP status + Arabic message for the attachments table. */
export function documentsDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  // 23514 is the backstop for the legal-hold/soft-delete CHECK
  // (attachments_hold_blocks_delete_check) racing between our pre-check read
  // and the write — the route pre-checks legal_hold itself, so this branch
  // should be rare, not the primary defense.
  if (code === "23505") return { status: 409, message: "هذا المستند مسجَّل مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات المستند غير صالحة." };
  if (code === "23503") return { status: 400, message: "المستند يشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ المستند." };
}
