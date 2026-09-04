/**
 * _shared.ts — the ONE row → DTO mapping and Postgres-error mapper for the
 * article-notes routes (route.ts, audio-url/route.ts). Pattern copied from
 * src/app/api/v1/lawyer/consultations/_shared.ts.
 *
 * `public.law_article_notes` (20260906_phase6_settings_out_of_browser.sql) —
 * one row per (user_id, page_id), owner-only RLS.
 */

import type { ArticleNote } from "@/lib/services/articleNotesService";

export const ARTICLE_NOTE_SELECT =
  "id, page_id, note_text, audio_path, strokes, position, is_visible, created_at, updated_at";

export interface ArticleNoteRow {
  id: string;
  page_id: string;
  note_text: string;
  audio_path: string | null;
  strokes: unknown;
  position: { x: number; y: number } | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

/** Maps one `law_article_notes` row to the `ArticleNote` DTO. */
export function toArticleNoteDto(row: ArticleNoteRow): ArticleNote {
  return {
    id: row.id,
    pageId: row.page_id,
    noteText: row.note_text,
    audioPath: row.audio_path,
    strokes: Array.isArray(row.strokes) ? row.strokes : [],
    position: row.position,
    isVisible: row.is_visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514 CHECK · 23503 FK · 42501 RLS. */
export function articleNoteDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "توجد ملاحظة أخرى بهذا المعرّف بالفعل." };
  if (code === "23514") return { status: 400, message: "بيانات الملاحظة غير صالحة." };
  if (code === "23503") return { status: 400, message: "الملاحظة تشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ الملاحظة." };
}
