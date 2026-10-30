"use client";

import { motion } from "framer-motion";
import { CaretDown, Brain } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { ContractType } from "./contractTypes";

interface Props {
  contractText: string;
  onTextChange: (t: string) => void;
  onBack: () => void;
  onStartReview: () => void;
  ArrowBack: React.ElementType;
}

export function StepReviewInput({ contractText, onTextChange, onBack, onStartReview, ArrowBack }: Props) {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";
  // No upload here: nothing on this page reads a file, and the old one only
  // wrote «سيتم استخراج النص» into the box. A file goes with the team's
  // review order (the «مراجعة العقد» tab on the next step).

  return (
    <motion.div
      key="step1-review"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto"
    >
      <button
        onClick={onBack}
        className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all mb-8 me-auto ${
          isDark ? "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"
        }`}
      >
        <ArrowBack size={16} weight="bold" />
        {isRTL ? "رجوع" : "Back"}
      </button>

      <div className="text-center mb-8">
        <h2 className={`text-2xl font-black mb-3 tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
          {isRTL ? "أضف نص العقد للمراجعة" : "Add Contract for Review"}
        </h2>
        <p className={`text-[15px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          {isRTL ? "الصق نص العقد — المراجعة تتم عبر الفريق، ويمكنك إرفاق ملف العقد بطلب المراجعة" : "Paste the contract text — review is handled by our team; attach the file to the review order."}
        </p>
      </div>

      {/* Paste textarea */}
      <textarea
        value={contractText}
        onChange={e => onTextChange(e.target.value)}
        placeholder={isRTL ? "ألصق النص هنا..." : "Paste text here..."}
        className={`w-full h-72 rounded-[2rem] p-6 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[#0B3D2E] transition-all shadow-inner ${
          isDark ? "bg-zinc-900 border border-white/10 text-white placeholder-zinc-600" : "bg-white border text-zinc-900 placeholder-zinc-400 border-zinc-200"
        }`}
      />

      <div className="mt-8 flex justify-end">
        <motion.button
          onClick={onStartReview}
          disabled={!contractText.trim()}
          whileHover={contractText.trim() ? { scale: 1.02, y: -2 } : {}}
          whileTap={contractText.trim() ? { scale: 0.97 } : {}}
          className={`flex items-center gap-3 px-8 py-3.5 rounded-[1rem] font-bold text-[15px] transition-all duration-300 ${
            contractText.trim()
              ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[0_4px_14px_0_rgba(11,61,46,0.39)] hover:shadow-[0_6px_20px_rgba(11,61,46,0.23)]"
              : isDark ? "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/5" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
          }`}
        >
          <Brain size={20} weight="fill" />
          {isRTL ? "متابعة" : "Continue"}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Step 2: Form Fields ──────────────────────────────────────────────────────

interface FormProps {
  selectedType: ContractType;
  formData: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  ArrowBack: React.ElementType;
  Arrow: React.ElementType;
}

export function StepDetailsForm({ selectedType, formData, onChange, onBack, onNext, ArrowBack, Arrow }: FormProps) {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";
  const canProceed = selectedType.fields.every(f => !f.required || !!formData[f.id]?.trim());

  return (
    <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="max-w-2xl mx-auto">
      <div className={`rounded-[2rem] border p-8 sm:p-10 ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-xl" : "border-zinc-200 bg-white shadow-lg"}`}>
        <div className="flex items-center gap-4 mb-8">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <selectedType.icon size={28} weight="duotone" />
          </div>
          <div>
            <h2 className={`text-xl font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>{isRTL ? selectedType.labelAr : selectedType.labelEn}</h2>
            <p className={`text-[13px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{isRTL ? "أدخل التفاصيل الضرورية للعقد" : "Fill in the required contract details"}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {selectedType.fields.map(field => (
            <div key={field.id} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
              <label className={`block text-[13px] font-bold mb-2 ms-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                {isRTL ? field.labelAr : field.labelEn}
                {field.required && <span className="text-red-500 ms-1">*</span>}
              </label>
              {field.type === "select" ? (
                <div className="relative">
                  <select value={formData[field.id] || ""} onChange={e => onChange(field.id, e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 text-[14px] font-medium appearance-none outline-none focus:ring-2 focus:ring-[#0B3D2E] transition-all shadow-sm ${isDark ? "border-white/10 bg-zinc-800 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-900"}`}>
                    <option value="">{isRTL ? "اختر..." : "Choose..."}</option>
                    {field.options?.map(o => <option key={o.en} value={isRTL ? o.ar : o.en}>{isRTL ? o.ar : o.en}</option>)}
                  </select>
                  <CaretDown size={16} weight="bold" className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "left-4" : "right-4"} pointer-events-none ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
                </div>
              ) : field.type === "textarea" ? (
                <textarea rows={4} value={formData[field.id] || ""} onChange={e => onChange(field.id, e.target.value)} placeholder={field.placeholder}
                  className={`w-full rounded-2xl border px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#0B3D2E] resize-none transition-all shadow-sm ${isDark ? "border-white/10 bg-zinc-800 text-white placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"}`} />
              ) : (
                <input type={field.type} value={formData[field.id] || ""} onChange={e => onChange(field.id, e.target.value)} placeholder={field.placeholder}
                  className={`w-full rounded-2xl border px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#0B3D2E] transition-all shadow-sm ${isDark ? "border-white/10 bg-zinc-800 text-white placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"}`} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 flex items-center justify-between">
        <button onClick={onBack} className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all ${isDark ? "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"}`}>
          <ArrowBack size={16} weight="bold" /> {isRTL ? "رجوع" : "Back"}
        </button>
        <motion.button onClick={() => canProceed && onNext()} disabled={!canProceed} 
          whileHover={canProceed ? { scale: 1.02, y: -2 } : {}}
          whileTap={canProceed ? { scale: 0.97 } : {}}
          className={`flex items-center gap-3 px-8 py-3.5 rounded-[1rem] font-bold text-[15px] transition-all duration-300 ${canProceed ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[0_4px_14px_0_rgba(11,61,46,0.39)] hover:shadow-[0_6px_20px_rgba(11,61,46,0.23)]" : isDark ? "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/5" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
          {isRTL ? "التالي — مراجعة المسودة" : "Next — Review Draft"} <Arrow size={18} weight="bold" />
        </motion.button>
      </div>
    </motion.div>
  );
}
