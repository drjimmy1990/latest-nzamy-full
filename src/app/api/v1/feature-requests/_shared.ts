/**
 * _shared.ts — the ONE row → DTO mapping for the feature-request routes.
 * ─────────────────────────────────────────────────────────
 * Backed by `public.feature_requests` (20260906_phase6_settings_out_of_browser.sql).
 * RLS: own row or `public.is_admin()` for SELECT, own row for INSERT,
 * `public.is_admin()` for UPDATE — so `/api/v1/feature-requests` (this
 * directory) additionally filters `.eq("user_id", user.id)` on its own GET,
 * because an admin caller hitting the "mine" route must still only see their
 * own submissions, not every user's (RLS alone would let them see all).
 * Imported by both `/api/v1/feature-requests/route.ts` and the admin routes
 * under `/api/v1/admin/feature-requests/` — a column added to the DTO is
 * added in exactly one place.
 */

import type { FeatureRequest, FeatureRequestPriority, FeatureRequestStatus } from "@/lib/services/feedbackService";

export const FEATURE_REQUEST_SELECT =
  "id, user_id, title, description, category, priority, status, implemented_note, created_at, updated_at";

export interface FeatureRequestRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  implemented_note: string | null;
  created_at: string;
  updated_at: string;
}

/** Maps one `feature_requests` row to the `FeatureRequest` DTO. `userName` is only ever hydrated on the admin list. */
export function toFeatureRequestDto(row: FeatureRequestRow, userName?: string | null): FeatureRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: userName ?? null,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority as FeatureRequestPriority,
    status: row.status as FeatureRequestStatus,
    implementedNote: row.implemented_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514 CHECK · 23503 FK · 42501 RLS · PGRST116 no row matched (RLS-scoped .single()). */
export function featureRequestDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "PGRST116") return { status: 404, message: "الطلب غير موجود." };
  if (code === "23505") return { status: 409, message: "هذا الطلب مسجَّل مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات الطلب غير صالحة." };
  if (code === "23503") return { status: 400, message: "الطلب يشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ الطلب." };
}
