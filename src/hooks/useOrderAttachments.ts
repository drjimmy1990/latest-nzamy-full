import { useState } from "react";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import { uploadDocumentFile } from "@/lib/services/documentService";
import { validateUploadFile, partitionUploadFiles } from "@/lib/services/fileValidation";

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

  // Actually performs the upload for a file already known to pass
  // validateUploadFile — shared by attachFile (single, throws on failure)
  // and attachFiles (batch, collects failures instead of throwing).
  async function uploadAndRecord(file: File): Promise<OrderAttachment> {
    const doc = await uploadDocumentFile(file);
    const attachment: OrderAttachment = {
      documentId: doc.id, name: doc.file_name, size: doc.size_bytes ?? 0,
    };
    setAttachments((prev) => [...prev, attachment]);
    return attachment;
  }

  /**
   * Upload a file and record it as an attachment. Returns the created
   * OrderAttachment (with the real documentId) so callers — e.g. StepCase —
   * can associate it with the UI row that triggered the upload, for later
   * removal via removeAttachment(). Throws on failure; callers are expected
   * to revert whatever optimistic UI state (a display filename) they set.
   */
  async function attachFile(file: File): Promise<OrderAttachment> {
    setAttachError("");
    // Refuse locally before spending a round trip, and before any caller's
    // optimistic filename has to be reverted.
    const rejection = validateUploadFile(file);
    if (rejection) {
      setAttachError(rejection);
      throw new Error("file_rejected");
    }
    setUploading(true);
    try {
      return await uploadAndRecord(file);
    } catch (err) {
      setAttachError(attachErrorMessageAr(err));
      throw err;
    } finally {
      setUploading(false);
    }
  }

  /**
   * Upload every acceptable file from a multi-select in one batch. Unlike
   * looping attachFile() over the selection, this validates the whole batch
   * up front and sets attachError exactly once at the end — so a file
   * rejected early in the selection is not silently wiped by a later file's
   * success. (attachFile() resets attachError at the start of every one of
   * its own calls; that is correct for a single retry but wrong across a
   * batch, since call N+1 would clear the rejection call N just set.)
   * Never throws — callers just render attachError and get back whatever
   * of the selection actually attached.
   */
  async function attachFiles(fileList: FileList | File[]): Promise<OrderAttachment[]> {
    const files = Array.from(fileList);
    setAttachError("");
    const { accepted, rejectedMessage } = partitionUploadFiles(files);
    const attached: OrderAttachment[] = [];
    const problems: string[] = rejectedMessage ? [rejectedMessage] : [];

    if (accepted.length > 0) {
      setUploading(true);
      try {
        for (const file of accepted) {
          try {
            attached.push(await uploadAndRecord(file));
          } catch (err) {
            problems.push(`${file.name}: ${attachErrorMessageAr(err)}`);
          }
        }
      } finally {
        setUploading(false);
      }
    }

    if (problems.length > 0) {
      setAttachError(problems.join("، "));
    }
    return attached;
  }

  function removeAttachment(documentId: string): void {
    setAttachments((prev) => prev.filter((a) => a.documentId !== documentId));
  }

  function clearAttachError(): void {
    setAttachError("");
  }

  return { attachments, uploading, attachError, attachFile, attachFiles, removeAttachment, clearAttachError };
}
