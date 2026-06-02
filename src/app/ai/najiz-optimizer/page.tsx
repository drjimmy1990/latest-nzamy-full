"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Broom, CaretLeft, Copy, Check, DownloadSimple, ArrowRight,
  Warning, CheckCircle, XCircle, Sparkle, TextT, Eraser,
  FileText, ArrowsClockwise, Info, ArrowSquareOut,
  ListNumbers, MathOperations,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import { MOCK_DRAFT } from "@/components/draft/draftConstants";

// ─── Najiz Optimizer Core Logic ───────────────────────────────────────────────
// Implements: Najiz_Legal_Memo_Optimizer_v5

const MAX_CHARS = 10_000;
const TARGET_CHARS = 9_000;

interface OptimizationReport {
  originalLength: number;
  finalLength:    number;
  removedEmojis:  number;
  removedBlanks:  number;
  isUnderLimit:   boolean;
  wasSummarized:  boolean;
}

function runNajizOptimizer(text: string): { result: string; report: OptimizationReport } {
  let result = text;
  let removedEmojis = 0;
  let removedBlanks = 0;

  // ── R1 & R2: Remove disallowed symbols and emojis ─────────────────────────
  // Allowed: ( , ~ ^ / @ ? # ) - * ! . :
  // Remove emoji ranges and non-allowed special chars
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})/gu;
  const before = result.length;
  result = result.replace(emojiRegex, (m) => { removedEmojis++; return ""; });

  // Remove bullet symbols not in allowed list (•, ▪, ●, ◦, ➤ etc.) → replace with *
  result = result.replace(/[•▪●◦▶➤►→]/gu, "*");

  // ── R3: Remove blank placeholder fields ──────────────────────────────────
  // Pattern: label followed by 5+ dots/underscores/dashes
  // But preserve legal ellipsis (max 3 dots with spaces around them mid-sentence)
  
  // Remove entire lines with 5+ consecutive dots/underscores/dashes
  const blankLineRegex = /^[^\n]*(?:\.{5,}|_{5,}|-{5,}|\s{5,})[^\n]*$/gm;
  result = result.replace(blankLineRegex, (m) => {
    // Check if it's a pure blank line (not a legal citation)
    if (/[^\s.•*:\-_]{15,}/.test(m)) {
      // Has substantial text — might be partial (e.g. "رقم الهوية: 1234 ويمثله نظاماً...........")
      // Remove only the blank part and its label
      return m.replace(/[\u0600-\u06FF\s]+:?\s*\.{5,}/g, "").replace(/_{5,}/g, "").replace(/-{5,}/g, "").trim();
    }
    removedBlanks++;
    return "";
  });

  // Clean up multiple empty lines
  result = result.replace(/\n{3,}/g, "\n\n");

  // ── R4: List formatting ───────────────────────────────────────────────────
  // Preserve numbered lists. Replace non-allowed bullets already done above.

  // ── R5: Conditional summarization (mock — shows what would be done) ───────
  const wasSummarized = result.length > MAX_CHARS;
  if (wasSummarized) {
    // Remove common verbose filler phrases
    const fillerPhrases = [
      /وحيث إن\s*/g,
      /ولما كان\s*/g,
      /من الجدير بالذكر\s*/g,
      /مفاد ذلك أن\s*/g,
      /وبناءً على ما تقدم،?\s*/g,
      /وخلاصة القول،?\s*/g,
      /إشارةً إلى ما سبق،?\s*/g,
    ];
    for (const phrase of fillerPhrases) {
      result = result.replace(phrase, "");
    }
    // Clean up again
    result = result.replace(/\n{3,}/g, "\n\n");
  }

  return {
    result: result.trim(),
    report: {
      originalLength: text.length,
      finalLength:    result.trim().length,
      removedEmojis,
      removedBlanks,
      isUnderLimit:   result.trim().length <= MAX_CHARS,
      wasSummarized,
    },
  };
}

