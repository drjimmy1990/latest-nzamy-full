/**
 * The text an admin screen shows when an API call is refused (owner answer
 * ٢١٠, Task 3.4).
 *
 * A refusal (400/401/403/404/409/503) carries its reason in `error`, in
 * Arabic: «هذا الإجراء لقيادة المنصة فقط», «لا يمكن إزالة آخر مشرف رئيسي»…
 * Showing a fixed «صلاحيات المسؤول مطلوبة» instead hid the real reason. A 500
 * keeps the screen's own text, because several admin routes put the raw
 * Postgres message (English) there; for the same reason an error with no
 * Arabic letter in it (a GoTrue or Postgres string) is never shown.
 *
 * Pure, no imports (`node --test` loads it: ./apiErrorText.test.ts).
 */

const REFUSAL_STATUSES = new Set([400, 401, 403, 404, 409, 503]);
const ARABIC_LETTER = /[؀-ۿ]/;

export function apiErrorText(status: number, body: unknown, fallback: string): string {
  if (!REFUSAL_STATUSES.has(status)) return fallback;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "string") return fallback;
  const text = error.trim();
  return text !== "" && ARABIC_LETTER.test(text) ? text : fallback;
}
