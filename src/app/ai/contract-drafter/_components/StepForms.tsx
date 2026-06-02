"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { CaretDown, Brain, UploadSimple, FileText, X } from "@phosphor-icons/react";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"paste" | "file">("paste");
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    setFileName(file.name);
    setInputMode("file");
    onTextChange(`[ملف مرفوع: ${file.name}]\n\nسيتم استخراج نص العقد تلقائياً بواسطة AI...`);
  }

  function clearFile() {
    setFileName(null);
    setInputMode("paste");
    onTextChange("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const tabCls = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-bold rounded-[14px] transition-all duration-300 ${
      active
        ? isDark ? "bg-white/[0.09] text-white shadow-sm" : "bg-white text-[#0B3D2E] shadow-sm"
        : isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]" : "text-slate-400 hover:text-slate-600 hover:bg-black/5"
    }`;

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
          {isRTL ? "ارفع ملف العقد أو الصق النص — AI سيحلّله فوراً" : "Upload the contract file or paste text — AI will analyze it instantly."}
        </p>
      </div>

      {/* Mode tabs */}
      <div className={`flex gap-1.5 p-1.5 rounded-[1.25rem] mb-6 shadow-inner ${isDark ? "bg-zinc-900" : "bg-slate-100"}`}>
        <button className={tabCls(inputMode === "file")} onClick={() => setInputMode("file")}>
          <UploadSimple size={18} weight="bold" /> {isRTL ? "رفع ملف" : "Upload File"}
        </button>
        <button className={tabCls(inputMode === "paste")} onClick={() => { setInputMode("paste"); clearFile(); }}>
          <FileText size={18} weight="bold" /> {isRTL ? "لصق النص" : "Paste Text"}
        </button>
      </div>

      {/* Upload drop zone */}
      {inputMode === "file" && !fileName && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-4 h-64 rounded-[2rem] border-2 border-dashed cursor-pointer transition-all duration-300 ${
            dragging
              ? isDark ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.15)]" : "border-[#0B3D2E]/50 bg-[#0B3D2E]/5"
              : isDark ? "border-white/10 hover:border-white/20 bg-zinc-900/50 hover:bg-zinc-800/80" : "border-zinc-200 hover:border-zinc-300 bg-white"
          }`}
        >
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-400"}`}>
            <UploadSimple size={32} weight="duotone" />
          </div>
          <p className={`text-[15px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
            {isRTL ? "اسحب الملف هنا أو انقر للرفع" : "Drag & drop or click to upload"}
          </p>
          <p className={`text-[12px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>PDF · Word · صورة (JPG/PNG)</p>
        </div>
      )}

      {/* File chosen */}
      {inputMode === "file" && fileName && (
        <div className={`flex items-center gap-4 p-5 rounded-[1.5rem] border shadow-sm ${isDark ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-500">
            <FileText size={24} weight="duotone" />
          </div>
          <p className={`flex-1 text-[14px] font-bold truncate ${isDark ? "text-emerald-400" : "text-emerald-800"}`}>{fileName}</p>
          <button onClick={clearFile} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isDark ? "hover:bg-white/10" : "hover:bg-emerald-100"}`}>
            <X size={18} weight="bold" className={isDark ? "text-zinc-400 hover:text-white" : "text-emerald-600"} />
          </button>
        </div>
      )}

      {/* Paste textarea */}
      {inputMode === "paste" && (
        <textarea
          value={contractText}
          onChange={e => onTextChange(e.target.value)}
          placeholder={isRTL ? "ألصق النص هنا..." : "Paste text here..."}
          className={`w-full h-72 rounded-[2rem] p-6 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[#0B3D2E] transition-all shadow-inner ${
            isDark ? "bg-zinc-900 border border-white/10 text-white placeholder-zinc-600" : "bg-white border text-zinc-900 placeholder-zinc-400 border-zinc-200"
          }`}
        />
      )}

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
          {isRTL ? "بدء المراجعة بواسطة AI" : "Start AI Review"}
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