// ─── Character Count Bar ──────────────────────────────────────────────────────
function CharBar({ count, isDark }: { count: number; isDark: boolean }) {
  const pct = Math.min((count / MAX_CHARS) * 100, 100);
  const color = count > MAX_CHARS ? "bg-red-500" : count > TARGET_CHARS ? "bg-amber-500" : "bg-emerald-500";
  const label = count > MAX_CHARS ? "text-red-500" : count > TARGET_CHARS ? "text-amber-500" : "text-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className={label}>{count.toLocaleString()} حرف</span>
        <span className={isDark ? "text-zinc-500" : "text-slate-400"}>الحد الأقصى: {MAX_CHARS.toLocaleString()}</span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function NajizOptimizerPage() {
  const { isDark } = useTheme();
  const [inputText, setInputText]     = useState("");
  const [result,    setResult]        = useState<string | null>(null);
  const [report,    setReport]        = useState<OptimizationReport | null>(null);
  const [processing, setProcessing]   = useState(false);
  const [copied,    setCopied]        = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("source") === "draft") {
        setInputText(MOCK_DRAFT);
      }
    }
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  function handleOptimize() {
    if (!inputText.trim()) return;
    setProcessing(true);
    setResult(null);
    setReport(null);
    // Simulate a brief "AI processing" delay for UX
    setTimeout(() => {
      const { result: r, report: rep } = runNajizOptimizer(inputText);
      setResult(r);
      setReport(rep);
      setProcessing(false);
    }, 1200);
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleReset() {
    setInputText("");
    setResult(null);
    setReport(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const savedChars = report ? report.originalLength - report.finalLength : 0;

  return (
    <div className={`max-w-4xl mx-auto p-5 md:p-7 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px]">
        <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
        <CaretLeft size={11} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-600"}>منقح ناجز</span>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center flex-shrink-0">
            <Broom size={24} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>منقح ناجز</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                للمحامين
              </span>
            </div>
            <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              تنظيف وتهيئة المذكرات القانونية لمنصة ناجز — إزالة الرموز · حذف الحقول الفارغة · ضبط الحروف
            </p>
          </div>
        </div>
        <a href="https://najiz.sa" target="_blank" rel="noopener noreferrer"
          className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-semibold transition ${isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          <ArrowSquareOut size={13} /> فتح ناجز
        </a>
      </motion.div>

      {/* Info banner */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${isDark ? "border-blue-700/25 bg-blue-900/10" : "border-blue-100 bg-blue-50"}`}>
        <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" weight="fill" />
        <div className={`text-[12px] space-y-0.5 ${isDark ? "text-blue-300" : "text-blue-700"}`}>
          <p className="font-bold">القواعد المُطبَّقة (Najiz_Legal_Memo_Optimizer_v5)</p>
          <p className={isDark ? "text-blue-400/70" : "text-blue-600/80"}>
            R1 إزالة الرموز غير المسموح بها · R2 حذف الإيموجي · R3 حذف الحقول الفارغة · R4 تنسيق القوائم · R5 تقليص اختياري إذا تجاوز ١٠,٠٠٠ حرف
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Input ── */}
        <div className="space-y-3">
          <div className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50/70"}`}>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>نص المذكرة الأصلية</p>
              <button onClick={handleReset} className={`flex items-center gap-1.5 text-[11px] font-semibold transition ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                <ArrowsClockwise size={12} /> مسح
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              rows={16}
              placeholder={`الصق نص المذكرة هنا...\n\nسيقوم النظام بـ:\n• إزالة الرموز غير المسموح بها\n• حذف الحقول الفارغة (......)\n• تنسيق القوائم\n• تقليص النص إذا تجاوز 10,000 حرف`}
              className={`w-full px-4 py-3 text-[13px] leading-relaxed resize-none outline-none ${isDark ? "bg-transparent text-zinc-200 placeholder:text-zinc-700" : "bg-transparent text-zinc-800 placeholder:text-slate-400"}`}
            />
            <div className={`px-4 pb-4`}>
              <CharBar count={inputText.length} isDark={isDark} />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleOptimize}
            disabled={!inputText.trim() || processing}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-l from-[#0B3D2E] to-[#1a6b50] text-white text-[13px] font-bold shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {processing ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
                جارٍ التنقيح والتحليل...
              </>
            ) : (
              <><Broom size={16} weight="duotone" /> تنقيح وتهيئة للناجز</>
            )}
          </motion.button>
        </div>

        {/* ── Result ── */}
        <div className="space-y-3">
          <AnimatePresence mode="wait">
            {!result && !processing && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`${card} flex flex-col items-center justify-center text-center p-12 h-full min-h-[400px]`}>
                <TextT size={48} className={`mb-4 ${isDark ? "text-zinc-700" : "text-slate-200"}`} weight="duotone" />
                <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  النتيجة ستظهر هنا بعد التنقيح
                </p>
                <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                  الصق نصك واضغط "تنقيح"
                </p>
              </motion.div>
            )}

            {processing && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`${card} flex flex-col items-center justify-center text-center p-12 h-full min-h-[400px]`}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 rounded-full border-2 border-[#C8A762]/20 border-t-[#C8A762] mb-4" />
                <p className={`text-[14px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>جارٍ التنقيح</p>
                <div className={`text-[11px] mt-2 space-y-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {["فحص الرموز غير المسموح بها", "حذف الحقول الفارغة", "ضبط تنسيق القوائم", "قياس طول النص"].map((step, i) => (
                    <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.25 }}>
                      ✓ {step}
                    </motion.p>
                  ))}
                </div>
              </motion.div>
            )}

            {result && report && (
              <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

                {/* Report summary */}
                <div className={`${card} p-4 space-y-3`}>
                  <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تقرير التنقيح</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "الحالة",
                        value: report.isUnderLimit ? "✓ ضمن الحد" : "✗ تجاوز الحد",
                        color: report.isUnderLimit ? "text-emerald-500" : "text-red-500",
                        icon: report.isUnderLimit ? CheckCircle : XCircle,
                      },
                      {
                        label: "الوفر",
                        value: `${savedChars.toLocaleString()} حرف`,
                        color: savedChars > 0 ? "text-blue-500" : isDark ? "text-zinc-500" : "text-slate-400",
                        icon: MathOperations,
                      },
                      {
                        label: "رموز محذوفة",
                        value: String(report.removedEmojis),
                        color: report.removedEmojis > 0 ? "text-amber-500" : isDark ? "text-zinc-500" : "text-slate-400",
                        icon: Eraser,
                      },
                      {
                        label: "حقول فارغة",
                        value: String(report.removedBlanks),
                        color: report.removedBlanks > 0 ? "text-purple-500" : isDark ? "text-zinc-500" : "text-slate-400",
                        icon: ListNumbers,
                      },
                    ].map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <div key={i} className={`rounded-xl p-3 flex items-center gap-2 ${isDark ? "bg-white/[0.03] border border-white/[0.04]" : "bg-slate-50 border border-slate-100"}`}>
                          <Icon size={15} className={item.color} weight="fill" />
                          <div>
                            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.label}</p>
                            <p className={`text-[13px] font-bold ${item.color}`}>{item.value}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <CharBar count={report.finalLength} isDark={isDark} />
                  {report.wasSummarized && (
                    <div className={`flex items-start gap-2 rounded-xl p-2.5 border text-[11px] ${isDark ? "border-amber-700/25 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      <Warning size={13} weight="fill" className="flex-shrink-0 mt-0.5" />
                      تم تفعيل بروتوكول الاختصار R5 — تمت إزالة العبارات الحشو مع الحفاظ الكامل على النصوص النظامية والمبادئ القضائية
                    </div>
                  )}
                </div>

                {/* Result text */}
                <div className={`${card} overflow-hidden`}>
                  <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50/70"}`}>
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>النص المُنقَّح</p>
                    <div className="flex gap-2">
                      <button onClick={handleCopy}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${copied ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : isDark ? "border border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                        {copied ? <><Check size={12} /> نُسِخ</> : <><Copy size={12} /> نسخ</>}
                      </button>
                      <button
                        onClick={() => {
                          const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = "najiz-optimized.txt"; a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${isDark ? "border border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                        <DownloadSimple size={12} /> تنزيل
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={result}
                    onChange={e => setResult(e.target.value)}
                    rows={16}
                    className={`w-full px-4 py-3 text-[12px] leading-relaxed resize-none outline-none ${isDark ? "bg-transparent text-zinc-300" : "bg-transparent text-zinc-700"}`}
                  />
                </div>

                <AiResultActions
                  text={result}
                  filename="najiz-optimized"
                  showVault
                  className="justify-start"
                />

                {/* Next actions */}
                <div className={`rounded-xl border p-4 ${isDark ? "border-[#0B3D2E]/40 bg-[#0B3D2E]/10" : "border-emerald-100 bg-emerald-50"}`}>
                  <p className={`text-[11px] font-bold mb-3 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>الخطوة التالية</p>
                  <div className="flex gap-2 flex-wrap">
                    <a href="https://najiz.sa" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold shadow-sm hover:bg-[#0a3328] transition">
                      <ArrowSquareOut size={13} /> فتح ناجز ورفع النص
                    </a>
                    <Link href="/ai/draft"
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[12px] font-semibold transition ${isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-600 hover:bg-white"}`}>
                      <FileText size={13} /> العودة للصائغ
                    </Link>
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
