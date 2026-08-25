"use client";

import { useCallback, useRef, useState } from "react";
import { ConsultationType, ScheduleMode } from "@/components/consultation/constants";
import {
  buildConsultationIntake,
  type ConsultationIntakeInput,
} from "@/components/consultation/buildConsultationIntake";
import { createWorkflowId, createWorkflowRequest } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest } from "@/lib/workflowStore";
import { uploadDocumentFile, isUploadTimeoutError } from "@/lib/services/documentService";
import { partitionUploadFiles } from "@/lib/services/fileValidation";
import { isSupabaseMode } from "@/lib/services/api";
import { useUser } from "@/hooks/useUser";

/**
 * useConsultationForm — state and submission for /book/consultation.
 *
 * WHAT THIS USED TO BE
 * The only asynchronous work in the entire public booking flow was
 * `await new Promise(r => setTimeout(r, 2200))`. It set `instantFound = true`
 * ("a lawyer was found"), and the last step then rendered a success screen
 * carrying a hardcoded reference number — #CL-20260330, the same one for every
 * visitor, forever. Nothing was ever sent anywhere. A visitor left this page
 * believing a consultation was booked, and no row existed.
 *
 * WHAT IT IS NOW
 * `submitBooking()` uploads whatever the client attached, creates a real
 * `service_requests` row on `receiver: "ai_workspace"` — the single predicate
 * GET /api/v1/admin/service-orders filters on, and therefore the only thing
 * that makes a request visible to the نظامي team — and returns the row's own
 * id. `confirmed` flips only after the server has answered. Nothing on the
 * success screen is a constant.
 *
 * WHY `instantSearching` / `handleInstantSearch` ARE GONE
 * They existed only to animate that 2200 ms sleep. There is no lawyer-matching
 * service to search, so a spinner labelled «نبحث عن محامٍ متاح» was asserting
 * an operation that never ran. `instantFound` is now `instantConfirmed`: the
 * client stating a timing preference, which is all this step was ever able to
 * collect. Every reader of these names is inside this cluster
 * (src/app/book/consultation/page.tsx and
 * src/components/consultation/steps/StepScheduling.tsx) — verified by grep
 * before the rename, so the blast radius is the three files changed together.
 */

/** One file that did not become an attachment on the created request. */
export interface ConsultationAttachFailure {
  name: string;
  reason: string;
}

/** What `submitBooking` needs that only the language-resolved page knows. */
export interface ConsultationSubmitContext {
  specialtyLabel: string;
  consultTypeLabel: string;
  estimatedPrice: string;
}

/**
 * Arabic for one failed upload. Mirrors attachmentErrorAr() in
 * src/app/dashboard/client/consultation/new/page.tsx for the same reason it
 * mirrors the hook's own private copy there: the timeout's sentence is read
 * back off `.message` so UploadTimeoutError stays the single source of that
 * wording, and the machine `.code` is logged because an UploadTimeoutError's
 * message is Arabic prose and no longer identifies the error in a console.
 */
function attachmentErrorAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error ? (err as { code?: unknown }).code : undefined;
  console.error("[book/consultation] attachment upload failed:", code ?? raw, raw);
  if (isUploadTimeoutError(err)) return err.message;
  if (raw === "upload_unavailable_demo") return "رفع المرفقات غير متاح في وضع العرض التجريبي.";
  if (raw === "Unauthorized") return "انتهت جلستك — يرجى تسجيل الدخول مجدداً.";
  return "تعذّر رفع الملف — تحقق من الاتصال وحاول مجدداً.";
}

/** Arabic for a failed request creation. `status` comes from WorkflowApiError. */
function submitErrorAr(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  console.error("[book/consultation] submit failed:", err);
  if (status === 401) return "انتهت جلستك — سجّل الدخول ثم أعد إرسال الطلب.";
  if (status === 400) {
    return err instanceof Error && err.message
      ? "بيانات الطلب غير مكتملة — راجع الخطوات السابقة ثم حاول مجدداً."
      : "بيانات الطلب غير مكتملة.";
  }
  return "تعذّر إرسال الطلب — تحقق من الاتصال وحاول مرة أخرى.";
}

