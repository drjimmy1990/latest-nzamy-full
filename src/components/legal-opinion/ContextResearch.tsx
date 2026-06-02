"use client";

import { useState, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "@phosphor-icons/react";

type ResearchType = "text" | "topic" | "compare";

const COMPARE_SYSTEMS = [
  "النظام الإماراتي", "النظام المصري", "النظام الفرنسي",
  "النظام الأمريكي", "القانون الدولي", "نظام DIFC",
];

const RESEARCH_TYPE_OPTIONS: { id: ResearchType; label: string; desc: string; placeholder: string }[] = [
  {
    id: "text",
    label: "بحث في نص محدد",
    desc: "أرفق نصاً وسيبحث AI في داخله",
    placeholder: "الصق النص القانوني هنا للبحث فيه..."
  },
  {
    id: "topic",
    label: "بحث في موضوع عام",
    desc: "ابحث في قاعدة المعرفة القانونية",
    placeholder: "مثال: أحكام الفسخ في عقود المقاولة وقواعد احتساب التعويض..."
  },
  {
    id: "compare",
    label: "بحث مقارن",
    desc: "قارن النظام السعودي بنظام آخر",
    placeholder: "موضوع المقارنة مثال: أحكام إعادة هيكلة الديون في الإفلاس..."
  },
];

interface Props {
  description: string;
  setDescription: (v: string) => void;
  isDark: boolean;
  card: string;
}

export function ContextResearch({ description, setDescription, isDark, card }: Props) {
  const [researchType, setResearchType] = useState<ResearchType>("topic");
  const [compareWith, setCompareWith] = useState("النظام الإماراتي");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");

  const addKeyword = () => {
    const kw = kwInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw]);
    }
    setKwInput("");
  };

  const handleKwKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    }
  };

  const selectedType = RESEARCH_TYPE_OPTIONS.find(r => r.id === researchType)!;

  return (
    <motion.div
      key="ctx-research"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      {/* Research type */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          نوع البحث
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {RESEARCH_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setResearchType(opt.id)}
              className={`p-3 rounded-xl border text-start transition-all ${
                researchType === opt.id
                  ? isDark
                  ? "border-purple-500/40 bg-purple-900/15"
                  : "border-purple-400/40 bg-purple-50"
                  : isDark
                  ? "border-white/[0.07] hover:border-white/[0.12]"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className={`text-[12px] font-bold mb-0.5 ${
                researchType === opt.id
                  ? isDark ? "text-purple-400" : "text-purple-700"
                  : isDark ? "text-zinc-300" : "text-zinc-700"
              }`}>{opt.label}</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Compare system picker (shown only when compare) */}
      <AnimatePresence>
        {researchType === "compare" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className={`${card} p-4 overflow-hidden`}
          >
            <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              النظام السعودي مقابل
            </p>
            <div className="flex flex-wrap gap-2">
              {COMPARE_SYSTEMS.map(sys => (
                <button
                  key={sys}
                  onClick={() => setCompareWith(sys)}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-medium transition-all ${
                    compareWith === sys
                      ? isDark ? "border-purple-500/40 bg-purple-900/20 text-purple-400" : "border-purple-300 bg-purple-50 text-purple-700"
                      : isDark ? "border-white/[0.07] text-zinc-500 hover:border-purple-500/20" : "border-slate-200 text-slate-500 hover:border-purple-200"
                  }`}
                >{sys}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input */}
      <div className={`${card} p-4`}>
        <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {researchType === "text" ? "النص المراد البحث فيه" : "موضوع البحث"}
        </p>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={selectedType.placeholder}
          rows={researchType === "text" ? 7 : 4}
          className={`w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${
            isDark
              ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500/40"
              : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400 focus:border-purple-400/40"
          }`}
        />
      </div>

      {/* Keywords */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          الكلمات المفتاحية <span className="normal-case font-normal opacity-60">(اختياري)</span>
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {keywords.map(kw => (
            <span key={kw} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium ${
              isDark ? "bg-purple-900/30 text-purple-300 border border-purple-700/30" : "bg-purple-50 text-purple-700 border border-purple-200"
            }`}>
              {kw}
              <button onClick={() => setKeywords(prev => prev.filter(k => k !== kw))} className="hover:text-red-400 transition-colors">
                <X size={9} weight="bold" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={kwInput}
            onChange={e => setKwInput(e.target.value)}
            onKeyDown={handleKwKey}
            placeholder="اكتب كلمة مفتاحية ثم اضغط Enter..."
            className={`flex-1 rounded-xl border px-3.5 py-2 text-[12px] outline-none ${
              isDark
                ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600"
                : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"
            }`}
          />
          <button
            onClick={addKeyword}
            disabled={!kwInput.trim()}
            className={`px-3 py-2 rounded-xl border text-[12px] font-bold transition-colors disabled:opacity-40 ${
              isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
