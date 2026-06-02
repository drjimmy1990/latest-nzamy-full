"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Gear, Robot, SlidersHorizontal, PencilSimple,
  CheckCircle, Sparkle, PlusCircle, X,
  Notebook, Scales, Buildings,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AISettingsPage() {
  const { isDark } = useTheme();
  const [style, setStyle] = useState("رسمي");
  const [specialization, setSpecialization] = useState("قانون العمل");
  const [instructions, setInstructions] = useState("أنا محامٍ متخصص في قضايا العمل. أُفضّل الإجابات المختصرة مع الاستشهاد بالمواد القانونية مباشرةً.");
  const [templates, setTemplates] = useState(["مذكرة دفاعية عمالية", "عقد عمل محدد المدة"]);
  const [newTemplate, setNewTemplate] = useState("");
  const [saved, setSaved] = useState(false);

  const STYLES = ["رسمي جداً", "رسمي", "احترافي واضح", "مبسّط"];
  const SPECS = ["قانون العمل", "قانون الأحوال الشخصية", "قانون تجاري", "قانون عقاري", "قانون إداري", "تحكيم", "عام"];

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className={`p-5 md:p-7 max-w-3xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>التعليمات الشخصية</h1>
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>PRO+</span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          حدّد أسلوبك وتخصصك — AI يلتزم بها في كل تفاعل
        </p>
      </div>

      {/* Info */}
      <div className={`rounded-2xl p-4 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start gap-2.5">
          <Robot size={15} className="flex-shrink-0 mt-0.5 text-[#C8A762]" />
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            نظامي AI يقرأ هذه التعليمات قبل كل تفاعل — الاستشارة والصياغة والبحث ستعكس أسلوبك وتخصصك تلقائياً.
          </p>
        </div>
      </div>

      {/* Writing style */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal size={16} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <h2 className={`font-bold text-[14px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>أسلوب الكتابة</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STYLES.map(s => (
            <motion.button key={s} whileTap={{ scale: 0.97 }}
              onClick={() => setStyle(s)}
              className={`rounded-xl px-3 py-2.5 text-[12px] font-medium border text-center transition-colors ${style === s
                ? isDark ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/50 text-emerald-300" : "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                : isDark ? "border-white/[0.06] text-zinc-400 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {s}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Specialization */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-4">
          <Scales size={16} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <h2 className={`font-bold text-[14px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>التخصص القانوني</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {SPECS.map(s => (
            <motion.button key={s} whileTap={{ scale: 0.97 }}
              onClick={() => setSpecialization(s)}
              className={`rounded-xl px-3.5 py-2 text-[12px] font-medium border transition-colors ${specialization === s
                ? isDark ? "bg-[#C8A762]/15 border-[#C8A762]/30 text-[#C8A762]" : "bg-amber-50 border-amber-300 text-amber-800"
                : isDark ? "border-white/[0.06] text-zinc-500 hover:bg-zinc-800" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {s}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Custom instructions */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-4">
          <Notebook size={16} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <h2 className={`font-bold text-[14px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>تعليمات خاصة</h2>
        </div>
        <textarea
          value={instructions} onChange={e => setInstructions(e.target.value)}
          placeholder="مثال: أنا محامٍ في شركة تجارية — أُفضّل الإجابات المختصرة مع مقارنة بين الخيارات القانونية..."
          rows={4}
          className={`w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"}`}
        />
        <p className={`mt-2 text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{instructions.length}/500 حرف</p>
      </div>

      {/* Favorite templates */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-4">
          <PencilSimple size={16} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <h2 className={`font-bold text-[14px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>القوالب المفضّلة</h2>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <AnimatePresence>
            {templates.map(t => (
              <motion.span key={t} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
                {t}
                <button onClick={() => setTemplates(prev => prev.filter(i => i !== t))} className={isDark ? "text-zinc-600 hover:text-red-400" : "text-zinc-400 hover:text-red-500"}>
                  <X size={11} />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.08] bg-zinc-800/60" : "border-zinc-200 bg-zinc-50"}`}>
          <input value={newTemplate} onChange={e => setNewTemplate(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newTemplate.trim()) { setTemplates(prev => [...prev, newTemplate.trim()]); setNewTemplate(""); } }}
            placeholder="أضف قالباً مفضلاً..."
            className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-zinc-400"}`}
          />
          <button onClick={() => { if (newTemplate.trim()) { setTemplates(prev => [...prev, newTemplate.trim()]); setNewTemplate(""); } }}
            className={`text-[#C8A762] hover:text-[#b8974f]`}>
            <PlusCircle size={17} />
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
          onClick={save}
          className={`flex items-center gap-2 rounded-xl px-7 py-3 text-[14px] font-bold shadow-md transition-all ${saved
            ? "bg-emerald-600 text-white"
            : "bg-[#0B3D2E] text-white hover:bg-[#0d4c38]"
          }`}
        >
          {saved ? <CheckCircle size={16} weight="fill" /> : <Sparkle size={16} weight="fill" className="text-[#C8A762]" />}
          {saved ? "تم الحفظ!" : "حفظ التعليمات"}
        </motion.button>
      </div>
    </div>
  );
}