export function useConsultationForm() {
  const user = useUser();

  const [step, setStep] = useState(1);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  /**
   * Real browser Files. This was `string[]` holding the literals "file0",
   * "file1", "file2", rendered through a `mockFileName(i)` that printed three
   * hardcoded Arabic filenames — «عقد_العمل.pdf» and friends — regardless of
   * what the client had. Nothing was ever selected, let alone uploaded.
   */
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [consultType, setConsultType] = useState<ConsultationType | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(null);
  const [calDay, setCalDay] = useState<string | null>(null);
  const [calTime, setCalTime] = useState<string | null>(null);
  const [asapDone, setAsapDone] = useState(false);
  /** The client confirmed "as soon as possible" as their preference. */
  const [instantConfirmed, setInstantConfirmed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [dir, setDir] = useState(1);

  // ── Submission ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  /** The created row's OWN id. Never a constant, never a locally minted value. */
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [attachFailures, setAttachFailures] = useState<ConsultationAttachFailure[]>([]);
  const [skippedNames, setSkippedNames] = useState<string[]>([]);
  /**
   * Files that already reached storage, keyed by the File object itself.
   *
   * The retry case is the whole reason this exists: if the uploads succeed and
   * then `createWorkflowRequest` fails, the client presses «إرسال الطلب» again —
   * and without this map every file would be uploaded a second time, leaving a
   * duplicate blob per attempt and charging the client another 60 s per file on
   * a link that has already proved slow. A ref, not state: it must be readable
   * inside the very call that writes it, and it never needs to paint.
   */
  const uploadedRef = useRef(new Map<File, { documentId: string; name: string; size: number }>());

  const canNext = () => {
    if (step === 1) return !!specialty;
    if (step === 2) return description.trim().length >= 20;
    if (step === 3) {
      if (!consultType) return false;
      if (consultType === "ai") return true;
      return scheduleMode !== null && (
        scheduleMode === "asap" ||
        (scheduleMode === "instant" && instantConfirmed) ||
        (scheduleMode === "calendar" && !!calTime)
      );
    }
    return true;
  };

  /**
   * Add files from a real <input type="file">, refusing anything the shared
   * validator refuses BEFORE it reaches the upload — same rule, same Arabic, as
   * every other attachment surface in the app (src/lib/services/fileValidation.ts).
   * Capped at three, which is the limit the old placeholder button enforced.
   */
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (list.length === 0) return;
    const { accepted, rejectedMessage } = partitionUploadFiles(list);
    setFileError(rejectedMessage ?? "");
    if (accepted.length === 0) return;
    setFiles((prev) => {
      const room = Math.max(0, 3 - prev.length);
      if (room === 0) {
        setFileError("الحد الأقصى ثلاثة ملفات.");
        return prev;
      }
      if (accepted.length > room) {
        setFileError(`الحد الأقصى ثلاثة ملفات — أُضيف ${room} منها فقط.`);
      }
      return [...prev, ...accepted.slice(0, room)];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError("");
  }, []);

  /**
   * Create the request. Resolves to the created row's id, or null on failure —
   * the caller reads `confirmed` / `submitError` rather than this value, but
   * returning it keeps the function honest about what happened.
   *
   * ORDER OF OPERATIONS — uploads first, then the row.
   * uploadDocumentFile() with no requestId leaves the attachment unbound, and
   * POST /api/v1/service-requests binds every id it finds in
   * `metadata.attachments[].documentId` to the row it just created (its own
   * "Task 9b" block, which enforces `owner_user_id = auth.uid()` and
   * `request_id IS NULL` server-side). Uploading first is what lets the created
   * row carry the real filenames and sizes that buildOrderPrompt() prints under
   * «## المرفقات» — and what lets this screen tell the client the truth about
   * their files instead of finding out after it has already said "تم".
   * The cost is an orphaned blob if the create then fails; `uploadedRef`
   * remembers what already reached storage so a retry does not upload it twice.
   */
  const submitBooking = useCallback(async (ctx: ConsultationSubmitContext): Promise<string | null> => {
    if (submitting || confirmed) return null;

    // Demo mode: createWorkflowRequest() falls back to localStorage, which
    // would paint a success screen over a row no one can ever see. Refuse
    // instead of faking it.
    if (!isSupabaseMode) {
      setSubmitError("حجز الاستشارات غير متاح في وضع العرض التجريبي.");
      return null;
    }
    // The booking needs a session: POST /api/v1/service-requests answers 401
    // without one, and an attachment has nowhere to live without an
    // owner_user_id. The page states this on step 4 before the button, so
    // reaching here signed-out means the session dropped mid-flow.
    if (!user.isLoggedIn || !user.userId) {
      setSubmitError("يلزم تسجيل الدخول لإرسال الطلب.");
      return null;
    }

    setSubmitting(true);
    setSubmitError("");
    setAttachFailures([]);
    setSkippedNames([]);

    try {
      // ── 1. Attachments ────────────────────────────────────────────────────
      // A per-file error is specific to that file and the rest of the selection
      // still deserves its try; a TIMEOUT means the link is not carrying data
      // and every remaining file would burn another 60 s proving it — so the
      // batch stops and the untried tail is named. Same split as
      // useOrderAttachments' attachFiles().
      const uploaded: Array<{ documentId: string; name: string; size: number }> = [];
      const failures: ConsultationAttachFailure[] = [];
      let skipped: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const already = uploadedRef.current.get(file);
        if (already) {
          uploaded.push(already);
          continue;
        }
        try {
          const doc = await uploadDocumentFile(file);
          // `doc.id` is declared string but attachments.id is a bigserial and
          // PostgREST serialises int8 as a JSON number — String() covers both,
          // exactly as the POST route's binding block does before its /^\d+$/.
          const record = { documentId: String(doc.id), name: file.name, size: file.size };
          uploadedRef.current.set(file, record);
          uploaded.push(record);
        } catch (err) {
          failures.push({ name: file.name, reason: attachmentErrorAr(err) });
          if (isUploadTimeoutError(err)) {
            skipped = files.slice(i + 1).map((f) => f.name);
            break;
          }
        }
      }
      setAttachFailures(failures);
      setSkippedNames(skipped);

      // ── 2. The request row ────────────────────────────────────────────────
      const { title, description: brief, intake, ids } = buildConsultationIntake({
        specialtyLabel: ctx.specialtyLabel,
        specialtyId: specialty,
        description,
        consultTypeLabel: ctx.consultTypeLabel,
        consultTypeId: consultType,
        estimatedPrice: ctx.estimatedPrice,
        scheduleMode,
        calDay,
        calTime,
      } satisfies ConsultationIntakeInput);

      const request = await createWorkflowRequest({
        id: createWorkflowId("CON"),
        type: "consultation",
        title,
        description: brief,
        requester: {
          userId: user.userId,
          name: user.name,
          role: user.userType,
          tier: user.tier,
        },
        // The one predicate that puts a row in front of the نظامي team
        // (GET /api/v1/admin/service-orders hard-filters on it). A booking on
        // any other receiver lands in the database and nobody ever sees it.
        receiver: "ai_workspace",
        // Free to submit, per the owner's ruling of 26 August: the team quotes
        // afterwards. `not_required` also keeps the row clear of the
        // payment-gateway gate in POST /api/v1/service-requests, which 402s a
        // paid request while the gateway is disabled — and it is.
        status: "pending_assignment",
        payment: { amount: 0, status: "not_required" },
        sourcePath: "/book/consultation",
        // The cast is a pre-existing type bug, not a shortcut: `service_requests.
        // metadata` is jsonb and every AI order already stores a nested `intake`
        // and `attachments[]` there, but `WorkflowRequest["metadata"]` in
        // src/lib/workflowStore.ts is declared `Record<string, string | number |
        // boolean | null>` — scalars only. createServiceOrder() side-steps it by
        // POSTing through apiMutate instead of createWorkflowRequest, which is
        // why nobody has hit this. Widening that type is a shared-file change and
        // is reported in `skipped`; until then this cast is narrowed to the one
        // call site rather than being spread across the app.
        metadata: {
          service: "consultation",
          // Rendered verbatim as the order's subtitle in «طلباتي»
          // (src/app/ai/orders/page.tsx) and as the heading of the team's brief
          // (buildOrderPrompt). Neither keys off `service`, so an order outside
          // the four AI services renders correctly in both — verified before
          // choosing "consultation" as the key.
          serviceTitleAr: "حجز استشارة قانونية",
          intake,
          // Machine ids, ABOVE the intake on purpose: buildSummaryRows() walks
          // `intake` onto two Arabic screens and prints any key it has no label
          // for under its raw English name. See ConsultationSubmission.intake.
          ...ids,
          // Read by buildOrderPrompt() for «## المرفقات» and by the POST
          // route's binding block, which needs `documentId`.
          attachments: uploaded,
          // What the client tried to send and could not. Without this the team
          // has no idea a document was meant to exist — the client is told on
          // screen, but the person fulfilling the order is not.
          ...(failures.length > 0
            ? { attachmentFailures: failures.map((f) => `${f.name}: ${f.reason}`) }
            : {}),
          ...(skipped.length > 0 ? { attachmentsNotAttempted: skipped } : {}),
        } as unknown as WorkflowRequest["metadata"],
        auditEvent: "public_consultation_booked",
      });

      // Success is asserted only here, off the server's own answer. `confirmed`
      // is the flag the last step reads to render the success screen; before
      // this change it was set by an onClick handler with no await in front of
      // it at all.
      setReferenceId(request.id);
      setConfirmed(true);
      return request.id;
    } catch (err) {
      setSubmitError(submitErrorAr(err));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting, confirmed, user.isLoggedIn, user.userId, user.name, user.userType, user.tier,
    files, specialty, description, consultType, scheduleMode, calDay, calTime,
  ]);

  const goNext = () => { setDir(1); setStep(s => s + 1); };
  const goPrev = () => { setDir(-1); setStep(s => s - 1); };

  return {
    step, setStep,
    specialty, setSpecialty,
    description, setDescription,
    files, addFiles, removeFile,
    fileError,
    consultType, setConsultType,
    scheduleMode, setScheduleMode,
    calDay, setCalDay,
    calTime, setCalTime,
    asapDone, setAsapDone,
    instantConfirmed, setInstantConfirmed,
    confirmed,
    dir, setDir,
    canNext,
    goNext,
    goPrev,
    // submission
    submitBooking,
    submitting,
    submitError,
    referenceId,
    attachFailures,
    skippedNames,
    // Preconditions, so step 4 can state them BEFORE the button is pressed
    // rather than turning them into an error afterwards.
    isLoggedIn: user.isLoggedIn,
    sessionLoading: user.loading,
    backendDisabled: !isSupabaseMode,
  };
}
