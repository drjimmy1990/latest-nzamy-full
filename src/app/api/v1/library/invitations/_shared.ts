/**
 * _shared.ts — the row shape and Postgres-error mapping for the
 * `library.invitations` routes (redeem + admin list/create), so the DTO and
 * the error copy cannot drift between them. Pattern copied from
 * src/app/api/v1/lawyer/consultations/_shared.ts.
 *
 * `library.invitations` (20260626_legal_library_schema.sql):
 *   id, code (unique), max_uses (default 1), current_uses (default 0),
 *   expires_at (nullable), created_by, created_at, updated_at.
 *
 * The `library` schema is not exposed to PostgREST's default (public) schema
 * — every read/write here MUST go through `createServiceClient().schema("library")`,
 * never the RLS-scoped client from createClient().
 */

import { libraryInvitationStatus, type LibraryInvitationStatus } from "@/lib/services/libraryInvitationRules";

export const LIBRARY_INVITATION_SELECT =
  "id, code, max_uses, current_uses, expires_at, created_by, created_at, updated_at";

export interface LibraryInvitationRow {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryInvitationDto {
  id: string;
  code: string;
  maxUses: number;
  currentUses: number;
  expiresAt: string | null;
  createdBy: string | null;
  status: LibraryInvitationStatus;
  createdAt: string;
  updatedAt: string;
}

export function toLibraryInvitationDto(row: LibraryInvitationRow): LibraryInvitationDto {
  return {
    id: row.id,
    code: row.code,
    maxUses: row.max_uses,
    currentUses: row.current_uses,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    status: libraryInvitationStatus({
      currentUses: row.current_uses,
      maxUses: row.max_uses,
      expiresAt: row.expires_at,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514 CHECK · 23503 FK · 42501 RLS. */
export function libraryInvitationDbErrorResponse(
  error: { code?: string; message?: string } | null | undefined,
): { status: number; message: string } {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "كود الدعوة هذا مستخدَم مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات كود الدعوة غير صالحة." };
  if (code === "23503") return { status: 400, message: "كود الدعوة يشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر تنفيذ العملية على كود الدعوة." };
}
