import { useState, useRef } from "react";
import {
  CLIENT_VISIBLE_STEPS, StepKey, VisibleStepKey, PartyData, EMPTY_PARTY, SupportDoc, MEMO_MAIN_TYPES,
} from "@/components/draft/draftConstants";
import { validateDraftIntake } from "@/lib/services/orderIntake";
import { createServiceOrder } from "@/lib/services/serviceOrders";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";

/**
 * Resolve a raw memoType id (e.g. "case") to its Arabic label ("تحرير دعوى")
 * for human-facing copy (order title, notifications). Falls back to a
 * generic Arabic label for empty/unrecognised ids (e.g. the specialist-mode
 * ids that have no MEMO_MAIN_TYPES entry). Does NOT affect the raw id stored
 * in metadata.intake.memoType — that stays the machine value.
 */
function memoTypeLabelAr(memoType: string): string {
  return MEMO_MAIN_TYPES.find((mt) => mt.id === memoType)?.label || "مذكرة";
}

/**
 * Map a thrown submit error to Arabic user-facing copy. The underlying
 * message (which may be English — "Unauthorized", a raw Postgres error,
 * etc.) is logged for developers via console.error but never shown to the
 * user; the user only ever sees one of a small set of known-safe Arabic
 * strings.
 */
function submitErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[useDraftState] submitOrder failed:", raw);
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  return "تعذّر إرسال الطلب — حاول مجدداً";
}

