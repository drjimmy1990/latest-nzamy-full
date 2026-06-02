"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
import {
  FileMagnifyingGlass, CloudArrowUp, Warning, Eye,
  BookOpen, Robot, ArrowSquareOut, X, Download,
  SealWarning, CheckCircle, Lightbulb,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Mock findings ────────────────────────────────────────────────────────────

const BRIEF_ISSUES = [
  {
    type: "error",
    title: "مادة ملغاة مستشهد بها",
    detail: "المادة ٦٧ من نظام الإجراءات المدنية المُستشهد بها في الفقرة الثالثة تم إلغاؤها واستبدالها بالمادة ٥٩ المُعدَّلة عام ١٤٤٢هـ.",
    page: "ص ٤ — الفقرة الثالثة",
    fix: "استبدل الاستشهاد بالمادة ٥٩ من نظام الإجراءات المدنية المُعدَّل ١٤٤٢هـ.",
  },
  {
    type: "error",
    title: "سابقة قضائية غير موجودة",
    detail: "رقم القضية ٢٢٤٤/م/٢٠١٩ المُستشهد بها غير موجود في سجلات المحكمة العليا.",
    page: "ص ٦ — هامش ٣",
    fix: "راجع رقم القضية — قد يكون ١٢٢٤ أو ٢٢٤٤ في محكمة مختلفة.",
  },
  {
    type: "warning",
    title: "ثغرة في سلسلة الحجج",
    detail: "الانتقال من الدفع الأول إلى الدفع الثالث مباشرةً دون رابط منطقي يُضعف الحجة.",
    page: "ص ٧ — الدفع الثالث",
    fix: "أضف فقرة رابطة تؤسّس على الدفع الثاني قبل الانتقال للثالث.",
  },
  {
    type: "warning",
    title: "سابقة قوية غائبة",
    detail: "هناك حكم استئناف ١٤٤٤/٣ من منطقة الرياض يدعم حجتك الرئيسية ولم يُستشهد به.",
    page: "عام",
    fix: "أضف الاستشهاد بالحكم ١٤٤٤/٣ تحت 'السوابق القضائية'.",
  },
  {
    type: "ok",
    title: "الهيكل العام سليم",
    detail: "هيكل المذكرة (مقدمة، وقائع، دفوع، طلبات) متوافق مع متطلبات المحكمة.",
    page: "عام",
    fix: "",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIBriefCheckPage() {
  const { isDark } = useTheme();
  const [file, setFile] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<typeof BRIEF_ISSUES | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(name: string) {
    setFile(name);
    setChecking(true);
    setResults(null);
    await new Promise(r => setTimeout(r, 2800));
    setResults(BRIEF_ISSUES);
    setChecking(false);
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  const errorCount = results?.filter(r => r.type === "error").length ?? 0;
  const warnCount = results?.filter(r => r.type === "warning").length ?? 0;

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مراجع الدوائر الحكومية</h1>
            <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">MAX فقط</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            ارفع مذكرتك أو وثيقتك — AI يكشف: مواد ملغاة · سوابق ناقصة · ثغرات منطقية · متطلبات دوائر حكومية
          </p>
          <div className={`mt-2 flex flex-wrap gap-1.5`}>
            {[
              "مراجعة العقود الحكومية",
              "فحص اللوائح والأنظمة",
              "متابعة قرارات الترخيص",
              "مراجعة وثائق المناقصات",
              "التحقق من الإشعارات الحكومية",
              "فحص الاعتراضات الإدارية",
            ].map(ex => (
              <span key={ex} className={`rounded-full px-2 py-0.5 text-[10px] border ${isDark ? "border-white/[0.07] bg-white/[0.03] text-zinc-500" : "border-zinc-200 bg-zinc-50 text-zinc-400"}`}>
                {ex}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Upload */}
      {!file && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f.name); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-3xl border-2 border-dashed p-12 text-center transition-all ${dragging
            ? isDark ? "border-purple-500/60 bg-purple-900/10" : "border-purple-400 bg-purple-50"
            : isDark ? "border-white/[0.08] hover:border-purple-500/30" : "border-zinc-200 hover:border-purple-300"
          }`}
        >
          <input ref={inputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f.name); }} />
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${dragging ? "bg-purple-500/20" : isDark ? "bg-white/[0.05]" : "bg-zinc-100"}`}>
            <FileMagnifyingGlass size={32} className={dragging ? "text-purple-500" : isDark ? "text-zinc-500" : "text-zinc-400"} />
          </div>
          <h3 className={`font-bold text-[16px] mb-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>ارفع المذكرة للفحص</h3>
          <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>PDF · Word — حد أقصى ٢٠ م.ب</p>
          <p className={`text-[11px] mt-2 ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>متاح ضمن الباقة</p>
        </div>
      )}

      {/* File + status */}
      {file && (
        <div className={`${card} flex items-center gap-3 px-5 py-4 shadow-sm`}>
          <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <FileMagnifyingGlass size={18} weight="duotone" className="text-purple-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-bold truncate ${isDark ? "text-white" : "text-zinc-900"}`}>{file}</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              {checking ? "جارٍ الفحص..." : `${results?.length ?? 0} نتيجة`}
            </p>
          </div>
          <button onClick={() => { setFile(null); setResults(null); }}
            className={`flex h-8 w-8 items-center justify-center rounded-xl ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Processing */}
      <AnimatePresence>
        {checking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${card} p-6 flex items-center gap-3 shadow-sm`}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              <Robot size={22} weight="duotone" className="text-purple-500" />
            </motion.div>
            <div>
              <p className={`font-semibold text-[14px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>AI يفحص المذكرة...</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>فحص المواد · التحقق من السوابق · تحليل منطق الحجج</p>
            </div>
            <div className={`ms-auto h-1.5 w-32 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
              <motion.div animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="h-full w-1/2 bg-gradient-to-r from-transparent via-purple-500/60 to-transparent" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {results && (
        <BetaReviewGate toolId="brief-check.result" toolName="فحص المذكرة والسوابق" reviewScope="legal-data">
        <div className="space-y-4">
          {/* Summary */}
          <div className={`${card} p-4 shadow-sm`}>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Warning size={15} weight="fill" className="text-red-500" />
                <span className={`font-mono text-xl font-bold text-red-500`}>{errorCount}</span>
                <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>أخطاء حرجة</span>
              </div>
              <div className="flex items-center gap-2">
                <SealWarning size={15} weight="fill" className="text-amber-500" />
                <span className={`font-mono text-xl font-bold text-amber-500`}>{warnCount}</span>
                <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>تحذيرات</span>
              </div>
              <div className="flex items-center gap-2 ms-auto">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
                  <Download size={13} /> تقرير PDF
                </motion.button>
              </div>
            </div>
          </div>

          {/* Findings list */}
          <div className="space-y-3">
            {results.map((r, i) => {
              const isError = r.type === "error";
              const isOk = r.type === "ok";
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  className={`${card} p-5 shadow-sm`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl ${
                      isError ? "bg-red-500/10" :
                      isOk ? "bg-emerald-500/10" :
                      "bg-amber-500/10"
                    }`}>
                      {isError ? <Warning size={16} weight="fill" className="text-red-500" /> :
                       isOk ? <CheckCircle size={16} weight="fill" className="text-emerald-500" /> :
                       <Eye size={16} className="text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className={`font-bold text-[13px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{r.title}</p>
                        <span className={`text-[10px] font-mono rounded-full px-2 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>{r.page}</span>
                      </div>
                      <p className={`text-[12px] leading-relaxed mb-2 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{r.detail}</p>
                      {r.fix && (
                        <div className={`rounded-xl px-3 py-2 border ${isDark ? "border-[#0B3D2E]/40 bg-[#0B3D2E]/15" : "border-emerald-200 bg-emerald-50"}`}>
                          <div className="flex items-start gap-1.5">
                            <Lightbulb size={11} className="flex-shrink-0 mt-0.5 text-emerald-500" />
                            <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{r.fix}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Unified Result Actions */}
          <AiResultActions
            text={results.map(r => `[${r.type}] ${r.title} — ${r.detail}${r.fix ? `\nالإصلاح: ${r.fix}` : ""}`).join("\n\n")}
            filename="brief-check-report"
            showVault
            showHumanReview
            className="justify-start"
          />
        </div>
        </BetaReviewGate>
      )}
    </div>
  );
}
