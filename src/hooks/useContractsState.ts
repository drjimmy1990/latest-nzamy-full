import { useState, useCallback } from "react";
import { STEPS_DRAFT, STEPS_DRAFT_SIMPLE, STEPS_REVIEW, StepKey, PartyData, EMPTY_PARTY } from "@/components/contracts/types";
import { INITIAL_CLAUSES } from "@/components/contracts/constants";

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
  const [useFirmMemory, setUseFirmMemory] = useState(false);

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

  // Drafting Mode States
  const [paraEdits, setParaEdits] = useState<Record<string, string>>({});
  const [generalEdits, setGeneralEdits] = useState("");

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
      if (step === "r_upload") return !!contractType;
    }
    // domain step is now optional — always can proceed
    return true;
  }

  const nextStep = useCallback(async () => {
    const idx = currentStepIndex;
    if (idx >= currentSteps.length - 1) return;
    if (step === "parties" || step === "clauses" || step === "r_upload" || step === "r_analysis") {
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
    contractDesc, setContractDesc, courtType, setCourtType, useFirmMemory, setUseFirmMemory,
    clauses, setClauses, clauseEdits, setClauseEdits, newClause, setNewClause, additionalClauses, setAdditionalClauses,
    bpSearching, setBpSearching, bpDone, setBpDone, appliedBP, setAppliedBP, skipBP, setSkipBP, deepSearch, setDeepSearch, startBPSearch,
    shareLink, setShareLink, sharePasscode, setSharePasscode, linkCopied, setLinkCopied, clientEmail, setClientEmail, clientPhone, setClientPhone, generateShareLink,
    rPartyFocus, setRPartyFocus, rFears, setRFears, rOtherParty, setROtherParty, rClauseDecisions, setRClauseDecisions,
    paraEdits, setParaEdits, generalEdits, setGeneralEdits
  };
}
