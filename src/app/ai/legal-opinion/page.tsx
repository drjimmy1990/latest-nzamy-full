"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Lightning, ArrowLeft, ArrowRight,
  Sparkle, ArrowSquareOut,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceInput } from "@/components/ui/VoiceInput";
import Link from "next/link";
import { ContextConsult } from "@/components/legal-opinion/ContextConsult";
import { ContextStudy } from "@/components/legal-opinion/ContextStudy";
import type { StudyGoalId } from "@/components/legal-opinion/ContextStudy";
import { ContextMemo, AUDIENCE_OPTIONS } from "@/components/legal-opinion/ContextMemo";
import type { MemoAudience, LawyerSide } from "@/components/legal-opinion/ContextMemo";
import { ContextResearch, RESEARCH_TYPE_OPTIONS } from "@/components/legal-opinion/ContextResearch";
import type { ResearchType } from "@/components/legal-opinion/ContextResearch";
import { ContextDueDiligence, ENTITY_TYPES, DD_GOALS, DD_SCOPE_ITEMS } from "@/components/legal-opinion/ContextDueDiligence";
import type { EntityType, DdGoal, DdSide } from "@/components/legal-opinion/ContextDueDiligence";
import { ContextCrossExam } from "@/components/legal-opinion/ContextCrossExam";
import { CrossExamResultView } from "./_components/CrossExamResultView";
import { SubmitStep, type RecapRow } from "./_components/SubmitStep";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";
import { createServiceOrder } from "@/lib/services/serviceOrders";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { validateLegalOpinionIntake } from "@/lib/services/orderIntake.legalOpinion";

// Internal
import type { OutputType, SearchDepth, StepKey } from "./_types";
import { OUTPUT_TYPES, AGENTS_QUICK, AGENTS_DEEP, AGENTS_COMPREHENSIVE } from "./_constants";
import { StepProgress, ProcessingView } from "./_components/SharedViews";
import { ResultView } from "./_components/ResultView";
import { LetterWorkflow } from "./_components/LetterWorkflow";
import { SettingsStep } from "./_components/SettingsStep";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── UI id → stored metadata.intake.outputType map (Task C4, notes §3) ─────────
// The wizard's own identifiers are hyphenated; the persisted intake contract
// (Task B2's validator) uses the plan's underscore set. Decided once here —
// do not re-litigate elsewhere.
const OUTPUT_TYPE_TO_STORED: Record<OutputType, string> = {
  consult: "consult",
  study: "study",
  "legal-memo": "memo",
  research: "research",
  "due-diligence": "due_diligence",
  "cross-exam": "cross_exam",
  letter: "letter",
};

// ─── Label lookups for the submit-step recap and order title ──────────────────
// Small, local, and duplicative of lists already defined (LEGAL_AREAS_27
// lives independently inside both ContextConsult.tsx and ContextStudy.tsx —
// this follows that same existing pattern rather than introducing a new
// cross-file dependency for a handful of display strings).
const LEGAL_AREA_LABELS: Record<string, string> = {
  commercial: "تجاري", labor: "عمالي", civil: "مدني", admin: "إداري",
  family: "أحوال شخصية", real_estate: "عقاري", criminal: "جنائي",
  companies: "شركات", contracts: "عقود", ip: "ملكية فكرية",
  tax: "ضريبي وزكوي", insurance: "تأمين", banking: "بنكي ومالي",
  ma: "اندماج واستحواذ", bankruptcy: "إفلاس وإعادة هيكلة",
  execution: "تنفيذ وإشكالات", arbitration: "تحكيم دولي", maritime: "بحري وجوي",
  competition: "منافسة وحماية مستهلك", capital: "سوق مالية وأوراق مالية",
  gov_contract: "عقود حكومية", environment: "بيئة وموارد طبيعية",
  digital: "جرائم معلوماتية", medical: "طبي وصحي", tourism: "سياحة وضيافة",
  inheritance: "ميراث وتركات", other: "أخرى",
};
const DEPTH_LABELS: Record<SearchDepth, string> = { quick: "سريع", deep: "عميق", comprehensive: "شامل" };
const STAGE_LABELS: Record<string, string> = { first: "ابتدائية", appeal: "استئناف", cassation: "نقض / تمييز" };
const DETAIL_LABELS: Record<string, string> = { brief: "موجز", detailed: "مفصّل", comprehensive: "شامل" };
const RESEARCH_SOURCE_LABELS: Record<string, string> = {
  nzamy: "قاعدة نظامي", laws: "الأنظمة واللوائح", judgments: "الأحكام القضائية", decrees: "المراسيم الملكية",
};
const RESEARCH_LIMIT_LABELS: Record<string, string> = { "5": "٥", "10": "١٠", unlimited: "غير محدود" };
const MEMO_SIDE_LABELS: Record<LawyerSide, string> = { plaintiff: "مدّعٍ", defendant: "مدّعى عليه", neutral: "حيادي / مستشار" };
const DD_SIDE_LABELS: Record<DdSide, string> = { buyer: "مشترٍ", seller: "بائع", investor: "مستثمر" };

