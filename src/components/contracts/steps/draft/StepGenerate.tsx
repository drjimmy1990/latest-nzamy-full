"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowCounterClockwise, Info, UsersThree, Warning } from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import CitationCheckList from "@/components/ai/CitationCheckList";
import { StepSubmit, type StepSubmitRow } from "@/components/contracts/steps/StepSubmit";
import type { ContractsProDraft } from "@/components/contracts/contractsProRun";
import type { AiRunPhase } from "@/hooks/useAiRun";

/**
 * L13 محترف العقود — the draft path's last step (LIVE-F03 / NOTE-22-C04).
 * The contract is written automatically: one click, the outline, then each
 * clause, then every cited article checked in the library. Asking نظامي's
 * team to draft or review it by hand is a separate, optional order below it,
 * never a step on the way to the contract.
 */

interface Props {
  isDark: boolean;
  rows: StepSubmitRow[];
  price: number;
  phase: AiRunPhase;
  error: string | null;
  chargedPoints: number;
  draft: ContractsProDraft | null;
  draftText: string;
  onGenerate: () => void;
  onRestart: () => void;
  /** The separate human order (createServiceOrder), unchanged from before. */
  humanSubmitting: boolean;
  humanErrors: string[];
  onHumanOrder: () => void;
}

export function StepGenerate({
  isDark, rows, price, phase, error, chargedPoints, draft, draftText,
  onGenerate, onRestart, humanSubmitting, humanErrors, onHumanOrder,
}: Props) {
  const [humanOpen, setHumanOpen] = useState(false);
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const busy = phase === "starting" || phase === "running";
  const points = price.toLocaleString("ar-SA");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {draft ? (
        <div className="space-y-4">
          <div className={`${card} p-5 space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{draft.title}</h2>
              <button type="button" onClick={onRestart}
                className={`flex items-center gap-1.5 text-[11px] underline ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                <ArrowCounterClockwise size={12} /> عدّل البيانات واكتب مسودة جديدة
              </button>
            </div>
            {draft.alt && (
              <p className={`text-[11px] ${muted}`}>عقد ثنائي اللغة: {draft.primary} ومقابلها {draft.alt}، بنداً بنداً.</p>
            )}
            {draft.preamble && (
              <Facing isDark={isDark} alt={!!draft.alt} primary={draft.preamble} secondary={draft.preamble_alt} />
            )}
            <div className="space-y-4 max-h-[640px] overflow-y-auto">
              {draft.sections.map((s, n) => (
                <section key={n} className={`pt-4 ${n ? (isDark ? "border-t border-white/[0.06]" : "border-t border-zinc-100") : ""}`}>
                  <Facing isDark={isDark} alt={!!draft.alt} heading primary={s.heading} secondary={s.heading_alt ?? ""} />
                  <Facing isDark={isDark} alt={!!draft.alt} primary={s.body} secondary={s.body_alt ?? ""} />
                </section>
              ))}
            </div>
          </div>

          <div>
            <CitationCheckList
              items={draft.citation_check}
              isDark={isDark}
              title="المواد التي يستند إليها العقد — تحقّقت منها المنصة في مكتبة الأنظمة"
              empty="لا يستند العقد إلى مواد نظامية مرقّمة."
            />
            <p className={`mt-2 text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              مسودة كتبها الذكاء الاصطناعي من بياناتك؛ الفراغات [....] بيانات لم تذكرها. حالة كل مادة من مكتبة نظامي لا من الذكاء الاصطناعي.
              {chargedPoints > 0 && <> · خُصمت {chargedPoints.toLocaleString("ar-SA")} نقطة</>}
            </p>
          </div>

          <div className={`flex gap-3 rounded-2xl border p-4 ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
            <Warning size={16} weight="duotone" className="text-amber-500 shrink-0 mt-0.5" />
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-amber-500/80" : "text-amber-800/80"}`}>
              مسودة آلية للمساعدة. راجعها واملأ الفراغات قبل التوقيع، ويُستحسن عرضها على محامٍ مرخّص.
            </p>
          </div>

          <AiResultActions text={draftText} filename="nzamy-contract" collectorSource="other" className="justify-start" />
        </div>
      ) : (
        <>
          {phase === "running" && (
            <p role="status" className={`rounded-2xl border px-4 py-3 text-[13px] ${isDark ? "border-white/10 bg-white/5 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
              يكتب الذكاء الاصطناعي العقد الآن: المخطط أولاً ثم كل بند على حدة، ثم تتحقق المنصة من المواد في المكتبة. قد يستغرق ذلك بضع دقائق — لا تغلق الصفحة.
            </p>
          )}
          {phase === "review" && (
            <p role="status" className={`rounded-2xl border px-4 py-3 text-[13px] ${isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              المسودة جاهزة وتنتظر مراجعة الفريق قبل عرضها.
            </p>
          )}
          <StepSubmit
            isDark={isDark}
            heading="إنشاء العقد آلياً"
            description={`يكتب الذكاء الاصطناعي العقد من بياناتك فوراً: المخطط ثم البنود واحداً واحداً، وتتحقق المنصة من كل مادة نظامية يستند إليها. التكلفة ${points} نقطة تُخصم مرة واحدة، وتُعاد إن تعذّر الإنشاء.`}
            rows={rows}
            consentText="أقر بأن البيانات المدخلة صحيحة، وأن الناتج مسودة آلية أراجعها قبل استخدامها."
            submitLabel={`اكتب العقد الآن — ${points} نقطة`}
            submittingLabel="جارٍ كتابة العقد..."
            submitting={busy}
            submitErrors={phase === "error" && error ? [error] : []}
            onSubmit={onGenerate}
          />
          <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${muted}`}>
            <Info size={13} className="shrink-0 mt-0.5" />
            يكتب العقد من معرفته بالأنظمة ثم تتحقق المنصة من المواد التي استشهد بها؛ لا يقرأ نصوص المكتبة قبل الكتابة بعد.
          </p>
        </>
      )}

      {/* The separate, optional human order — never needed for the contract above. */}
      <div className={`${card} p-4`}>
        <button type="button" onClick={() => setHumanOpen((v) => !v)} aria-expanded={humanOpen}
          className="w-full flex items-center justify-between gap-3 text-right">
          <span className="flex items-center gap-2">
            <UsersThree size={16} weight="duotone" className="text-[#C8A762] shrink-0" />
            <span>
              <span className={`block text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>طلب منفصل واختياري: صياغة أو مراجعة بشرية من فريق نظامي</span>
              <span className={`block text-[11px] ${muted}`}>لا يلزم لإنشاء العقد آلياً. يُرسل بياناتك نفسها لفريق نظامي، ويُتابَع في «طلباتي».</span>
            </span>
          </span>
          <span className={`text-[11px] underline shrink-0 ${muted}`}>{humanOpen ? "إخفاء" : "عرض"}</span>
        </button>
        {humanOpen && (
          <div className="mt-4">
            <StepSubmit
              isDark={isDark}
              heading="إرسال طلب لفريق نظامي"
              description="يصوغ فريق نظامي العقد أو يراجع مسودتك يدوياً، وسيصلك إشعار عند جهوزيته."
              rows={[]}
              consentText="أقر بأن البيانات المدخلة صحيحة، وأوافق على إرسالها لفريق نظامي."
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

/** One text, and beside it its translation when the contract is bilingual. */
function Facing({ isDark, alt, primary, secondary, heading = false }: {
  isDark: boolean; alt: boolean; primary: string; secondary: string; heading?: boolean;
}) {
  const cls = heading
    ? `text-[13px] font-bold mb-1.5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`
    : `text-[13px] leading-loose whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  if (!alt) return <p dir="auto" className={cls}>{primary}</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <p dir="auto" className={cls}>{primary}</p>
      <p dir="auto" className={cls}>{secondary}</p>
    </div>
  );
}
