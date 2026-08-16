import { useState } from "react";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import { uploadDocumentFile } from "@/lib/services/documentService";

/**
 * Map a thrown attachFile error to Arabic user-facing copy. The underlying
 * message (which may be an internal token like "upload_unavailable_demo" or
 * a raw Postgres/storage error) is logged for developers but never shown to
 * the user.
 */
function attachErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[useOrderAttachments] attachFile failed:", raw);
  if (raw === "upload_unavailable_demo") {
    return "رفع المرفقات غير متاح في وضع العرض التجريبي — تواصل مع الفريق لتفعيل الحساب.";
  }
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  return "تعذّر رفع الملف — تحقق من الاتصال وحاول مجدداً";
}

/**
 * useOrderAttachments — real file-upload state for AI service order wizards.
 *
 * Extracted from useDraftState (الصائغ القانوني — the only shipped service
 * with a working upload flow) so the other three services can reuse it
 * instead of re-implementing it. Behaviour-preserving move — see
 * useDraftState.ts for the original.
 */
export function useOrderAttachments() {
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [attachError, setAttachError] = useState("");

  /**
   * Upload a file and record it as an attachment. Returns the created
   * OrderAttachment (with the real documentId) so callers — e.g. StepCase —
   * can associate it with the UI row that triggered the upload, for later
   * removal via removeAttachment(). Throws on failure; callers are expected
   * to revert whatever optimistic UI state (a display filename) they set.
   */
  async function attachFile(file: File): Promise<OrderAttachment> {
    setAttachError("");
    setUploading(true);
    try {
      const doc = await uploadDocumentFile(file);
      const attachment: OrderAttachment = {
        documentId: doc.id, name: doc.file_name, size: doc.size_bytes ?? 0,
      };
      setAttachments((prev) => [...prev, attachment]);
      return attachment;
    } catch (err) {
      setAttachError(attachErrorMessageAr(err));
      throw err;
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(documentId: string): void {
    setAttachments((prev) => prev.filter((a) => a.documentId !== documentId));
  }

  function clearAttachError(): void {
    setAttachError("");
  }

  return { attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError };
}