const DEFAULT_DD_SCOPE: Record<string, boolean> = Object.fromEntries(DD_SCOPE_ITEMS.map(i => [i.id, i.default]));

/**
 * Map a thrown submitOrder error to Arabic user-facing copy. The underlying
 * message (which may be English — "Unauthorized", a raw Postgres error,
 * etc.) is logged for developers via console.error but never shown to the
 * user. Mirrors useDraftState.ts's submitErrorMessageAr.
 */
function submitErrorMessageAr(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[AILegalOpinionPage] submitOrder failed:", raw);
  if (raw === "Unauthorized") {
    return "انتهت جلستك — يرجى تسجيل الدخول مجدداً ثم إعادة المحاولة.";
  }
  return "تعذّر إرسال الطلب — حاول مجدداً";
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AILegalOpinionPage() {
  const { isDark } = useTheme();

  // State
  const [selectedType, setSelectedType] = useState<OutputType | "">("");
  const [currentStep, setCurrentStep] = useState<StepKey>("type");
  const [topicArea, setTopicArea] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [searchDepth, setSearchDepth] = useState<SearchDepth>("deep");
  // Settings state — Study
  const [studyGoal, setStudyGoal] = useState<StudyGoalId | "">("");
  const [litigationStage, setLitigationStage] = useState<"first" | "appeal" | "cassation">("first");
  // Settings state — Memo
  const [memoStructure, setMemoStructure] = useState({ facts: true, legal: true, recommendation: true, attachments: false });
  const [memoDetailLevel, setMemoDetailLevel] = useState<"brief" | "detailed" | "comprehensive">("detailed");
  // Context state — Memo (Task C4: previously local useState inside
  // ContextMemo with no Props for either — both died the moment the user
  // chose them. Lifted here like every other shared field.)
  const [memoAudience, setMemoAudience] = useState<MemoAudience>("judge");
  const [memoSide, setMemoSide] = useState<LawyerSide>("plaintiff");
  // Settings state — Research
  const [researchSources, setResearchSources] = useState({ nzamy: true, laws: true, judgments: false, decrees: false });
  const [researchLimit, setResearchLimit] = useState<"5" | "10" | "unlimited">("10");
  // Context state — Research (Task C4: previously local useState inside
  // ContextResearch, Props had none of them — all four died local.
  // kwInput stays local inside ContextResearch — transient input buffer,
  // not a value the order needs.)
  const [researchType, setResearchType] = useState<ResearchType>("topic");
  const [compareWith, setCompareWith] = useState("النظام الإماراتي");
  const [keywords, setKeywords] = useState<string[]>([]);
  // Context state — Due Diligence (Task C4: previously local useState
  // inside ContextDueDiligence; Props exposed only description — every
  // other field died local, "files" worst of all since it captured
  // filenames only and discarded the File itself.)
  const [ddEntityType, setDdEntityType] = useState<EntityType>("company");
  const [ddEntityName, setDdEntityName] = useState("");
  const [ddExtraField, setDdExtraField] = useState("");
  const [ddGoal, setDdGoal] = useState<DdGoal>("acquisition");
  const [ddSide, setDdSide] = useState<DdSide>("buyer");
  const [ddScope, setDdScope] = useState<Record<string, boolean>>(DEFAULT_DD_SCOPE);
  // Context state — Cross-Exam (Task C4: witnessRole/destroyGoal already
  // reached page.tsx baked into `description` as free text via
  // confirmReady(); crossExamReady additionally gates the shared "next"
  // button so a client can't skip cross-exam's own dynamic Q&A phases —
  // see ContextCrossExam's onReadyInfo prop).
  const [crossExamReady, setCrossExamReady] = useState(false);
  const [crossExamWitnessRole, setCrossExamWitnessRole] = useState("");
  const [crossExamDestroyGoal, setCrossExamDestroyGoal] = useState("");

  // Real file uploads (Task C4) — one shared instance across every
  // non-letter sub-flow, mirroring src/app/ai/wargaming/page.tsx. Only one
  // sub-flow is ever active at a time (selectedType is single-select), and
  // switching sub-flows clears whatever was attached — see clearFlowState().
  const {
    attachments, uploading, attachError, attachFiles, removeAttachment, clearAttachError,
  } = useOrderAttachments();

  // Mirrors ServiceRequestWizard.tsx's dismissBlocked (Task B1, item 13): an
  // attachment only lands in `attachments` after uploadAndRecord's await
  // resolves (useOrderAttachments.ts), so jumping away from the context step
  // mid-upload — via the progress bar's onStepClick, back to "type", then a
  // different service card — runs clearFlowState() and drops the file that
  // was still in flight. Blocks that escape route the same way canProceed()
  // below blocks "التالي".
  const dismissBlocked = uploading;

  // Submit-step state
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  const opConfig = OUTPUT_TYPES.find(o => o.id === selectedType);
  // For letter type, show dedicated letter UI
  const isLetterMode = selectedType === "letter" && currentStep !== "type";

  const steps = opConfig?.steps ?? ["type", "context", "processing", "result"];
  const ci = steps.indexOf(currentStep);

  const agents =
    opConfig?.depth === "quick" ? AGENTS_QUICK :
    opConfig?.depth === "comprehensive" ? AGENTS_COMPREHENSIVE :
    AGENTS_DEEP;

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";

  // ─── Type-specific validators ────────────────────────────────────────────────
  // Tightened (Task C4, notes: "the wizard's own gates are looser than the
  // validator... close the gap"). validateLegalOpinionIntake requires
  // description >= 20 chars for every non-letter outputType; these used to
  // gate at > 10 (or, for due-diligence, not at all), which let a client
  // click through every step and only discover the real minimum at submit.
  function canProceed() {
    // Task B1, item 13: an in-flight upload has not yet reached `attachments`
    // (useOrderAttachments.ts resolves it only after the upload settles), so
    // letting "التالي" advance mid-upload silently ships an order missing the
    // file. Mirrors ServiceRequestWizard.tsx's canProceed().
    if (uploading) return false;
    if (currentStep === "type") return !!selectedType;
    if (currentStep === "context") {
      if (selectedType === "consult") return !!topicArea && description.trim().length >= 20;
      if (selectedType === "study") return description.trim().length >= 20;
      if (selectedType === "legal-memo") return description.trim().length >= 20;
      if (selectedType === "research") return description.trim().length >= 20;
      if (selectedType === "due-diligence") return description.trim().length >= 20;
      // Already stricter than the validator (>50 vs >=20) — left as-is, per
      // the controller notes. crossExamReady additionally guards against
      // skipping ContextCrossExam's own witness-role/destroy-goal/dynamic-Q&A
      // phases: without it, pasting >50 chars of testimony and clicking this
      // shared "next" button (visible throughout every internal phase) would
      // let a client reach submit before confirmReady() ever composed the
      // structured block the brief calls "the best-wired" part of this task.
      if (selectedType === "cross-exam") return crossExamReady && description.trim().length > 50;
      return true;
    }
    return true;
  }

  const next = useCallback(() => {
    if (ci >= steps.length - 1) return;
    setCurrentStep(steps[ci + 1]);
  }, [ci, steps]);

  const prev = () => {
    if (ci <= 0) return;
    setCurrentStep(steps[ci - 1]);
  };

  // Resets every field specific to the currently-selected sub-flow —
  // description/topicArea/question/settings/attachments — used both by the
  // full-page reset() and by the type-picker (Task C4): without the latter,
  // a client who fills in e.g. study's attachments and fields, then goes
  // back and picks consult instead, would have all of that ride along
  // invisibly into an order that never asked for it.
  function clearFlowState() {
    setDescription("");
    setTopicArea("");
    setQuestion("");
    setStudyGoal("");
    setLitigationStage("first");
    setMemoStructure({ facts: true, legal: true, recommendation: true, attachments: false });
    setMemoDetailLevel("detailed");
    setMemoAudience("judge");
    setMemoSide("plaintiff");
    setResearchSources({ nzamy: true, laws: true, judgments: false, decrees: false });
    setResearchLimit("10");
    setResearchType("topic");
    setCompareWith("النظام الإماراتي");
    setKeywords([]);
    setDdEntityType("company");
    setDdEntityName("");
    setDdExtraField("");
    setDdGoal("acquisition");
    setDdSide("buyer");
    setDdScope(DEFAULT_DD_SCOPE);
    setCrossExamReady(false);
    setCrossExamWitnessRole("");
    setCrossExamDestroyGoal("");
    setSubmitErrors([]);
    clearAttachError();
    attachments.forEach(a => removeAttachment(a.documentId));
  }

  const reset = () => {
    setSelectedType("");
    setCurrentStep("type");
    clearFlowState();
  };

  // ─── Order title / recap / intake (Task C4) ────────────────────────────────
  // The admin queue's list row renders only the order's title, requester and
  // date — metadata.intake.outputType is visible only after opening
  // "التفاصيل" — so the title itself must name the sub-flow, not just the
  // service.
  function buildOrderTitle(): string {
    const opTitle = opConfig?.title ?? "الرأي الفصل";
    let subject = "";
    if (selectedType === "consult") subject = LEGAL_AREA_LABELS[topicArea] ?? "";
    else if (selectedType === "study") subject = LEGAL_AREA_LABELS[topicArea] || opConfig?.title || "";
    else if (selectedType === "legal-memo") subject = AUDIENCE_OPTIONS.find(a => a.id === memoAudience)?.label ?? "";
    else if (selectedType === "research") subject = RESEARCH_TYPE_OPTIONS.find(r => r.id === researchType)?.label ?? "";
    else if (selectedType === "due-diligence") subject = ddEntityName || ENTITY_TYPES.find(e => e.id === ddEntityType)?.label || "";
    else if (selectedType === "cross-exam") subject = crossExamWitnessRole || "";
    return subject ? `${opTitle} — ${subject}` : opTitle;
  }

  function buildSettings(): Record<string, unknown> | undefined {
    if (selectedType === "study") {
      return {
        searchDepth, studyGoal,
        ...(studyGoal === "dispute" ? { litigationStage } : {}),
      };
    }
    if (selectedType === "legal-memo") {
      return { searchDepth, memoStructure, memoDetailLevel, audience: memoAudience, side: memoSide };
    }
    if (selectedType === "research") {
      // searchDepth deliberately omitted — SettingsStep's depth card only
      // renders for study/legal-memo, so a research client never sees or
      // chooses it; shipping the untouched default would misrepresent it
      // as a real choice.
      return {
        researchType,
        ...(researchType === "compare" ? { compareWith } : {}),
        keywords, researchSources, researchLimit,
      };
    }
    if (selectedType === "due-diligence") {
      // searchDepth omitted for the same reason — due-diligence never had a
      // settings step at all.
      return {
        entityType: ddEntityType, entityName: ddEntityName, extraField: ddExtraField,
        goal: ddGoal, side: ddSide, scope: ddScope,
      };
    }
    if (selectedType === "cross-exam" && (crossExamWitnessRole || crossExamDestroyGoal)) {
      // Genuinely selected by the user in ContextCrossExam — already baked
      // into `description` as free text; also surfaced here structurally so
      // an admin doesn't have to parse them back out of the composed block.
      return { witnessRole: crossExamWitnessRole, destroyGoal: crossExamDestroyGoal };
    }
    return undefined;
  }

  function buildIntake(): Record<string, unknown> {
    const settings = buildSettings();
    return {
      schemaVersion: 1,
      service: "legal_opinion",
      outputType: OUTPUT_TYPE_TO_STORED[selectedType as OutputType],
      ...(topicArea ? { topicArea } : {}),
      description,
      ...(selectedType === "legal-memo" && question.trim() ? { question: question.trim() } : {}),
      ...(settings ? { settings } : {}),
      attachments,
    };
  }

  function buildRecapRows(): RecapRow[] {
    if (selectedType === "consult") {
      return [{ label: "المجال القانوني", value: LEGAL_AREA_LABELS[topicArea] ?? "غير محدد" }];
    }
    if (selectedType === "study") {
      const goalLabel = studyGoal ? (studyGoal === "dispute" ? "دعوى / نزاع قائم"
        : studyGoal === "planning" ? "استشارة وقائية"
        : studyGoal === "drafting" ? "تحرير مستند / عقد"
        : studyGoal === "academic" ? "بحث أكاديمي / مقارن"
        : "امتثال تنظيمي") : "";
      return [
        { label: "غرض الدراسة", value: goalLabel },
        { label: "المجال القانوني", value: LEGAL_AREA_LABELS[topicArea] ?? "غير محدد" },
        { label: "عمق البحث", value: DEPTH_LABELS[searchDepth] },
        ...(studyGoal === "dispute" ? [{ label: "مرحلة التقاضي", value: STAGE_LABELS[litigationStage] }] : []),
      ];
    }
    if (selectedType === "legal-memo") {
      return [
        { label: "موجَّه إلى", value: AUDIENCE_OPTIONS.find(a => a.id === memoAudience)?.label ?? "" },
        { label: "موقف المحامي", value: MEMO_SIDE_LABELS[memoSide] },
        { label: "عمق البحث", value: DEPTH_LABELS[searchDepth] },
        { label: "درجة التفصيل", value: DETAIL_LABELS[memoDetailLevel] },
        ...(question.trim() ? [{ label: "سؤال محدد", value: question.trim() }] : []),
      ];
    }
    if (selectedType === "research") {
      const sourceLabels = Object.entries(researchSources).filter(([, v]) => v).map(([k]) => RESEARCH_SOURCE_LABELS[k]).join("، ");
      return [
        { label: "نوع البحث", value: RESEARCH_TYPE_OPTIONS.find(r => r.id === researchType)?.label ?? "" },
        ...(researchType === "compare" ? [{ label: "مقارنة مع", value: compareWith }] : []),
        ...(keywords.length ? [{ label: "كلمات مفتاحية", value: keywords.join("، ") }] : []),
        { label: "مصادر البحث", value: sourceLabels || "—" },
        { label: "حد النتائج", value: RESEARCH_LIMIT_LABELS[researchLimit] },
      ];
    }
    if (selectedType === "due-diligence") {
      const scopeLabels = DD_SCOPE_ITEMS.filter(i => ddScope[i.id]).map(i => i.label).join("، ");
      const entity = ENTITY_TYPES.find(e => e.id === ddEntityType);
      return [
        { label: "نوع الكيان", value: entity?.label ?? "" },
        ...(ddEntityName ? [{ label: "اسم الكيان", value: ddEntityName }] : []),
        ...(ddExtraField ? [{ label: entity?.extraField ?? "معلومة إضافية", value: ddExtraField }] : []),
        { label: "هدف الفحص", value: DD_GOALS.find(g => g.id === ddGoal)?.label ?? "" },
        { label: "جانبك", value: DD_SIDE_LABELS[ddSide] },
        { label: "محاور الفحص", value: scopeLabels || "—" },
      ];
    }
    if (selectedType === "cross-exam") {
      return [
        { label: "صفة الشاهد", value: crossExamWitnessRole || "—" },
        { label: "هدف الاستجواب", value: crossExamDestroyGoal || "—" },
      ];
    }
    return [];
  }

  // Model: useDraftState.submitOrder() / wargaming page.tsx's submitOrder() —
  // build intake → validateLegalOpinionIntake → Arabic errors on failure →
  // read profiles(display_name, phone, email) → createServiceOrder → redirect.
  // That profile read is load-bearing: the n8n WhatsApp notification
  // addresses requester.phone.
  async function submitOrder() {
    // Completes the same guard as canProceed()/dismissBlocked above (Task B1,
    // item 13) at the one remaining entry point: SubmitStep does not receive
    // `uploading` today, so its own button has no visual disabled state to
    // match ServiceRequestWizard.tsx's `disabled={submitting || uploading}` —
    // this stops the order from being created out from under an attachment
    // still in flight regardless of how submitOrder() gets called.
    if (uploading) return;
    setSubmitErrors([]);
    const intake = buildIntake();
    const check = validateLegalOpinionIntake(intake);
    if (!check.ok) { setSubmitErrors(check.errors); return; }

    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from("profiles").select("display_name, phone, email").eq("id", user.id).single()
        : { data: null };

      const order = await createServiceOrder({
        service: "legal_opinion",
        title: buildOrderTitle(),
        description: description.slice(0, 200),
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

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#C8A762]/10 flex items-center justify-center">
            <Brain size={18} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h1 className={`text-lg font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>
              الرأي الفصل
            </h1>
            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Al-Ra&apos;y Al-Fasl · رأي · بحث · دراسة · عناية واجبة</p>
          </div>
        </div>
        {/* "MULTI-AGENT" / "٥ نماذج AI" badges and the "متعدد المصادر
            ومتعدد الوكلاء" (multi-source, multi-agent) phrase removed
            (Task C4 fix pass) — they asserted an automated multi-agent
            pipeline that no longer runs; fulfilment is manual. What
            remains below still describes what the client receives. */}
        <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          استشارات · دراسات · مذكرات رأي · بحث قانوني متخصص · عناية واجبة
        </p>
      </div>

      {/* Progress */}
      {currentStep !== "type" && !isLetterMode && (
        <div className={`${card} p-4`}>
          <StepProgress steps={steps} currentStep={currentStep} isDark={isDark} onStepClick={dismissBlocked ? undefined : setCurrentStep} />
        </div>
      )}

      {/* ── LETTER MODE ── */}
      {isLetterMode && (
        <LetterWorkflow
          isDark={isDark}
          card={card}
          onBack={() => { setSelectedType(""); setCurrentStep("type"); }}
        />
      )}

      {/* ── STEP: TYPE ── */}
      <AnimatePresence mode="wait">
        {currentStep === "type" && (
          <motion.div key="step-type" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>

            {/* Quick Chat Input */}
            <div className={`mb-6 p-4 rounded-2xl border flex flex-col gap-3 transition-colors ${
              isDark ? "border-white/[0.08] bg-zinc-900/50 focus-within:border-[#C8A762]/50 focus-within:bg-zinc-900"
                     : "border-slate-200 bg-white shadow-sm focus-within:border-[#C8A762]/50"
            }`}>
              <div className="flex items-center gap-2">
                <Lightning size={16} weight="fill" className="text-[#C8A762]" />
                <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>استشارة سريعة المباشرة</span>
              </div>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="اسأل المستشار ماكس باختصار هنا..."
                className={`w-full bg-transparent resize-none outline-none text-[13px] h-12 py-1 ${
                  isDark ? "text-white placeholder:text-zinc-600" : "text-slate-800 placeholder:text-slate-400"
                }`}
              />
              <div className="flex justify-between items-center">
                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {question.length} حرف {question.length > 0 && question.length < 20 && "— أضف مزيداً من التفاصيل (٢٠ حرفاً على الأقل)"}
                </p>
                <div className="flex items-center gap-2">
                  <VoiceInput onTranscript={(t) => setQuestion(prev => prev ? prev + " " + t : t)} className="w-8 h-8 rounded-full" />
                  <button
                    disabled={question.trim().length < 20}
                    onClick={() => {
                      // Task C4: no longer hardcodes topicArea="أخرى" — the
                      // client never picked a topic here, so the order must
                      // not silently claim they did. Lands directly on the
                      // real submit step (the fake processing/result theatre
                      // is gone); the ≥20-char gate above replaces the old
                      // inline 2200ms fake-processing timer.
                      //
                      // setTopicArea("") is required, not redundant: the
                      // type-picker's own reset (clearFlowState()) only runs
                      // when selectedType actually changes. If the client
                      // had already picked "consult" via the type picker,
                      // tapped a topic-area pill, backed out to the type
                      // step without submitting, and then sent a question
                      // through this box instead, selectedType would still
                      // read "consult" — leaving that abandoned pill's value
                      // in topicArea for buildIntake() to ship as if the
                      // client had chosen it here (review finding, C4 fix).
                      setSelectedType("consult");
                      setTopicArea("");
                      setDescription(question);
                      setCurrentStep("submit");
                    }}
                    className={`px-4 py-2 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] disabled:opacity-50 transition-colors flex items-center gap-2`}>
                    إرسال
                    <ArrowSquareOut size={12} weight="bold" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
              <p className={`text-[10px] font-black uppercase tracking-wider flex-shrink-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                أو اختر مساراً متخصصاً
              </p>
              <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {OUTPUT_TYPES.map((ot, i) => {
                const isSelected = selectedType === ot.id;
                return (
                  <motion.button key={ot.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      // Task C4: switching sub-flows clears every field
                      // specific to the previous one (and any attachments)
                      // so nothing collected under the old type rides along
                      // invisibly into an order for the new one.
                      if (selectedType !== ot.id) clearFlowState();
                      setSelectedType(ot.id);
                    }}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`rounded-2xl border p-4 text-start transition-all ${
                      isSelected
                        ? isDark ? `${ot.border} ${ot.bg}` : `${ot.border} ${ot.bg}`
                        : isDark ? "border-white/[0.06] bg-zinc-900 hover:border-white/[0.12]"
                                 : "border-slate-200 bg-white hover:border-slate-300 shadow-sm"
                    }`}>
                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${ot.bg}`}>
                      <ot.icon size={20} weight="duotone" className={ot.color} />
                    </div>
                    <h3 className={`font-bold text-[13px] mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{ot.title}</h3>
                    <p className={`text-[11px] leading-relaxed mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{ot.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] rounded-full px-2 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{ot.audience}</span>
                      <span className={`text-[9px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{ot.credits} ك</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── STEP: CONTEXT (type-specific) ── */}
        {currentStep === "context" && (
          <motion.div key="step-context" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <AnimatePresence mode="wait">
              {selectedType === "consult" && (
                <ContextConsult
                  key="ctx-consult"
                  topicArea={topicArea} setTopicArea={setTopicArea}
                  description={description} setDescription={setDescription}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "study" && (
                <ContextStudy
                  key="ctx-study"
                  topicArea={topicArea} setTopicArea={setTopicArea}
                  description={description} setDescription={setDescription}
                  studyGoal={studyGoal} setStudyGoal={setStudyGoal}
                  isDark={isDark} card={card}
                  attachments={attachments} uploading={uploading} attachError={attachError}
                  attachFiles={attachFiles} removeAttachment={removeAttachment}
                />
              )}
              {selectedType === "legal-memo" && (
                <ContextMemo
                  key="ctx-memo"
                  topicArea={topicArea} setTopicArea={setTopicArea}
                  description={description} setDescription={setDescription}
                  question={question} setQuestion={setQuestion}
                  audience={memoAudience} setAudience={setMemoAudience}
                  side={memoSide} setSide={setMemoSide}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "research" && (
                <ContextResearch
                  key="ctx-research"
                  description={description} setDescription={setDescription}
                  researchType={researchType} setResearchType={setResearchType}
                  compareWith={compareWith} setCompareWith={setCompareWith}
                  keywords={keywords} setKeywords={setKeywords}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "due-diligence" && (
                <ContextDueDiligence
                  key="ctx-dd"
                  description={description} setDescription={setDescription}
                  entityType={ddEntityType} setEntityType={setDdEntityType}
                  entityName={ddEntityName} setEntityName={setDdEntityName}
                  extraFieldVal={ddExtraField} setExtraFieldVal={setDdExtraField}
                  goal={ddGoal} setGoal={setDdGoal}
                  side={ddSide} setSide={setDdSide}
                  scope={ddScope} setScope={setDdScope}
                  isDark={isDark} card={card}
                  attachments={attachments} uploading={uploading} attachError={attachError}
                  attachFiles={attachFiles} removeAttachment={removeAttachment}
                />
              )}
              {selectedType === "cross-exam" && (
                <ContextCrossExam
                  key="ctx-cross-exam"
                  description={description} setDescription={setDescription}
                  isDark={isDark} card={card}
                  attachments={attachments} uploading={uploading} attachError={attachError}
                  attachFiles={attachFiles} removeAttachment={removeAttachment}
                  onReadyInfo={({ witnessRole, destroyGoal }) => {
                    setCrossExamReady(true);
                    setCrossExamWitnessRole(witnessRole);
                    setCrossExamDestroyGoal(destroyGoal);
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── STEP: SETTINGS (type-specific) ── */}
        {currentStep === "settings" && (
          <motion.div key="step-settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <SettingsStep
              isDark={isDark} card={card}
              selectedType={selectedType}
              agents={agents}
              searchDepth={searchDepth} setSearchDepth={setSearchDepth}
              studyGoal={studyGoal}
              litigationStage={litigationStage} setLitigationStage={setLitigationStage}
              memoStructure={memoStructure} setMemoStructure={setMemoStructure}
              memoDetailLevel={memoDetailLevel} setMemoDetailLevel={setMemoDetailLevel}
              researchSources={researchSources} setResearchSources={setResearchSources}
              researchLimit={researchLimit} setResearchLimit={setResearchLimit}
            />
          </motion.div>
        )}

        {/* ── STEP: PROCESSING ── */}
        {/* HIDDEN, not deleted (Task C4) — "processing" no longer appears in
            any OUTPUT_TYPES[].steps array, so no live code path ever sets
            currentStep to it any more. Kept for when real AI processing
            lands. */}
        {currentStep === "processing" && (
          <motion.div key="step-processing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className={`${card} p-5`}>
              <ProcessingView agents={agents} isDark={isDark} />
            </div>
          </motion.div>
        )}

        {/* ── STEP: RESULT ── */}
        {/* HIDDEN, not deleted (Task C4) — same reasoning as "processing"
            above. ResultView/CrossExamResultView/StudyDocumentEditor are
            100% canned (MOCK_RESULT, hardcoded question batteries) — see
            task-C4-report.md. */}
        {currentStep === "result" && (
          <motion.div key="step-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {selectedType === "cross-exam" ? (
              <BetaReviewGate toolId="legal-opinion.cross-exam" toolName="مُولّد الاستجواب" reviewScope="legal-data">
                <CrossExamResultView isDark={isDark} card={card} onReset={reset} />
              </BetaReviewGate>
            ) : (
              <ResultView
                outputType={selectedType as OutputType}
                isDark={isDark}
                onReset={reset}
                onEdit={() => setCurrentStep("context")}
              />
            )}
          </motion.div>
        )}

        {/* ── STEP: SUBMIT ── */}
        {/* The real replacement for processing/result — the request becomes
            an order a human admin fulfils by hand (Task C4). Every row in
            SubmitStep's recap is a read-only view of a value already
            collected earlier and included verbatim in buildIntake() above —
            not a control whose value fails to reach the order. */}
        {currentStep === "submit" && (
          <motion.div key="step-submit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <SubmitStep
              isDark={isDark} card={card}
              title={opConfig?.title ?? "الطلب"}
              recapRows={buildRecapRows()}
              description={description}
              descriptionLabel={selectedType === "cross-exam" ? "نص الاستجواب المُركّب" : "الوصف"}
              attachments={attachments}
              submitting={submitting}
              submitErrors={submitErrors}
              onBack={() => {
                setSubmitErrors([]);
                const backTo = steps[steps.indexOf("submit") - 1];
                setCurrentStep(backTo ?? "context");
              }}
              onSubmit={submitOrder}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation — hidden in letter mode (letter has its own nav) and on
          the submit step (SubmitStep has its own back/submit buttons) */}
      {currentStep !== "processing" && currentStep !== "result" && currentStep !== "submit" && !isLetterMode && (
        <div className="space-y-2 pt-1">
          {/* Same wording and same trigger as ServiceRequestWizard.tsx's
              upload-in-progress notice (Task B1, item 13). */}
          {uploading && (
            <p className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              انتظر انتهاء رفع الملفات قبل المتابعة حتى لا يُرسَل الطلب ناقص المرفقات.
            </p>
          )}
          <div className="flex items-center justify-between">
            <button onClick={prev} disabled={ci === 0 || dismissBlocked}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold border transition-colors disabled:opacity-30 ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"}`}>
              <ArrowRight size={13} /> السابق
            </button>
          {ci < steps.length - 1 && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={next} disabled={!canProceed()}
              className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[12px] font-bold text-white disabled:opacity-40">
              {steps[ci + 1] === "submit" ? (
                <><Sparkle size={13} weight="fill" />مراجعة الطلب وإرساله</>
              ) : (
                <>التالي <ArrowLeft size={13} /></>
              )}
            </motion.button>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
