"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  PencilSimple, Copy, CheckCircle, Microphone, TextT,
  MagicWand, DownloadSimple, ArrowCounterClockwise, ChatCenteredText,
  Gavel, Shield, BookOpen, Scales, ChatCircleDots, Sparkle, X,
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { VoiceInput } from "@/components/ui/VoiceInput";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MemoSection {
  id: string;
  type: "header" | "heading" | "defense" | "sub-defense" | "text" | "requests";
  label?: string;        // e.g. "الدفع الأول"
  tag?: string;          // e.g. "أساسي" | "إجرائي"
  tagColor?: string;
  heading?: string;      // section heading text
  content: string;       // full body text
  lawRef?: string;       // e.g. "المادة ٧٧ — نظام العمل"
}

// ─── Mock structured memo ─────────────────────────────────────────────────────
const MOCK_SECTIONS: MemoSection[] = [
  {
    id: "header", type: "header",
    content: "بسم الله الرحمن الرحيم\n\nأصحاب الفضيلة / قضاة الدائرة العمالية حفظهم الله\n\nالسلام عليكم ورحمة الله وبركاته",
  },
  {
    id: "subject", type: "heading", heading: "الموضوع",
    content: "صحيفة دعوى — فصل تعسفي",
  },
  {
    id: "facts", type: "heading", heading: "أولاً: الوقائع",
    content: "التحق موكلنا / [اسم الموكل] بالعمل لدى المدعى عليها / [اسم الشركة] بموجب عقد عمل محدد المدة مؤرخ في [التاريخ]، وقد فوجئ بإنهاء خدماته بتاريخ [التاريخ] دون إشعار مسبق كافٍ ودون مسوّغ نظامي مشروع.",
  },
  {
    id: "d1", type: "defense",
    label: "الدفع الأول", tag: "أساسي", tagColor: "red",
    heading: "بطلان الإنهاء لعدم الإشعار المسبق",
    content: "استناداً إلى المادة (٧٧) من نظام العمل الصادر بالمرسوم الملكي م/٥١، يلتزم صاحب العمل بإشعار العامل قبل الإنهاء بمدة لا تقل عن ثلاثين (٣٠) يوماً، وقد أخلّت المدعى عليها بهذا الالتزام مما يُرتّب فساد الإنهاء وبطلانه.",
    lawRef: "المادة ٧٧ — نظام العمل",
  },
  {
    id: "d1a", type: "sub-defense",
    label: "الدفع الفرعي ١/أ",
    heading: "عدم وجود إخطار خطي معتبر",
    content: "لم يتسلّم الموكل أي إخطار خطي رسمي يُثبت تسليم إشعار الإنهاء بل جرى الإنهاء شفهياً وفجأةً، مما يجعل الإنهاء مجرداً من الركن الشكلي اللازم نظاماً.",
  },
  {
    id: "d2", type: "defense",
    label: "الدفع الثاني", tag: "أساسي", tagColor: "red",
    heading: "استحقاق مكافأة نهاية الخدمة كاملة",
    content: "وفقاً للمادتين (٨٤) و(٨٨) من نظام العمل، يستحق الموكل مكافأة نهاية الخدمة محسوبة على أساس آخر أجر شهري عن كل سنة خدمة، دون أي تخفيض بسبب الإنهاء التعسفي من قِبل صاحب العمل.",
    lawRef: "المادتان ٨٤، ٨٨ — نظام العمل",
  },
  {
    id: "d3", type: "defense",
    label: "الدفع الثالث", tag: "إجرائي", tagColor: "blue",
    heading: "بطلان الإنهاء لمخالفة ضوابط التأديب",
    content: "أوجبت المادة (٨٩) من نظام العمل اتباع إجراءات تأديبية محددة قبل الإنهاء، ولم تُثبت المدعى عليها اتخاذ أي إجراء تأديبي مسبق، مما يُفقد قرار الإنهاء مشروعيته الإجرائية.",
    lawRef: "المادة ٨٩ — نظام العمل",
  },
  {
    id: "d3a", type: "sub-defense",
    label: "الدفع الفرعي ٣/أ",
    heading: "التعويض عن الفصل التعسفي",
    content: "طبقاً لنص المادة (٨٠) من نظام العمل، يحق للموكل طلب التعويض عن الأضرار الجسيمة التي لحقت به نتيجة الفصل التعسفي، ويُقدّر هذا التعويض وفق الضرر الفعلي الثابت.",
  },
  {
    id: "requests", type: "requests", heading: "ثالثاً: الطلبات",
    content: "نلتمس من عدالتكم الحكم بما يلي:\n١. إلزام المدعى عليها بأجر الإشعار كاملاً عن مدة ثلاثين (٣٠) يوماً.\n٢. إلزام المدعى عليها بصرف مكافأة نهاية الخدمة الكاملة.\n٣. إلزام المدعى عليها بالتعويض عن الفصل التعسفي وفق ما تقدّره عدالتكم.\n٤. إلزام المدعى عليها بالمصروفات القضائية.",
  },
];

