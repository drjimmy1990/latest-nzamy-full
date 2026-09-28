/**
 * Date guard for the lawyer's «جدولة استشارة جديدة» modal.
 *
 * The date is optional — left blank, the consultation stays «بانتظار
 * الجدولة» until a real one is set — but a date that IS given must not be in
 * the past. `today` is the Saudi civil date ("YYYY-MM-DD", from
 * saudiCalendarDate) computed by the caller at render time, never a
 * module-level `new Date()` frozen at build/SSR time. An empty `today` (not
 * read yet, before mount) skips the past-date check rather than guessing.
 *
 * Both values are ISO calendar strings, so plain string comparison orders
 * them correctly.
 */
export const PAST_BOOKING_DATE_AR = "لا يمكن جدولة استشارة بتاريخ مضى. اختر تاريخ اليوم أو تاريخاً لاحقاً.";

export function bookingDateError(date: string, today: string): string | null {
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "صيغة التاريخ غير صحيحة.";
  return today && date < today ? PAST_BOOKING_DATE_AR : null;
}
