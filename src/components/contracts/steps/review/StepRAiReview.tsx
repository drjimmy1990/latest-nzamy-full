"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Info, UsersThree, Warning } from "@phosphor-icons/react";
import { AiThinkingStage, type AiStageRun } from "@/components/ai/AiThinkingStage";
import { aiToolLabelAr } from "@/lib/ai/toolLabels";
import { RUN_HELD_MESSAGE_AR } from "@/lib/ai/runPageView";
import { CONTRACT_REVIEW_PRICE } from "@/lib/ai/tools";
import { ContractReviewReport } from "@/components/contracts/ContractReviewReport";
import type { ContractReview, ContractReviewSource } from "@/components/contracts/contractReviewRun";
import { StepSubmit, type StepSubmitAttachment, type StepSubmitRow } from "@/components/contracts/steps/StepSubmit";
import type { AiRunPhase } from "@/hooks/useAiRun";

/**
 * The review path's last step. The page reads tool-status once and hands the answer
 * in (src/hooks/useToolUsable.ts):
 *   not known yet  no price and no form;
 *   not usable     today's order to نظامي's team, and no price (owner q296);
 *   usable         the AI review as the main card, and the team order as a separate
 *                  optional block, as in StepGenerate.
 * Any failed read counts as not usable (src/lib/ai/toolStatusClient.ts).
 */

const HUMAN_ORDER = {
  heading: "مراجعة الطلب وإرساله",
  description: "مراجعة العقد بالذكاء الاصطناعي (تقسيم البنود وتقدير مخاطر كل بند) لم تُتح بعد؛ هذا طلب بشري يراجع فيه فريق نظامي العقد المرفوع ويرسل لك تقرير المراجعة، وسيصلك إشعار عند جهوزيته.",
  consentText: "أقر بأن البيانات المدخلة صحيحة، وأوافق على إرسال العقد المرفوع لفريق نظامي لمراجعته.",
};

interface Props {
  isDark: boolean;
  /** tool-status: null until the server answers. */
  usable: boolean | null;
  rows: StepSubmitRow[];
  attachments: StepSubmitAttachment[];
  /** What a run would read: a file, the pasted text, or why nothing can run. */
  source: ContractReviewSource;
  phase: AiRunPhase;
  error: string | null;
  /** The run's live progress, for the waiting stage. */
  run: AiStageRun;
  chargedPoints: number;
  review: ContractReview | null;
  onRun: () => void;
  onRestart: () => void;
  humanSubmitting: boolean;
  humanErrors: string[];
  onHumanOrder: () => void;
}

export function StepRAiReview(props: Props) {
  const { isDark, usable, rows, attachments, humanSubmitting, humanErrors, onHumanOrder } = props;
  if (usable === null) {
    return <p role="status" className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ التحقق…</p>;
  }
  if (!usable) {
    return (
      <StepSubmit
        isDark={isDark}
        heading={HUMAN_ORDER.heading}
        description={HUMAN_ORDER.description}
        rows={rows}
        attachments={attachments}
        consentText={HUMAN_ORDER.consentText}
        submitting={humanSubmitting}
        submitErrors={humanErrors}
        onSubmit={onHumanOrder}
      />
    );
  }
  return <UsableReview {...props} />;
}

