/**
 * _shared.ts — the ONE row → DTO mapping for /api/v1/cases/[id]/notes.
 * ─────────────────────────────────────────────────────────
 * Backed by `public.case_notes` (migration 20260910_case_notes.sql), modeled
 * on `lawyer_client_notes` / lawyerClientNotesService.ts. A note kept on a
 * case file: `private` = the author alone, `firm` = the author's active firm
 * colleagues too (RLS: `can_access_case_row(author_user_id, firm_id)`).
 *
 * `hydrateAuthorNames` uses the SERVICE client on purpose — the RLS-scoped
 * client can read the author's own profile, but not necessarily a colleague's
 * (profiles has no "read a firm colleague" policy), and even where it could,
 * one query per row defeats the point of a list. This never widens WHICH
 * rows are returned — case_notes' own RLS already decided that — it only
 * labels rows RLS handed back.
 *
 * `resolveFirmVisibilityFirmId` (used by both POST and PATCH for
 * `visibility: "firm"`) lives in the sibling `_resolveFirmVisibility.ts`
 * instead of here, on purpose: that file has no `@/`-aliased value import, so
 * — unlike this one — it can be loaded by `node --test` directly. See its
 * header comment and `_resolveFirmVisibility.test.ts`.
 */

import { createServiceClient } from "@/lib/supabase/server";

export const CASE_NOTE_SELECT = "id, request_id, author_user_id, firm_id, visibility, body, created_at, updated_at";

export const MAX_BODY_LENGTH = 8000;
export const VALID_VISIBILITY = new Set(["private", "firm"]);

export interface CaseNoteRow {
  id: string;
  request_id: string;
  author_user_id: string;
  firm_id: string | null;
  visibility: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CaseNoteDto {
  id: string;
  requestId: string;
  authorUserId: string;
  authorName: string;
  /**
   * false when `authorName` is a placeholder ("أنت" / "محامٍ"), not a real
   * `profiles.display_name` — the same distinction the lawyer case file's own
   * «الفريق» tab already draws (`m.nameKnown`: an icon, not a letter sliced
   * from an id, when there is no real name). The UI must not build an avatar
   * initial from a placeholder string.
   */
  authorNameKnown: boolean;
  /** true when the signed-in user wrote it — the only case the UI offers edit/delete. */
  mine: boolean;
  firmId: string | null;
  visibility: "private" | "firm";
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** `authorName`: a real `profiles.display_name` from `hydrateAuthorNames`, or `null` when none resolved. */
export function toCaseNoteDto(row: CaseNoteRow, uid: string, authorName: string | null): CaseNoteDto {
  const mine = row.author_user_id === uid;
  return {
    id: row.id,
    requestId: row.request_id,
    authorUserId: row.author_user_id,
    authorName: authorName ?? (mine ? "أنت" : "محامٍ"),
    authorNameKnown: !!authorName,
    mine,
    firmId: row.firm_id,
    visibility: row.visibility === "firm" ? "firm" : "private",
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Batch-resolves author display names for a page of notes — one query, not one per row. */
export async function hydrateAuthorNames(rows: CaseNoteRow[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const authorIds = [...new Set(rows.map((r) => r.author_user_id))];
  if (authorIds.length === 0) return names;
  try {
    const service = await createServiceClient();
    const { data, error } = await service.from("profiles").select("id, display_name").in("id", authorIds);
    if (error) {
      console.error("[cases/notes] profile lookup failed:", error.message, error.code);
    } else {
      for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name) names.set(p.id, p.display_name);
      }
    }
  } catch (err) {
    console.error("[cases/notes] profile lookup threw:", err);
  }
  return names;
}

/** Postgres error → HTTP status + Arabic message. 23514 CHECK · 23503 FK · 42501 RLS. */
export function caseNoteDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23514") return { status: 400, message: "نص الملاحظة غير صالح — تحقق من طوله ونطاقها." };
  if (code === "23503") return { status: 400, message: "القضية المشار إليها غير موجودة." };
  if (code === "42501") return { status: 403, message: "لا يمكنك إضافة ملاحظة على قضية لا تملك صلاحية قراءتها." };
  return { status: 500, message: "تعذّر حفظ الملاحظة." };
}
