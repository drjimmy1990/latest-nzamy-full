/**
 * One place that decides whether a file may be uploaded. Every service goes
 * through useOrderAttachments, so putting the rule here is what makes it true
 * everywhere instead of only in contracts review mode.
 *
 * Client-side only: neither documentService.ts nor the /api/v1/documents
 * route enforces a size or type limit server-side, so this check can be
 * bypassed by a direct API call. It still belongs here — it gives the
 * client an immediate, specific reason instead of a silent oversized
 * upload or a generic failure after a wasted round trip.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf", "doc", "docx", "png", "jpg", "jpeg",
] as const;

export function validateUploadFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!ext || !(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    return "صيغة الملف غير مدعومة — المسموح: PDF أو Word أو صورة.";
  }
  if (file.size <= 0) {
    return "الملف فارغ — اختر ملفاً يحتوي على محتوى.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "حجم الملف كبير جداً — الحجم الأقصى المسموح به ٢٠ ميجابايت.";
  }
  return null;
}

/**
 * Validate a whole batch in one pass and combine the rejections into a
 * single Arabic message naming every file that was refused. Used by
 * useOrderAttachments' attachFiles so a multi-file selection is checked
 * before any upload starts, instead of validating one file at a time —
 * which would let a later file's success clear an earlier file's rejection,
 * since each single-file attachFile() call resets attachError at its own
 * start (see useOrderAttachments.ts).
 */
export function partitionUploadFiles<T extends { name: string; size: number }>(
  files: readonly T[],
): { accepted: T[]; rejectedMessage: string | null } {
  const accepted: T[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const reason = validateUploadFile(file);
    if (reason) {
      problems.push(`${file.name}: ${reason}`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejectedMessage: problems.length > 0 ? problems.join("، ") : null };
}