// ─── Revision Panel ───────────────────────────────────────────────────────────
function RevisionPanel({
  isDark, sectionLabel, onClose, onApply,
}: {
  isDark: boolean; sectionLabel?: string;
  onClose: () => void; onApply: (inst: string) => void;
}) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [instruction, setInstruction] = useState("");
  const presets = [
    "اجعل الأسلوب أكثر رسمية",
    "شدّد لهجة المطالبة",
    "اختصر الفقرة",
    "أضف مرجعاً نظامياً",
    "استبدل الألفاظ العامية",
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      className={`rounded-2xl border shadow-lg p-4 space-y-3 ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MagicWand size={14} weight="duotone" className="text-[#C8A762]" />
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            تعديل AI{sectionLabel ? ` — ${sectionLabel}` : ""}
          </p>
        </div>
        <button onClick={onClose}><X size={13} className={isDark ? "text-zinc-600 hover:text-zinc-300" : "text-slate-400"} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button key={p} onClick={() => setInstruction(prev => prev ? prev + " — " + p : p)}
            className={`text-[10px] px-2.5 py-1 rounded-full border font-medium transition-all ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:border-royal/30 hover:text-royal"}`}>
            {p}
          </button>
        ))}
      </div>
      <div className={`flex rounded-xl p-0.5 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        {(["text", "voice"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${mode === m ? isDark ? "bg-zinc-700 text-white" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-500" : "text-slate-500"}`}>
            {m === "text" ? <><TextT size={11} />نصي</> : <><Microphone size={11} />صوتي</>}
          </button>
        ))}
      </div>
      {mode === "text" ? (
        <textarea value={instruction} onChange={e => setInstruction(e.target.value)}
          rows={2} placeholder="اكتب تعليمات التعديل..."
          className={`w-full resize-none rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`} />
      ) : (
        <div className={`p-3 rounded-xl border ${isDark ? "border-white/[0.07] bg-zinc-800/40" : "border-slate-100 bg-slate-50"}`}>
          <VoiceInput onTranscript={t => setInstruction(prev => prev ? prev + " " + t : t)} compact />
          {instruction && <p className={`text-[11px] italic mt-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{instruction}</p>}
        </div>
      )}
      <button disabled={!instruction.trim()} onClick={() => { onApply(instruction); setInstruction(""); }}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold disabled:opacity-40">
        <MagicWand size={12} weight="fill" />✨ طبّق التعديل
      </button>
    </motion.div>
  );
}

// ─── Single memo block ────────────────────────────────────────────────────────
function MemoBlock({
  section, isDark, index,
}: {
  section: MemoSection; isDark: boolean; index: number;
}) {
  const [hover, setHover] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const tagColors: Record<string, { d: string; l: string }> = {
    red:  { d: "border-red-700/30 bg-red-900/10 text-red-400",     l: "border-red-200 bg-red-50 text-red-600" },
    blue: { d: "border-blue-700/30 bg-blue-900/10 text-blue-400",  l: "border-blue-200 bg-blue-50 text-blue-600" },
  };

  const typeIcon: Record<string, React.ElementType> = {
    defense: Gavel, "sub-defense": Shield, heading: BookOpen,
    requests: Scales, header: Sparkle, text: ChatCircleDots,
  };
  const TypeIcon = typeIcon[section.type] ?? BookOpen;

  if (section.type === "header") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className={`rounded-2xl p-5 text-center space-y-1 ${isDark ? "bg-zinc-900/60 border border-white/[0.04]" : "bg-gradient-to-b from-slate-50 to-white border border-slate-100"}`}
      >
        <p className={`text-[13px] leading-relaxed font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`} dir="rtl">
          {section.content}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => !chatOpen && setHover(false)}
      className={`group relative rounded-2xl border overflow-hidden transition-all duration-200 ${
        chatOpen
          ? isDark ? "border-[#C8A762]/30 ring-1 ring-[#C8A762]/20" : "border-[#C8A762]/40 ring-1 ring-[#C8A762]/20"
          : hover
          ? isDark ? "border-white/[0.12]" : "border-slate-300 shadow-sm"
          : isDark ? "border-white/[0.06]" : "border-slate-100"
      } ${
        section.type === "defense"
          ? isDark ? "bg-zinc-900/80" : "bg-white"
          : section.type === "sub-defense"
          ? isDark ? "bg-zinc-900/40 mr-4 border-r-2 border-r-[#C8A762]/20" : "bg-slate-50/80 mr-4 border-r-2 border-r-amber-200"
          : section.type === "requests"
          ? isDark ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30" : "bg-emerald-50/50 border-emerald-200"
          : isDark ? "bg-zinc-900/40" : "bg-white"
      }`}
    >
      {/* Main content */}
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
            section.type === "defense" ? isDark ? "bg-zinc-800" : "bg-slate-100"
            : section.type === "sub-defense" ? isDark ? "bg-[#C8A762]/10" : "bg-amber-50"
            : section.type === "requests" ? isDark ? "bg-emerald-900/30" : "bg-emerald-100"
            : isDark ? "bg-zinc-800" : "bg-slate-100"
          }`}>
            <TypeIcon size={13} weight="duotone" className={
              section.type === "defense" ? isDark ? "text-zinc-400" : "text-slate-500"
              : section.type === "sub-defense" ? "text-[#C8A762]"
              : section.type === "requests" ? "text-emerald-500"
              : isDark ? "text-zinc-500" : "text-slate-400"
            } />
          </div>

          <div className="flex-1 min-w-0">
            {/* Label + tags */}
            {(section.label || section.tag) && (
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {section.label && (
                  <span className={`text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{section.label}</span>
                )}
                {section.tag && section.tagColor && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${isDark ? tagColors[section.tagColor].d : tagColors[section.tagColor].l}`}>
                    {section.tag}
                  </span>
                )}
                {section.lawRef && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"}`}>
                    {section.lawRef}
                  </span>
                )}
              </div>
            )}

            {/* Heading */}
            {section.heading && (
              <p className={`text-[13px] font-bold mb-1.5 ${
                section.type === "defense" ? isDark ? "text-zinc-100" : "text-zinc-800"
                : section.type === "requests" ? isDark ? "text-emerald-300" : "text-emerald-800"
                : isDark ? "text-zinc-200" : "text-zinc-700"
              }`}>{section.heading}</p>
            )}

            {/* Content */}
            <p className={`text-[12px] leading-[1.85] whitespace-pre-line ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              {section.content}
            </p>
          </div>

          {/* Hover actions */}
          <AnimatePresence>
            {hover && (
              <motion.div
                initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}
                className="flex items-center gap-1 flex-shrink-0"
              >
                <button
                  onClick={() => { navigator.clipboard.writeText(section.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  title="نسخ"
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${isDark ? "border-white/[0.08] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}
                >
                  {copied ? <CheckCircle size={11} className="text-emerald-500" weight="fill" /> : <Copy size={11} />}
                </button>
                <button
                  onClick={() => setChatOpen(v => !v)}
                  title="تعديل AI"
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                    chatOpen
                      ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]"
                      : isDark ? "border-white/[0.08] text-zinc-500 hover:text-[#C8A762]" : "border-slate-200 text-slate-400 hover:text-[#C8A762]"
                  }`}
                >
                  <ChatCenteredText size={11} weight="duotone" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Inline AI revision panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden"
          >
            <div className={`border-t px-4 pb-4 pt-3 ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <RevisionPanel
                isDark={isDark}
                sectionLabel={section.label ?? section.heading}
                onClose={() => { setChatOpen(false); setHover(false); }}
                onApply={() => { setChatOpen(false); setHover(false); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Streaming intro for header ───────────────────────────────────────────────
function useStreamSections(sections: MemoSection[]) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    setVisible(0);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setVisible(i);
      if (i >= sections.length) clearInterval(iv);
    }, 80);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return visible;
}

// ─── Main StepDrafting ────────────────────────────────────────────────────────
interface StepDraftingProps {
  isDark: boolean;
  memoType: string;
  memoSubType: string;
}

export function StepDrafting({ isDark, memoType, memoSubType }: StepDraftingProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const [copied, setCopied]               = useState(false);
  const [showRevision, setShowRevision]   = useState(false);
  const [revisionHistory, setRevisionHistory] = useState<string[]>([]);
  const visible = useStreamSections(MOCK_SECTIONS);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

      {/* Toolbar */}
      <div className={`${card} px-4 py-3 flex items-center gap-3 shadow-sm`}>
        <PencilSimple size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
        <span className={`text-[12px] font-semibold flex-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {memoType}: {memoSubType}
        </span>
        <div className="flex items-center gap-1.5">
          {revisionHistory.length > 0 && (
            <button onClick={() => setRevisionHistory(prev => prev.slice(0, -1))}
              className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
              <ArrowCounterClockwise size={11} />تراجع
            </button>
          )}
          <button
            onClick={() => { const all = MOCK_SECTIONS.map(s => s.content).join("\n\n"); navigator.clipboard.writeText(all); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
            {copied ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
            {copied ? "تم" : "نسخ الكل"}
          </button>
          <button
            onClick={() => setShowRevision(!showRevision)}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] border font-bold transition-all ${showRevision ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
            <ChatCenteredText size={11} weight="duotone" />تعديل AI
          </button>
        </div>
      </div>

      {/* Global AI revision panel */}
      <AnimatePresence>
        {showRevision && (
          <RevisionPanel
            isDark={isDark}
            onClose={() => setShowRevision(false)}
            onApply={(inst) => {
              setRevisionHistory(prev => [...prev, inst]);
              setShowRevision(false);
            }}
          />
        )}
      </AnimatePresence>

      <BetaReviewGate toolId="draft.final" toolName={memoType === "contract" ? "صياغة العقد" : "الصائغ القانوني"} reviewScope="legal-data">
        {/* Hint */}
        <p className={`text-[10px] px-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          💡 اضغط على أي بند للتعديل بالذكاء الاصطناعي أو نسخه منفرداً
        </p>

        {/* Structured memo blocks */}
        <div className="space-y-2">
          {MOCK_SECTIONS.slice(0, visible).map((section, i) => (
            <MemoBlock key={section.id} section={section} isDark={isDark} index={i} />
          ))}
        </div>

        {/* Downloads */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button className="flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] col-span-2 hover:bg-[#0a3328]">
            <DownloadSimple size={14} />تنزيل Word
          </button>
          <button className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-bold transition-all ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
            <DownloadSimple size={14} />PDF
          </button>
        </div>
      </BetaReviewGate>
    </motion.div>
  );
}
