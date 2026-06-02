import { useState, useRef } from "react";
import {
  STEPS, StepKey, PartyData, EMPTY_PARTY, SupportDoc,
} from "@/components/draft/draftConstants";

export function useDraftState(initialMode = "") {
  // Seed initial values from ?mode= query param
  function seedFromMode(mode: string): { memoType: string; legalBranch: string } {
    switch (mode) {
      case "arbitration": return { memoType: "arbitration", legalBranch: "commercial" };
      case "notary":      return { memoType: "notary",      legalBranch: "civil" };
      case "report":      return { memoType: "report",      legalBranch: "" };
      case "minutes":     return { memoType: "minutes",     legalBranch: "" };
      case "reply":       return { memoType: "reply",       legalBranch: "" };
      default:            return { memoType: "",             legalBranch: "" };
    }
  }
  const seed = seedFromMode(initialMode);
  const [step, setStep]           = useState<StepKey>("identify");
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
  const currentStepIndex = STEPS.findIndex(s => s.key === step);

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

  async function nextStep() {
    const idx = currentStepIndex;
    if (idx >= STEPS.length - 1) return;
    
    // Simulate AI processing & extraction between steps
    if (step === "case" || step === "identify") {
      setProcessing(true);
      await new Promise(r => setTimeout(r, 2000));
      
      // Auto-extract judgment data mock if moving from step 2 to 3 for appeal/reply
      if (step === "case" && (memoType === "appeal" || memoType === "reply")) {
        if (!judgmentNumber) setJudgmentNumber("٣٤٢/ع/١٤٤٥");
        if (!judgmentCourt)   setJudgmentCourt("المحكمة العمالية بالرياض");
        if (!judgmentDate)    setJudgmentDate("12/04/2024");
        if (!plaintiffName)   setPlaintiffName("شركة الأفق الحديثة");
        if (!defendantName)   setDefendantName("أحمد عبد الله المرزوقي");
        if (!judgmentText)    setJudgmentText("حكمت المحكمة غيابياً بإلزام المدعى عليه بدفع مبلغ ٤٥,٠٠٠ ريال سعودي للمدعي، ورفض ما عدا ذلك من طلبات لعدم كفاية الأدلة.");
        if (!judgmentReasons) setJudgmentReasons("عولت المحكمة على إقرار المدعى عليه بصحة العقد في الجلسة الأولى، وثبوت التحويلات البنكية الناقصة عن المستحقات الثابتة في النظام.");
      }

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
      
      setProcessing(false);
    }
    setStep(STEPS[idx + 1].key);
  }

  function prevStep() {
    if (currentStepIndex <= 0) return;
    setStep(STEPS[currentStepIndex - 1].key);
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