export function useDraftState(initialMode = "") {
  // Seed initial values from ?mode= query param
  function seedFromMode(mode: string): { memoType: string; legalBranch: string } {
    switch (mode) {
      case "arbitration": return { memoType: "arbitration", legalBranch: "تحكيم" };
      case "notary":      return { memoType: "notary",      legalBranch: "مدني" };
      case "report":      return { memoType: "report",      legalBranch: "" };
      case "minutes":     return { memoType: "minutes",     legalBranch: "" };
      case "reply":       return { memoType: "reply",       legalBranch: "" };
      default:            return { memoType: "",             legalBranch: "" };
    }
  }
  const seed = seedFromMode(initialMode);
  const [step, setStep]           = useState<StepKey | VisibleStepKey>("identify");
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied]       = useState(false);

  // Client sharing
  const [shareLink, setShareLink]         = useState<string | null>(null);
  const [sharePasscode, setSharePasscode] = useState<string | null>(null);
  const [linkCopied, setLinkCopied]       = useState(false);
  const [clientEmail, setClientEmail]     = useState("");
  const [clientPhone, setClientPhone]     = useState("");

  // Step 1 state
  const [clientRole, setClientRole]   = useState<"plaintiff" | "defendant" | "">("");
  const [memoType, setMemoType]       = useState(seed.memoType);
  const [memoSubType, setMemoSubType] = useState("");
  const [legalBranch, setLegalBranch] = useState(seed.legalBranch);
  const [notesText, setNotesText]     = useState("");
  const [showPreFiling, setShowPreFiling] = useState(false);
  const [preFilingAnswers, setPreFilingAnswers] = useState<string[]>([]);

  // Step 2 state
  const [caseText, setCaseText]           = useState("");
  const [caseFile, setCaseFile]           = useState<string | null>(null);
  const [supportDocs, setSupportDocs]     = useState<SupportDoc[]>([]);
  const [lawyerNotes, setLawyerNotes]     = useState("");
  const [useFirmMemory, setUseFirmMemory] = useState(false);
  const [bulkUpload, setBulkUpload]       = useState(false);
  const [customLegalTexts, setCustomLegalTexts] = useState("");
  const [disputeSummary, setDisputeSummary]     = useState("");

  // Party data (only for تحرير دعوى)
  const [partyOne, setPartyOne] = useState<PartyData>({ ...EMPTY_PARTY });
  const [partyTwo, setPartyTwo] = useState<PartyData>({ ...EMPTY_PARTY });

  // بيانات الحكم المطعون فيه (for طعن / رد / استئناف)
  const [judgmentNumber,  setJudgmentNumber]  = useState("");
  const [judgmentCourt,   setJudgmentCourt]   = useState("");
  const [judgmentDate,    setJudgmentDate]    = useState("");
  const [judgmentText,    setJudgmentText]    = useState("");
  const [judgmentReasons, setJudgmentReasons] = useState("");
  const [plaintiffName,   setPlaintiffName]   = useState("");
  const [defendantName,   setDefendantName]   = useState("");

  // Step 7
  const [reviewPhase, setReviewPhase] = useState(0);

  // ── Submit step state ───────────────────────────────────────────────────
  const [submitNotes, setSubmitNotes]   = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  // Real file uploads — extracted into useOrderAttachments() so the other
  // three AI services can reuse the same implementation. `attachments` is
  // re-exposed here as `uploadedAttachments` to keep this hook's public
  // surface unchanged for /ai/draft's components.
  const {
    attachments: uploadedAttachments,
    uploading,
    attachError,
    attachFile,
    attachFiles,
    removeAttachment,
  } = useOrderAttachments();

  function buildSummary(): { label: string; value: string }[] {
    return [
      { label: "صفة الموكل", value: clientRole === "plaintiff" ? "مدعٍ" : clientRole === "defendant" ? "مدعى عليه" : "" },
      { label: "نوع المذكرة", value: memoType },
      { label: "التصنيف", value: memoSubType },
      { label: "الفرع القانوني", value: legalBranch },
      { label: "الوقائع", value: caseText.slice(0, 120) + (caseText.length > 120 ? "…" : "") },
    ];
  }

  function buildIntake(): Record<string, unknown> {
    return {
      schemaVersion: 1,
      service: "draft",
      clientRole, memoType, memoSubType, legalBranch, caseText,
      parties: { one: partyOne, two: partyTwo },
      judgment: {
        number: judgmentNumber, court: judgmentCourt, date: judgmentDate,
        text: judgmentText, reasons: judgmentReasons,
      },
      // notesText (StepIdentify's "ملاحظات ومرئيات") used to be collected on
      // screen and then silently dropped here — never reaching the admin.
      // Folded into the same free-text field lawyerNotes/submitNotes already
      // join, rather than dropping it (Task C6).
      lawyerNotes: [notesText, lawyerNotes, submitNotes].filter(Boolean).join("\n\n"),
      attachments: uploadedAttachments,
    };
  }

  async function submitOrder(): Promise<void> {
    setSubmitErrors([]);
    const intake = buildIntake();
    const check = validateDraftIntake(intake);
    if (!check.ok) { setSubmitErrors(check.errors); return; }

    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", user.id).single()
        : { data: null };

      const order = await createServiceOrder({
        service: "draft",
        title: `${memoTypeLabelAr(memoType)} — ${legalBranch || "عام"}`,
        description: caseText.slice(0, 200),
        intake: check.value as unknown as Record<string, unknown>,
        attachments: uploadedAttachments,
        requester: {
          name: profile?.display_name ?? undefined,
          phone: profile?.phone ?? undefined,
          email: profile?.email ?? undefined,
        },
      });
      window.location.href = `/ai/orders/${order.id}`;
    } catch (err) {
      setSubmitErrors([submitErrorMessageAr(err)]);
    } finally {
      setSubmitting(false);
    }
  }

  // Refs
  const caseFileRef = useRef<HTMLInputElement>(null);
  const attachRefs  = useRef<(HTMLInputElement | null)[]>([]);

  // Support docs helpers
  function addDoc() {
    setSupportDocs(prev => [...prev, { id: Date.now(), description: "", file: null }]);
  }
  function removeDoc(id: number) {
    setSupportDocs(prev => prev.filter(d => d.id !== id));
  }
  function updateDoc(id: number, field: "description" | "file" | "isLargeFile", val: string | boolean | null) {
    setSupportDocs(prev => prev.map(d => d.id === id ? { ...d, [field]: val } : d));
  }

  // Share link
  function generateShareLink() {
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    const code  = String(Math.floor(100000 + Math.random() * 900000));
    setShareLink(`https://nzamy.sa/share/${token}`);
    setSharePasscode(code);
  }

  // Navigation
  // Walks CLIENT_VISIBLE_STEPS (identify -> case -> submit), not the full
  // 8-item STEPS array — the hidden mock steps are not part of the client
  // navigation flow. See draftConstants.ts CLIENT_VISIBLE_STEPS.
  const currentStepIndex = CLIENT_VISIBLE_STEPS.findIndex(s => s.key === step);

  function canProceed() {
    if (step === "identify") {
      // Specialist modes (arbitration, notary, report, minutes) don't use
      // plaintiff/defendant framing — clientRole is N/A for them.
      // They are pre-seeded with memoType+legalBranch so they can proceed.
      const specialistModes = ["arbitration", "notary", "report", "minutes"];
      if (specialistModes.includes(memoType)) {
        return !!(memoType && memoSubType);  // only subType needed
      }
      return !!(clientRole && memoType && legalBranch && memoSubType);
    }
    if (step === "case")     return caseText.trim().length > 10 || !!caseFile;
    return true;
  }

  function nextStep() {
    const idx = currentStepIndex;
    if (idx >= CLIENT_VISIBLE_STEPS.length - 1) return;

    // Auto-extract/mock data between steps (no real processing delay any more —
    // there is nothing between these steps to wait on).
    if (step === "case" || step === "identify") {
      // Judgment data (judgmentNumber/Court/Date/plaintiffName/defendantName/
      // judgmentText/judgmentReasons) used to be silently mock-filled here for
      // رد/طعن memo types: fabricated court/party names/amounts shipping inside
      // real orders, invisible to both the client (no UI showed them) and the
      // admin fulfilling the order (no way to tell they weren't the client's
      // own account). Removed per Task C6, and it is not coming back — the
      // fields are client-supplied now: StepCase renders JudgmentHeader for the
      // REQUIRES_JUDGMENT_HEADER memo types, so what the client types is what
      // reaches buildIntake()'s `judgment` object. Five of the seven, at least
      // — validateDraftIntake() rebuilds `judgment` from an allowlist of
      // number/court/date/text/reasons (orderIntake.ts), so plaintiffName and
      // defendantName are dropped on submit no matter what is put here. They
      // need a slot in DraftIntakeV1 before buildIntake() can carry them.

      // Auto-extract or mock the case/reply facts summary when moving from step 2 to 3
      if (step === "case") {
        if (memoType === "case" && !disputeSummary) {
          const summaryText = caseText.trim().length > 15
            ? `دعوى بموضوع: ${caseText.trim().slice(0, 100)}...`
            : `دعوى قضائية (${legalBranch || "عامة"}) تهدف إلى المطالبة بالحقوق والمستحقات المذكورة في الوقائع استناداً للأنظمة المرعية.`;
          setDisputeSummary(summaryText);
        } else if (memoType === "reply" && !disputeSummary) {
          const summaryText = caseText.trim().length > 15
            ? `مذكرة رد على وقائع النزاع المتعلقة بـ: ${caseText.trim().slice(0, 100)}...`
            : `مذكرة رد وتفنيد لادعاءات المدعي في القضية (${legalBranch || "عامة"}) لعدم استنادها لأساس نظامي صحيح.`;
          setDisputeSummary(summaryText);
        }
      }
    }
    setStep(CLIENT_VISIBLE_STEPS[idx + 1].key);
  }

  function prevStep() {
    if (currentStepIndex <= 0) return;
    setStep(CLIENT_VISIBLE_STEPS[currentStepIndex - 1].key);
  }

  return {
    // step nav
    step, setStep, currentStepIndex, processing, canProceed, nextStep, prevStep,
    // step 1
    clientRole, setClientRole, memoType, setMemoType,
    memoSubType, setMemoSubType, legalBranch, setLegalBranch,
    notesText, setNotesText, showPreFiling, setShowPreFiling,
    preFilingAnswers, setPreFilingAnswers,
    // step 2
    caseText, setCaseText, caseFile, setCaseFile,
    supportDocs, addDoc, removeDoc, updateDoc,
    lawyerNotes, setLawyerNotes, useFirmMemory, setUseFirmMemory,
    bulkUpload, setBulkUpload, customLegalTexts, setCustomLegalTexts,
    disputeSummary, setDisputeSummary,
    partyOne, setPartyOne, partyTwo, setPartyTwo,
    // step 7
    reviewPhase, setReviewPhase,
    // submit step
    submitNotes, setSubmitNotes, submitting, setSubmitting, submitErrors,
    uploadedAttachments, uploading, attachError,
    buildSummary, submitOrder, attachFile, attachFiles, removeAttachment,
    // sharing
    shareLink, setShareLink, sharePasscode, setSharePasscode,
    linkCopied, setLinkCopied, clientEmail, setClientEmail,
    clientPhone, setClientPhone, generateShareLink,
    // judgment data
    judgmentNumber, setJudgmentNumber, judgmentCourt, setJudgmentCourt,
    judgmentDate, setJudgmentDate, judgmentText, setJudgmentText,
    judgmentReasons, setJudgmentReasons,
    plaintiffName, setPlaintiffName, defendantName, setDefendantName,
    // tools
    copied, setCopied, caseFileRef, attachRefs,
  };
}
