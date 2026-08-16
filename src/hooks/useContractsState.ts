import { useState, useCallback } from "react";
import { STEPS_DRAFT, STEPS_DRAFT_SIMPLE, STEPS_REVIEW, StepKey, PartyData, EMPTY_PARTY } from "@/components/contracts/types";
import { INITIAL_CLAUSES, CONTRACT_TYPES } from "@/components/contracts/constants";
import { validateContractsIntake } from "@/lib/services/orderIntake.contracts";
import { createServiceOrder } from "@/lib/services/serviceOrders";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";

/**
 * Map a thrown submitOrder error to Arabic user-facing copy. Mirrors
 * useDraftState.ts's submitErrorMessageAr — the underlying message (which
 * may be English, e.g. "Unauthorized", or a raw Postgres error) is logged
 * for developers but never shown to the user.
 */
function submitErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[useContractsState] submitOrder failed:", raw);
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  return "تعذّر إرسال الطلب — حاول مجدداً";
}

export function useContractsState() {
  const [step, setStep] = useState<StepKey>("parties");
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // B0 — Mode selector
  const [contractMode, setContractMode] = useState<"draft" | "review" | null>(null);

  // B0.5 — Complexity selector (simple = 1-2 pages, detailed = 5+ pages)
  const [contractComplexity, setContractComplexity] = useState<"simple" | "detailed" | null>(null);

  // Step 1 — Parties
  const [party1Data, setParty1Data] = useState<PartyData>({ ...EMPTY_PARTY, type: "company" });
  const [party2Data, setParty2Data] = useState<PartyData>({ ...EMPTY_PARTY, type: "individual" });

  // Step 2 — Domain
  const [contractType, setContractType] = useState("");
  const [contractLanguage, setContractLanguage] = useState<"ar" | "en" | "ar_en" | "custom">("ar");
  const [customLanguageName, setCustomLanguageName] = useState("");
  const [customLanguageLayout, setCustomLanguageLayout] = useState<"single" | "dual">("dual");
  const [customLanguageBase, setCustomLanguageBase] = useState<"ar" | "en">("ar");

  // Step 3 — Context
  const [contractDesc, setContractDesc] = useState("");
  const [courtType, setCourtType] = useState("");

  // Step 4 — Clauses
  const [clauses, setClauses] = useState(INITIAL_CLAUSES);
  const [clauseEdits, setClauseEdits] = useState<Record<number, string>>({});
  const [newClause, setNewClause] = useState("");
  const [additionalClauses, setAdditionalClauses] = useState<string[]>([]);

  // Step 5 — Best practices
  const [bpSearching, setBpSearching] = useState(false);
  const [bpDone, setBpDone] = useState(false);
  const [appliedBP, setAppliedBP] = useState<Set<string>>(new Set());
  const [skipBP, setSkipBP] = useState(false);
  const [deepSearch, setDeepSearch] = useState(false);

  // I1 — Client sharing states
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sharePasscode, setSharePasscode] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  // Review Mode States
  const [rPartyFocus, setRPartyFocus] = useState("");
  const [rFears, setRFears] = useState("");
  const [rOtherParty, setROtherParty] = useState("");
  const [rClauseDecisions, setRClauseDecisions] = useState<Record<string, "accept" | "edit" | "reject"> | null>(null);

  // Review mode's file upload (Task C3) — real attachment state from
  // useOrderAttachments(), embedded here the same way useDraftState.ts embeds
  // it, so StepRUpload and submitReviewOrder() share one source of truth.
  const {
    attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError,
  } = useOrderAttachments();

  // Drafting Mode States
  const [paraEdits, setParaEdits] = useState<Record<string, string>>({});
  const [generalEdits, setGeneralEdits] = useState("");

  // Submit step — Task C2 (draft) / Task C3 (review). Both modes' "submit"
  // step share this submitting/submitErrors pair; only one mode is ever
  // active at a time, and submitOrder()/submitReviewOrder() each reset
  // setSubmitErrors([]) at the top of their own run.
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  function generateShareLink() {
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setShareLink(`https://nzamy.sa/share/${token}`);
    setSharePasscode(code);
  }

  async function startBPSearch() {
    setBpSearching(true);
    await new Promise(r => setTimeout(r, 2200));
    setBpSearching(false);
    setBpDone(true);
  }

  const currentSteps =
    contractMode === "review" ? STEPS_REVIEW
    : contractComplexity === "simple" ? STEPS_DRAFT_SIMPLE
    : STEPS_DRAFT;
  const currentStepIndex = currentSteps.findIndex(s => s.key === step);

  function canProceed() {
    if (contractMode === "review") {
      // Matches validateContractsIntake's review-mode requirements exactly
      // (Task B2): representing (rPartyFocus) must be non-empty — no length
      // minimum — and at least one attachment. Both are stopped here, not
      // three steps later at submit, mirroring the contractDesc gate below
      // (Task C2). contractType has no validator requirement for review
      // mode, so it is not gated — replaces the old `!!contractType` check,
      // which tested the wrong field entirely (Task C3).
      if (step === "r_identity") return rPartyFocus.trim().length > 0;
      // `!uploading` closes a race: r_upload no longer triggers the
      // processing-overlay delay (that was fake theatre for the removed
      // r_analysis screen — see nextStep() below), so without this a second
      // file mid-upload could be abandoned by clicking "التالي" the instant
      // the first attachment lands, unmounting StepRUpload and losing that
      // in-flight upload from the payload submitReviewOrder() later reads.
      if (step === "r_upload") return attachments.length > 0 && !uploading;
      return true;
    }
    // contractDesc is the brief the admin drafts from when no document is
    // uploaded (draft mode never collects one) — match
    // validateContractsIntake's MIN_CONTRACT_DESC (20 chars) so the client
    // is stopped here, not three steps later at submit (Task C2).
    if (step === "context") return contractDesc.trim().length >= 20;
    // domain step is optional — always can proceed
    return true;
  }

  // ── Submit (draft mode) — Task C2 ─────────────────────────────────────
  // Carries only what each draft path actually collected: STEPS_DRAFT_SIMPLE
  // skips "domain" and "clauses", so contractType/language/selectedClauses
  // stay legitimately absent on that path rather than shipping stale
  // never-shown defaults (see recon-contracts.md §9).
  function buildIntake(): Record<string, unknown> {
    const isDetailed = contractComplexity === "detailed";
    return {
      schemaVersion: 1,
      service: "contracts",
      mode: "draft",
      ...(contractComplexity ? { complexity: contractComplexity } : {}),
      parties: { one: party1Data, two: party2Data },
      contractDesc,
      ...(courtType ? { courtType } : {}),
      ...(isDetailed && contractType ? { contractType } : {}),
      ...(isDetailed ? { language: contractLanguage } : {}),
      ...(isDetailed && contractLanguage === "custom"
        ? { customLanguageName, customLanguageLayout, customLanguageBase }
        : {}),
      ...(isDetailed
        ? {
            // clauseEdits[c.id] can be "" (user cleared the edit box without
            // cancelling it) — fall back to the original title rather than
            // dropping a still-checked clause from the payload.
            selectedClauses: clauses
              .filter(c => c.checked)
              .map(c => clauseEdits[c.id]?.trim() || c.title),
          }
        : {}),
      additionalClauses,
      attachments: [],
    };
  }

  async function submitOrder(): Promise<void> {
    setSubmitErrors([]);
    const intake = buildIntake();
    const check = validateContractsIntake(intake);
    if (!check.ok) { setSubmitErrors(check.errors); return; }

    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", user.id).single()
        : { data: null };

      const contractLabel = CONTRACT_TYPES.find(c => c.id === contractType)?.title;
      const order = await createServiceOrder({
        service: "contracts",
        title: `محترف العقود — ${contractLabel || "صياغة عقد"}`,
        description: contractDesc.slice(0, 200),
        intake: check.value as unknown as Record<string, unknown>,
        attachments: [],
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

  // ── Submit (review mode) — Task C3 ────────────────────────────────────
  // Mirrors submitOrder() (draft) and useDraftState.ts's submitOrder(). The
  // uploaded contract (attachments) is the deliverable; rPartyFocus/rFears/
  // rOtherParty are the genuine free text StepRIdentity always collected but
  // that, before this task, reached nowhere (recon-contracts.md §3).
  function buildReviewIntake(): Record<string, unknown> {
    return {
      schemaVersion: 1,
      service: "contracts",
      mode: "review",
      ...(contractType ? { contractType } : {}),
      representing: rPartyFocus,
      ...(rFears.trim() ? { concerns: rFears } : {}),
      ...(rOtherParty.trim() ? { otherParty: rOtherParty } : {}),
      attachments,
    };
  }

  async function submitReviewOrder(): Promise<void> {
    setSubmitErrors([]);
    const intake = buildReviewIntake();
    const check = validateContractsIntake(intake);
    if (!check.ok) { setSubmitErrors(check.errors); return; }

    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", user.id).single()
        : { data: null };

      const contractLabel = CONTRACT_TYPES.find(c => c.id === contractType)?.title;
      const order = await createServiceOrder({
        service: "contracts",
        title: `محترف العقود — ${contractLabel ? `مراجعة ${contractLabel}` : "مراجعة عقد"}`,
        description: [rPartyFocus, rFears].filter(Boolean).join(" — ").slice(0, 200),
        intake: check.value as unknown as Record<string, unknown>,
        attachments,
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

  const nextStep = useCallback(async () => {
    const idx = currentStepIndex;
    if (idx >= currentSteps.length - 1) return;
    // "r_upload" was here because moving off it used to lead into the mock
    // r_analysis screen; it now leads straight to "submit" (Task C3), which
    // processes nothing, so it no longer gets the fake delay either.
    if (step === "parties" || step === "clauses") {
      setProcessing(true);
      await new Promise(r => setTimeout(r, 1400));
      setProcessing(false);
    }
    setStep(currentSteps[idx + 1].key);
  }, [currentStepIndex, step, currentSteps]);

  function prevStep() {
    if (currentStepIndex <= 0) return;
    setStep(currentSteps[currentStepIndex - 1].key);
  }

  return {
    step, setStep, processing, setProcessing, copied, setCopied,
    contractMode, setContractMode, currentSteps, currentStepIndex,
    contractComplexity, setContractComplexity,
    nextStep, prevStep, canProceed,
    party1Data, setParty1Data, party2Data, setParty2Data,
    contractType, setContractType, contractLanguage, setContractLanguage,
    customLanguageName, setCustomLanguageName, customLanguageLayout, setCustomLanguageLayout, customLanguageBase, setCustomLanguageBase,
    contractDesc, setContractDesc, courtType, setCourtType,
    clauses, setClauses, clauseEdits, setClauseEdits, newClause, setNewClause, additionalClauses, setAdditionalClauses,
    bpSearching, setBpSearching, bpDone, setBpDone, appliedBP, setAppliedBP, skipBP, setSkipBP, deepSearch, setDeepSearch, startBPSearch,
    shareLink, setShareLink, sharePasscode, setSharePasscode, linkCopied, setLinkCopied, clientEmail, setClientEmail, clientPhone, setClientPhone, generateShareLink,
    rPartyFocus, setRPartyFocus, rFears, setRFears, rOtherParty, setROtherParty, rClauseDecisions, setRClauseDecisions,
    paraEdits, setParaEdits, generalEdits, setGeneralEdits,
    submitting, submitErrors, submitOrder,
    attachments, uploading, attachError, attachFile, removeAttachment, clearAttachError, submitReviewOrder,
  };
}
