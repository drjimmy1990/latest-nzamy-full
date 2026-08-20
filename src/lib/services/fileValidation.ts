/**
 * One place that decides whether a file may be uploaded. Every service goes
 * through useOrderAttachments, so putting the rule here is what makes it true
 * everywhere instead of only in contracts review mode.
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
