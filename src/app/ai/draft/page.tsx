"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useDraftState } from "@/hooks/useDraftState";
import { CLIENT_VISIBLE_STEPS } from "@/components/draft/draftConstants";
import { DraftPreStep } from "@/components/draft/DraftPreStep";
import { StepIdentify }  from "@/components/draft/steps/StepIdentify";
import { StepCase }      from "@/components/draft/steps/StepCase";
import { StepSubmit }    from "@/components/draft/steps/StepSubmit";
import { StepAiDraft }   from "@/components/draft/steps/StepAiDraft";
import { useUser } from "@/hooks/useUser";
import { draftKindFromMemo } from "@/lib/ai/draftKinds";
import { CONSULTANT_BLOCKED_MESSAGE } from "@/lib/auth/practiceKind";
import { splitAiReadable } from "@/components/ai/aiReadable";
import { TranscriptHandoffNotice } from "@/components/draft/TranscriptHandoffNotice";
import {
  TRANSCRIPT_FROM_PARAM, consumeTranscriptHandoff, discardTranscriptHandoff, sessionStorageOrNull,
} from "@/lib/ai/transcriptHandoff";

// Labels shown as badge in wizard header when ?mode= param is present
const MODE_BADGE_LABELS: Record<string, string> = {
  arbitration: "صائغ حكم التحكيم",
  notary:      "صائغ عقد التوثيق",
  report:      "صياغة تقرير",
  minutes:     "صياغة محضر",
  reply:       "رد احترافي",
};

