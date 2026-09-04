/**
 * _trashCopy.ts — pure Arabic copy and formatting for the documents bin
 * (سلة المحذوفات), legal hold and the delete-to-bin confirmation, shared by
 * DocumentsTrashPanel.tsx and the five documents pages that embed it.
 *
 * Deliberately independent of documentService.ts: every function here takes
 * plain primitives (a name, a boolean) rather than a `Document` row or an
 * `Error` instance, so this module can be unit-tested with `node --test`
 * without pulling in a "use client" service that constructs a Supabase
 * browser client at import time. Callers compute `isDocumentTimeoutError(err)`
 * themselves and pass the boolean in.
 */

// Relative import WITH the .ts extension, not the "@/" alias — `node --test`
// (this module's own test file) resolves relative ESM specifiers but does not
// read tsconfig's `paths`, so an alias import here would make the pure
// module untestable. `allowImportingTsExtensions` (tsconfig.json) is what
// lets tsc and the Next.js bundler accept the explicit extension too.
import { toArabicDigits } from "../../lib/services/arabicCount.ts";

// ─── Delete → bin ───────────────────────────────────────────────────────────

/**
 * The mandated sentence (Phase 6 task spec, verified against
 * `PURGE_AFTER_DAYS` in src/lib/services/attachmentPurge.ts — the cron
 * really does purge at 30 days): a soft delete moves the file to the bin, and
 * only the bin's own 30-day cron — or an explicit «حذف نهائي» — removes it
 * for good. The old copy («لا يمكن التراجع») stopped being true the moment
 * deleteDocument() became a soft delete and is replaced everywhere it appears.
 */
export const DELETE_TO_BIN_NOTICE_AR =
  "سيُنقل إلى السلة ويُحذف نهائياً بعد ٣٠ يوماً.";

/** The confirm() prompt a page shows before calling deleteDocument(). */
export function confirmDeleteToBinAr(name: string): string {
  return `حذف المستند «${name}»؟ ${DELETE_TO_BIN_NOTICE_AR}`;
}

/** The success notice after a soft delete — replaces any "تم الحذف" wording that implied the file was gone for good. */
export function deletedToBinNoticeAr(name: string): string {
  return `تم نقل «${name}» إلى سلة المحذوفات.`;
}

// ─── Permanent delete (from the bin) ────────────────────────────────────────

/** The confirm() prompt before purgeDocument() — this one really is irreversible. */
export function confirmPurgeAr(name: string): string {
  return `حذف «${name}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء إطلاقاً.`;
}

/**
 * `timedOut`: pass `isDocumentTimeoutError(err)`. A timeout on a DELETE may
 * still have been executed server-side (see withTimeout()'s doc in
 * documentService.ts), so it is reported as "unconfirmed", not "failed" —
 * the same distinction dashboard/client/documents/page.tsx already draws for
 * the ordinary soft delete.
 */
export function purgeFailureAr(name: string, timedOut: boolean): string {
  return timedOut
    ? `تعذّر تأكيد الحذف النهائي لـ «${name}» — انتهت المهلة قبل وصول ردّ الخادم، وقد يكون الحذف قد تم فعلاً. حدّث الصفحة للتحقق.`
    : `فشل الحذف النهائي لـ «${name}». حاول مرة أخرى.`;
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export function restoreFailureAr(name: string, timedOut: boolean): string {
  return timedOut
    ? `تعذّر تأكيد استعادة «${name}» — انتهت المهلة قبل وصول ردّ الخادم، وقد تكون الاستعادة قد تمت فعلاً. حدّث الصفحة للتحقق.`
    : `فشلت استعادة «${name}». حاول مرة أخرى.`;
}

export function restoredNoticeAr(name: string): string {
  return `تمت استعادة «${name}» من السلة.`;
}

// ─── The bin's own read ──────────────────────────────────────────────────────

export const TRASH_LOAD_FAILURE_AR = "تعذّرت قراءة سلة المحذوفات. حاول مرة أخرى لاحقاً.";
export const TRASH_EMPTY_AR = "سلة المحذوفات فارغة.";
export const TRASH_REQUIRES_BACKEND_AR = "سلة المحذوفات تتطلب الاتصال بقاعدة البيانات.";

// ─── Legal hold («حجز قانوني») ────────────────────────────────────────────────

/** Mirrors MAX_HOLD_REASON_LEN in src/app/api/v1/documents/[id]/hold/route.ts. */
export const MAX_HOLD_REASON_LEN = 300;

export function holdReasonTooLongAr(): string {
  return `سبب الحجز طويل جداً (بحد أقصى ${toArabicDigits(MAX_HOLD_REASON_LEN)} حرفاً).`;
}

/**
 * `timedOut`: pass `isDocumentTimeoutError(err)`. `turningOn`: true when the
 * failed call was trying to SET the hold, false when it was trying to CLEAR
 * it — the two verbs must not be swapped, since a lawyer reading "تعذّر
 * إلغاء الحجز" after pressing "حجز قانوني" would believe the wrong thing
 * about the document's current state.
 */
export function holdFailureAr(name: string, turningOn: boolean, timedOut: boolean): string {
  const verb = turningOn ? "تفعيل الحجز القانوني على" : "إلغاء الحجز القانوني عن";
  return timedOut
    ? `تعذّر تأكيد ${verb} «${name}» — انتهت المهلة قبل وصول ردّ الخادم. حدّث الصفحة للتحقق.`
    : `تعذّر ${verb} «${name}». حاول مرة أخرى.`;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/**
 * «١٥ أغسطس ٢٠٢٦» — Gregorian, Arabic month name, Arabic-Indic digits.
 *
 * Deliberately NOT `new Date(iso).toLocaleDateString('ar-SA')`: ICU resolves
 * the `ar-SA` locale to the Umm al-Qura calendar, so that call silently
 * returns a HIJRI date («١٥‏/٨‏/١٤٤٧ هـ») rather than the Gregorian one — the
 * exact trap dashboard/client/documents/page.tsx's own `Doc.uploadedAtMs`
 * comment names. Parsed by regex instead, mirroring formatGregorianAr in
 * dashboard/lawyer/_components/DeadlineCard.tsx (a different consumer, hence
 * this file keeps its own copy of AR_MONTHS rather than importing across a
 * page's private `_components` folder into a shared one).
 *
 * `deleted_at` is a full timestamp ("2026-09-04T12:00:00.000Z"), not the bare
 * "YYYY-MM-DD" that function expects, so the regex here matches a *prefix*
 * rather than the whole string.
 */
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function formatDeletedAtAr(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const monthName = AR_MONTHS[month - 1];
  if (!monthName) return iso;
  return `${toArabicDigits(day)} ${monthName} ${toArabicDigits(year)}`;
}
