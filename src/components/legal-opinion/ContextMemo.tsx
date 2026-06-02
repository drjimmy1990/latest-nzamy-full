"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Gavel, Buildings, Handshake, User } from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";

type MemoAudience = "judge" | "gov" | "partner" | "client";
type LawyerSide = "plaintiff" | "defendant" | "neutral";

const AUDIENCE_OPTIONS: { id: MemoAudience; label: string; icon: React.ElementType; placeholder: string }[] = [
  { id: "judge",   label: "قاضٍ",          icon: Gavel,    placeholder: "اشرح الوقائع بصيغة قانونية دقيقة وحيادية مناسبة للمذكرة القضائية..." },
  { id: "gov",     label: "جهة حكومية",    icon: Buildings, placeholder: "اشرح الموضوع بأسلوب رسمي مؤسسي مع الإشارة للصلاحيات والأنظمة المعنية..." },
  { id: "partner", label: "شريك / مستثمر", icon: Handshake, placeholder: "اشرح الموقف القانوني بأسلوب ذكي يراعي المصالح التجارية والمخاطر..." },
  { id: "client",  label: "عميل",          icon: User,      placeholder: "اشرح الوضع بلغة بسيطة ومفهومة مع تجنب المصطلحات المعقدة..." },
];

interface Props {
  topicArea: string;
  setTopicArea: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  question: string;
  setQuestion: (v: string) => void;
  isDark: boolean;
  card: string;
}

export function ContextMemo({ description, setDescription, question, setQuestion, isDark, card }: Props) {
  const [audience, setAudience] = useState<MemoAudience>("judge");
  const [side, setSide] = useState<LawyerSide>("plaintiff");

  const selectedAudience = AUDIENCE_OPTIONS.find(a => a.id === audience)!;

  return (
    <motion.div
      key="ctx-memo"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      {/* Audience — أول شيء */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          موجَّه إلى
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {AUDIENCE_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isActive = audience === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setAudience(opt.id)}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all ${
                  isActive
                    ? isDark
                    ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]"
                    : "border-[#C8A762]/50 bg-[#C8A762]/8 text-[#0B3D2E] font-semibold"
                    : isDark
                    ? "border-white/[0.07] text-zinc-400 hover:border-[#C8A762]/20"
                    : "border-slate-200 text-slate-500 hover:border-[#C8A762]/30"
                }`}
              >
                <Icon size={16} weight={isActive ? "fill" : "duotone"} />
                <span className="text-[11px] font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>
        {/* Hint about auto-style */}
        <p className={`text-[10px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          سيتكيّف أسلوب الكتابة تلقائياً بحسب الجهة المستهدفة
        </p>
      </div>

      {/* Facts */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            وقائع القضية
          </p>
          <VoiceInput
            onTranscript={t => setDescription(description ? description + " " + t : t)}
            compact
          />
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={selectedAudience.placeholder}
          rows={5}
          className={`w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${
            isDark
              ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40"
              : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#C8A762]/40"
          }`}
        />
      </div>

      {/* Specific legal question */}
      <div className={`${card} p-4`}>
        <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          السؤال القانوني المحدد
          <span className={`text-[10px] font-normal ms-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>(اختياري)</span>
        </p>
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="مثال: هل يحق للموكل المطالبة بالتعويض وفق المادة ٧٧؟"
          className={`w-full rounded-xl border px-3.5 py-2.5 text-[13px] outline-none ${
            isDark
              ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600"
              : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
          }`}
        />
      </div>

      {/* Lawyer side */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          موقف المحامي في القضية
        </p>
        <div className="flex gap-2">
          {([
            { id: "plaintiff" as LawyerSide, label: "مدّعٍ" },
            { id: "defendant" as LawyerSide, label: "مدّعى عليه" },
            { id: "neutral"   as LawyerSide, label: "حيادي / مستشار" },
          ]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setSide(opt.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
                side === opt.id
                  ? isDark
                  ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/20 text-emerald-400"
                  : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]"
                  : isDark
                  ? "border-white/[0.07] text-zinc-400 hover:border-white/[0.12]"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              <span className={`w-3 h-3 rounded-full border-2 transition-all ${
                side === opt.id
                  ? "border-[#0B3D2E] bg-[#0B3D2E]"
                  : isDark ? "border-zinc-600" : "border-slate-300"
              }`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