export default function AIDraftPage() {
  const { isDark } = useTheme();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode") ?? "";

  const s = useDraftState(modeParam);
  const user = useUser();

  // L14 (owner LIVE-F02, NOTE-22): a pleading is written by the AI by
  // default; the team's review is a separate, optional order. The specialist
  // modes (arbitration, notary, report, minutes) have no kind and stay a team
  // order, as does any account the tool is not open to (lawyers and firms).
  const kind = draftKindFromMemo(s.memoType, s.memoSubType);
  const aiOpen = kind !== null && ["lawyer", "firm", "admin"].includes(user.userType as string);
  // Art. 18: a legal consultant does not plead — neither by the AI nor by
  // the team (the service-requests POST refuses it too).
  const consultantBlocked = kind !== null && user.practiceKind === "consultant";
  const files = useMemo(() => splitAiReadable(s.uploadedAttachments), [s.uploadedAttachments]);
  const [aiDraftText, setAiDraftText] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  // The run answered `tool_off` (the tool ships off until an admin turns it
  // on): the team order becomes the path.
  const [aiOff, setAiOff] = useState(false);
  const markAiOff = useCallback(() => setAiOff(true), []);
  const aiPath = aiOpen && !aiOff && !consultantBlocked && kind !== null;
  // "pre" = show chooser, "draft" = show the wizard
  // If a mode param is provided skip the chooser and go straight to draft
  const [preMode, setPreMode] = useState<"pre" | "draft">(modeParam ? "draft" : "pre");

  // ?from=transcript (N1.8): a transcript handed over by SendToDrafterButton.
  // Consumed once in an effect (storage is browser-only; reading it during
  // render would break hydration) and cleared by the read. It only PREFILLS
  // the facts field and opens the wizard — never submits. The wizard still
  // starts at step 1, whose choices the order needs. With nothing to consume
  // (reload, expiry, private mode) the page behaves as usual.
  const fromTranscript = searchParams.get("from") === TRANSCRIPT_FROM_PARAM;
  const [transcriptNotice, setTranscriptNotice] = useState<{ sourceLabel: string; truncated: boolean } | null>(null);
  const { setCaseText } = s;
  useEffect(() => {
    if (!fromTranscript) {
      // Opened some other way (a login redirect keeps only the path): drop
      // any leftover transcript instead of leaving it in the tab.
      discardTranscriptHandoff(sessionStorageOrNull());
      return;
    }
    const handoff = consumeTranscriptHandoff(sessionStorageOrNull());
    // StrictMode runs this twice; the second run finds nothing and must not
    // undo the first, so state is only ever set on a hit.
    if (!handoff) return;
    setCaseText(handoff.text);
    // A one-time read of browser storage after mount — it cannot run during
    // render (no storage on the server), so the state is set here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreMode("draft");
    setTranscriptNotice({ sourceLabel: handoff.sourceLabel, truncated: handoff.truncated });
  }, [fromTranscript, setCaseText]);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  // ── Pre-step: route chooser ────────────────────────────────────────────────
  if (preMode === "pre") {
    return (
      <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
        <DraftPreStep onStartDraft={() => setPreMode("draft")} initialMode={modeParam} />
      </div>
    );
  }

  // ── Main wizard ────────────────────────────────────────────────────────────
  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setPreMode("pre")}
          className={`flex items-center gap-1.5 text-[12px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
          <ArrowRight size={13} /> تغيير المسار
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الصائغ القانوني</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
            {/* Mode badge — shown when arriving from a sidebar link with ?mode= */}
            {modeParam && MODE_BADGE_LABELS[modeParam] && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                isDark ? "bg-[#C8A762]/10 border-[#C8A762]/25 text-[#C8A762]" : "bg-[#0B3D2E]/8 border-[#0B3D2E]/20 text-[#0B3D2E]"
              }`}>
                {MODE_BADGE_LABELS[modeParam]}
              </span>
            )}
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>صياغة جديدة — ٣ خطوات</p>
        </div>
      </div>

      {transcriptNotice && (
        <TranscriptHandoffNotice
          isDark={isDark}
          sourceLabel={transcriptNotice.sourceLabel}
          truncated={transcriptNotice.truncated}
          onDismiss={() => setTranscriptNotice(null)}
        />
      )}

      {/* Progress stepper */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center gap-1">
          {CLIENT_VISIBLE_STEPS.map((step, i) => {
            const isActive = i === s.currentStepIndex;
            const isDone   = i < s.currentStepIndex;
            return (
              <div key={step.key} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => { if (isDone) s.setStep(step.key); }}
                  disabled={!isDone}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold transition-all flex-shrink-0 ${
                    isDone   ? "bg-emerald-500 text-white cursor-pointer hover:scale-105 active:scale-95" :
                    isActive ? "bg-[#0B3D2E] text-white shadow-md" :
                    isDark   ? "bg-zinc-800 text-zinc-500 cursor-default" : "bg-zinc-100 text-zinc-400 cursor-default"
                  }`}>
                  {isDone ? <Check size={12} weight="bold" /> : step.num}
                </button>
                <span className={`text-[10px] hidden lg:block truncate ${
                  isActive ? (isDark ? "text-white font-semibold" : "text-zinc-900 font-semibold") :
                  isDone   ? "text-emerald-500 font-medium" :
                  (isDark  ? "text-zinc-600" : "text-zinc-400")
                }`}>{step.key === "submit" && aiOpen ? "الصياغة" : step.label}</span>
                {i < CLIENT_VISIBLE_STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${isDone ? "bg-emerald-500/40" : isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      {s.step === "identify"  && <StepIdentify  isDark={isDark} clientRole={s.clientRole} setClientRole={s.setClientRole} memoType={s.memoType} setMemoType={s.setMemoType} memoSubType={s.memoSubType} setMemoSubType={s.setMemoSubType} legalBranch={s.legalBranch} setLegalBranch={s.setLegalBranch} notesText={s.notesText} setNotesText={s.setNotesText} showPreFiling={s.showPreFiling} setShowPreFiling={s.setShowPreFiling} />}
      {s.step === "case"      && <StepCase      isDark={isDark} clientRole={s.clientRole} memoType={s.memoType} legalBranch={s.legalBranch} caseText={s.caseText} setCaseText={s.setCaseText} caseFile={s.caseFile} setCaseFile={s.setCaseFile} supportDocs={s.supportDocs} addDoc={s.addDoc} removeDoc={s.removeDoc} updateDoc={s.updateDoc} lawyerNotes={s.lawyerNotes} setLawyerNotes={s.setLawyerNotes} useFirmMemory={s.useFirmMemory} setUseFirmMemory={s.setUseFirmMemory} bulkUpload={s.bulkUpload} setBulkUpload={s.setBulkUpload} partyOne={s.partyOne} setPartyOne={s.setPartyOne} partyTwo={s.partyTwo} setPartyTwo={s.setPartyTwo} caseFileRef={s.caseFileRef} attachRefs={s.attachRefs} uploading={s.uploading} attachError={s.attachError} attachFile={s.attachFile} attachFiles={s.attachFiles} removeAttachment={s.removeAttachment} plaintiffName={s.plaintiffName} setPlaintiffName={s.setPlaintiffName} defendantName={s.defendantName} setDefendantName={s.setDefendantName} judgmentCourt={s.judgmentCourt} setJudgmentCourt={s.setJudgmentCourt} judgmentNumber={s.judgmentNumber} setJudgmentNumber={s.setJudgmentNumber} judgmentDate={s.judgmentDate} setJudgmentDate={s.setJudgmentDate} judgmentText={s.judgmentText} setJudgmentText={s.setJudgmentText} judgmentReasons={s.judgmentReasons} setJudgmentReasons={s.setJudgmentReasons} />}
      {consultantBlocked && (
        <p role="alert" className={`rounded-xl border px-4 py-3 text-[12px] ${isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          {CONSULTANT_BLOCKED_MESSAGE}
        </p>
      )}
      {/* Mounted on every step once the kind is known, so going back does
          not drop a paid analysis or a run in progress; a new kind starts
          a new work (key). */}
      {aiPath && kind && (
        <div className={s.step === "submit" ? "space-y-5" : "hidden"}>
          <StepAiDraft
            key={kind}
            isDark={isDark}
            kind={kind}
            facts={{
              kind,
              clientRole: s.clientRole,
              legalBranch: s.legalBranch,
              caseText: s.caseText,
              notes: [s.notesText, s.lawyerNotes].filter(Boolean).join("\n\n"),
              plaintiffName: s.plaintiffName,
              defendantName: s.defendantName,
              judgment: { court: s.judgmentCourt, number: s.judgmentNumber, date: s.judgmentDate, text: s.judgmentText, reasons: s.judgmentReasons },
              readableFiles: files.ids.length,
            }}
            fileIds={files.ids}
            skippedFiles={files.skipped}
            onPleading={setAiDraftText}
            onToolOff={markAiOff}
          />
          {reviewOpen ? (
            <StepSubmit
              isDark={isDark}
              variant="review"
              summary={s.buildSummary()}
              attachments={s.uploadedAttachments}
              notes={s.submitNotes}
              setNotes={s.setSubmitNotes}
              submitting={s.submitting}
              errors={s.submitErrors}
              onSubmit={() => s.submitOrder(aiDraftText)}
            />
          ) : (
            <button type="button" onClick={() => setReviewOpen(true)}
              className={`w-full rounded-2xl border border-dashed px-4 py-3 text-[12px] font-semibold ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-300 text-zinc-500 hover:text-zinc-700"}`}>
              طلب مراجعة من فريق نظامي (اختياري) — طلب منفصل عن الصياغة
            </button>
          )}
        </div>
      )}
      {s.step === "submit" && !consultantBlocked && !aiPath && (
        <StepSubmit
          isDark={isDark}
          variant="order"
          summary={s.buildSummary()}
          attachments={s.uploadedAttachments}
          notes={s.submitNotes}
          setNotes={s.setSubmitNotes}
          submitting={s.submitting}
          errors={s.submitErrors}
          onSubmit={() => s.submitOrder()}
        />
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={s.prevStep} disabled={s.currentStepIndex === 0}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold border transition-colors disabled:opacity-30 ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
          <ArrowRight size={13} /> السابق
        </button>
        {s.step !== "submit" && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={s.nextStep} disabled={!s.canProceed() || s.processing || s.uploading || consultantBlocked}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40">
            {s.processing ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                جارٍ المعالجة...
              </>
            ) : s.uploading ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                جارٍ رفع المرفق...
              </>
            ) : (
              <>التالي <ArrowLeft size={13} /></>
            )}
          </motion.button>
        )}
      </div>
    </div>
  );
}
