import { useState } from "react";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import { uploadDocumentFile, isUploadTimeoutError } from "@/lib/services/documentService";
import { validateUploadFile, partitionUploadFiles } from "@/lib/services/fileValidation";

/**
 * Map a thrown attachFile error to Arabic user-facing copy. The underlying
 * message (which may be an internal token like "upload_unavailable_demo" or
 * a raw Postgres/storage error) is logged for developers but never shown to
 * the user.
 */
function attachErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Log the machine cause alongside the message: an UploadTimeoutError's
  // message is Arabic prose, so `raw` alone no longer identifies it in a
  // developer console.
  const code = err instanceof Error ? (err as { code?: unknown }).code : undefined;
  console.error("[useOrderAttachments] attachFile failed:", code ?? raw, raw);
  // The timeout already carries its own Arabic copy in `.message` — see
  // UploadTimeoutError in documentService.ts. Reading it back rather than
  // repeating the sentence here keeps one source of truth for the wording.
  if (isUploadTimeoutError(err)) {
    return err.message;
  }
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
   * up front and clears attachError exactly once, at the start — so a file
   * rejected early in the selection is not silently wiped by a later file's
   * success. (attachFile() resets attachError at the start of every one of
   * its own calls; that is correct for a single retry but wrong across a
   * batch, since call N+1 would clear the rejection call N just set.) Every
   * later write is cumulative: `problems` only ever grows, and each
   * setAttachError() re-renders the whole accumulated list.
   * Never throws — callers just render attachError and get back whatever
   * of the selection actually attached.
   *
   * TWO RULES ABOUT WHEN FAILURES REACH THE SCREEN — every consumer of this
   * hook uses a `multiple` file input, and each file carries its own
   * independent 60-second ceiling (documentService.ts). Reporting only after
   * the loop meant a client who selected five files on a dead link saw nothing
   * for five minutes, with the wizard's buttons disabled the whole time — the
   * frozen screen the timeout exists to remove.
   *
   *   1. Report as we go. setAttachError() is called the moment any file
   *      fails, so something is on screen at 60 seconds instead of at N × 60.
   *   2. A TIMEOUT — and only a timeout — ends the batch. A timeout means the
   *      link is not carrying data, so spending another four minutes proving
   *      it is itself the freeze. Every other failure is specific to one file
   *      (a server rejection, a bad file) and must not cancel the rest.
   *
   * Deliberately NOT one 60-second deadline around the whole batch: five 20 MB
   * files on a slow-but-working link legitimately take minutes, and a batch
   * deadline would kill uploads that are succeeding. The per-file ceiling is a
   * per-request hang detector, which is the right instrument.
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
        // Indexed rather than for-of: on an abort we need the tail of the
        // selection by position, to name what was never attempted.
        for (let i = 0; i < accepted.length; i++) {
          const file = accepted[i];
          try {
            attached.push(await uploadAndRecord(file));
          } catch (err) {
            problems.push(`${file.name}: ${attachErrorMessageAr(err)}`);
            if (isUploadTimeoutError(err)) {
              // Name the untried files so nothing disappears silently. If the
              // timeout hit the last file there is no tail, and claiming there
              // is one would be a false statement on screen.
              const untried = accepted.slice(i + 1).map((f) => f.name);
              if (untried.length > 0) {
                problems.push(`لم تتم محاولة رفع: ${untried.join("، ")} — توقّف الرفع بعد انتهاء المهلة.`);
              }
              setAttachError(problems.join("، "));
              break;
            }
            // Rule 1: surface this file's failure now, then carry on with the
            // rest of the selection.
            setAttachError(problems.join("، "));
          }
        }
      } finally {
        setUploading(false);
      }
    }

    // Still required after the loop: when every file was rejected locally,
    // `accepted` is empty, the loop never runs, and this is the only call that
    // puts partitionUploadFiles' rejection message on screen.
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