function UsableReview({
  isDark, rows, attachments, source, phase, error, run, chargedPoints, review, onRun, onRestart, humanSubmitting, humanErrors, onHumanOrder,
}: Props) {
  const [humanOpen, setHumanOpen] = useState(false);
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const busy = phase === "starting" || phase === "running";
  const points = CONTRACT_REVIEW_PRICE.toLocaleString("ar-SA");
  const left = source.kind === "none" ? [] : source.left;
  const pasteIgnored = source.kind === "file" && source.pasteIgnored;
  const sent = source.kind === "file" ? attachments.filter((a) => source.fileIds.includes(a.documentId)) : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {review ? (
        <ContractReviewReport review={review} isDark={isDark} chargedPoints={chargedPoints} onRestart={onRestart} />
      ) : (
        <>
          <AiThinkingStage run={run} isDark={isDark} toolLabel={aiToolLabelAr("contract-review")} />
          {phase === "review" && (
            <p role="status" className={`rounded-2xl border px-4 py-3 text-[13px] ${isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {RUN_HELD_MESSAGE_AR}
            </p>
          )}
          {source.kind === "none" ? (
            <div className={`${card} p-5 space-y-2`}>
              <p className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مراجعة العقد بالذكاء الاصطناعي — {points} نقطة</p>
              <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-500">
                <Warning size={14} className="mt-0.5 shrink-0" />{source.reason}
              </p>
            </div>
          ) : (
            <StepSubmit
              isDark={isDark}
              heading={`مراجعة العقد بالذكاء الاصطناعي — ${points} نقطة`}
              description={`يقرأ الذكاء الاصطناعي عقدك (حتى ١٥ صفحة) ويحدد مخاطر كل بند لمصلحة الطرف الذي تمثّله، مع تعديل دفاعي وآخر تفاوضي، وتتحقق المنصة من المواد المذكورة في مكتبتها. التكلفة ${points} نقطة تُخصم مرة واحدة، وتُعاد إن تعذّرت المراجعة.`}
              rows={rows}
              attachments={sent}
              consentText="أقر بأن البيانات المدخلة صحيحة، وأن الناتج مراجعة آلية أراجعها قبل استخدامها."
              submitLabel={`راجع العقد الآن — ${points} نقطة`}
              submittingLabel="جارٍ مراجعة العقد..."
              submitting={busy}
              submitErrors={
                phase === "error" && error ? [error]
                  // The server accepted a report this page cannot read: say so, never show the form as if nothing happened.
                  : phase === "done" ? ["اكتملت المراجعة لكن تعذّر عرض التقرير هنا — تواصل مع الدعم."]
                  : []
              }
              onSubmit={onRun}
            />
          )}
          {(left.length > 0 || pasteIgnored) && (
            <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${muted}`}>
              <Info size={13} className="mt-0.5 shrink-0" />
              {left.length > 0 && <>تقرأ المراجعة عقداً واحداً، فلا تُرسل هذه الملفات: {left.join("، ")}. </>}
              {pasteIgnored && <>يُرسل الملف المرفق، ولا يُرسل النص الملصق.</>}
            </p>
          )}
        </>
      )}

      {/* The separate, optional human order — never needed for the review above. */}
      <div className={`${card} p-4`}>
        <button type="button" onClick={() => setHumanOpen((v) => !v)} aria-expanded={humanOpen} className="flex w-full items-center justify-between gap-3 text-right">
          <span className="flex items-center gap-2">
            <UsersThree size={16} weight="duotone" className="shrink-0 text-[#C8A762]" />
            <span>
              <span className={`block text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>طلب منفصل واختياري: مراجعة بشرية من فريق نظامي</span>
              <span className={`block text-[11px] ${muted}`}>لا يلزم للمراجعة الآلية. يُرسل بياناتك وعقدك لفريق نظامي، ويُتابَع في «طلباتي».</span>
            </span>
          </span>
          <span className={`shrink-0 text-[11px] underline ${muted}`}>{humanOpen ? "إخفاء" : "عرض"}</span>
        </button>
        {humanOpen && (
          <div className="mt-4">
            <StepSubmit
              isDark={isDark}
              heading="إرسال طلب لفريق نظامي"
              description="يراجع فريق نظامي العقد المرفوع يدوياً ويرسل لك تقرير المراجعة، وسيصلك إشعار عند جهوزيته."
              rows={[]}
              attachments={attachments}
              consentText={HUMAN_ORDER.consentText}
              submitLabel="إرسال الطلب للفريق"
              submitting={humanSubmitting}
              submitErrors={humanErrors}
              onSubmit={onHumanOrder}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
