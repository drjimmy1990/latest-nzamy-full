/**
 * _shared.ts — Postgres error → Arabic response for the settings/preferences
 * route. Mirrors the pattern in
 * src/app/api/v1/lawyer/consultations/_shared.ts:197-209 (23505 duplicate ·
 * 23514 CHECK · 23503 FK · 42501 RLS · else 500), adapted to `user_settings`
 * and the two `*_profiles.display_mode` write-through columns.
 */

export function preferencesDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "هذا السجل موجود مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات الإعدادات غير صالحة." };
  if (code === "23503") return { status: 400, message: "الإعدادات تشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ الإعدادات." };
}
