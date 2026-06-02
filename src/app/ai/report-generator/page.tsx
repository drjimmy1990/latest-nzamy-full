"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileArrowUp, Upload, CheckCircle, CaretLeft,
  FileText, ChartBar, Clock, Sparkle, Download,
  Robot, ArrowCounterClockwise, Gavel,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";

// ─── Mock report types ─────────────────────────────────────────────────────────

type ReportType = "case_summary" | "client_summary" | "monthly" | "hearing_prep" | "financial";

const REPORT_TYPES: { id: ReportType; label: string; desc: string; time: string; icon: typeof FileText }[] = [
  {
    id: "case_summary",
    label: "ملخص القضية",
    desc: "ملخص شامل للقضية: وقائع، مطالب، مرحلة، وآخر إجراء",
    time: "٣٠ ثانية",
    icon: Gavel,
  },
  {
    id: "client_summary",
    label: "تقرير العميل",
    desc: "تقرير مُنقَّح للعميل يوضح حالة قضيته باللغة البسيطة",
    time: "٤٥ ثانية",
    icon: Robot,
  },
  {
    id: "monthly",
    label: "التقرير الشهري",
    desc: "ملخص أداء شهري: قضايا نشطة، جلسات، إيرادات، مهام معلقة",
    time: "٦٠ ثانية",
    icon: ChartBar,
  },
  {
    id: "hearing_prep",
    label: "تحضير الجلسة",
    desc: "ورقة الجلسة: ملخص الوقائع، الأدلة، الدفوع، والخطوات المقترحة",
    time: "٤٠ ثانية",
    icon: FileText,
  },
  {
    id: "financial",
    label: "تقرير الأتعاب المالي",
    desc: "تقرير مفصّل: الفواتير المسددة، المتأخرة، والمتوقعة لكل عميل",
    time: "٣٠ ثانية",
    icon: FileArrowUp,
  },
];

// ─── Mock generated report ─────────────────────────────────────────────────────

const MOCK_REPORT = `# ملخص القضية — نزاع تجاري شركة الأفق

**رقم القضية:** ١٤٤٥/٣٢١٧
**المحكمة:** المحكمة التجارية بالرياض
**المرحلة:** مرحلة الاستئناف

---

## الأطراف

| الطرف | الاسم | الدور |
|-------|-------|-------|
| المدعي | شركة الأفق للتجارة | طالبة التعويض |
| المدعى عليه | شركة النجم للمقاولات | المتعاقد المخل |

---

## ملخص الوقائع

أبرمت شركة الأفق عقداً مع شركة النجم بتاريخ ١٤٤٤/٣/١٠ لتوريد مواد بناء بقيمة **٢.٤ مليون ريال**. أخلّت شركة النجم بالتسليم في الموعد المحدد، مما تسبب في خسائر مباشرة للمدعية.

## الطلبات

- التعويض عن الأضرار المباشرة: ٢.٤ م.ر
- التعويض عن الأضرار غير المباشرة: ٥٠٠ ألف ريال
- الفوائد القانونية

## آخر إجراء

جلسة استماع بتاريخ ١٤٤٦/١/١٥ — تقدمت المحكمة بطلب خبرة لتقييم الأضرار.

## الخطوة القادمة

تقديم مذكرة ردّ على تقرير الخبير — الموعد النهائي: ١٤٤٦/٢/٥`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportGeneratorPage() {
  const { isDark } = useTheme();
  const [step, setStep] = useState<"select" | "config" | "generating" | "done">("select");
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [caseRef, setCaseRef] = useState("");
  const [format, setFormat] = useState<"word" | "pdf" | "md">("word");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const handleGenerate = () => {
    setStep("generating");
    setTimeout(() => setStep("done"), 2800);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href="/ai" className={`${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"} transition-colors`}>
            نظامي AI
          </Link>
          <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
          <span className={isDark ? "text-zinc-300" : "text-slate-600"}>مولّد التقارير</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-royal/10 flex items-center justify-center">
              <FileArrowUp size={24} weight="duotone" className="text-royal" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
                مولّد التقارير الذكي
              </h1>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                تقارير احترافية في ثوانٍ — مذكرات، ملخصات، وتقارير الأداء
              </p>
            </div>
          </div>
          {step !== "select" && (
            <button onClick={() => { setStep("select"); setSelectedType(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}>
              <ArrowCounterClockwise size={13} />
              من البداية
            </button>
          )}
        </div>
      </motion.div>

      {/* Step 1: Select type */}
      <AnimatePresence mode="wait">
        {step === "select" && (
          <motion.div key="select" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REPORT_TYPES.map((rt, i) => {
              const Icon = rt.icon;
              return (
                <motion.button
                  key={rt.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => { setSelectedType(rt.id); setStep("config"); }}
                  className={`${card} p-5 text-right flex items-start gap-3 hover:border-royal/30 hover:scale-[1.02] transition-all cursor-pointer`}
                >
                  <div className="w-10 h-10 rounded-xl bg-royal/8 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} weight="duotone" className="text-royal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{rt.label}</p>
                    <p className={`text-[12px] leading-snug ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{rt.desc}</p>
                    <div className={`flex items-center gap-1 mt-2 text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      <Clock size={11} />
                      جاهز في {rt.time}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* Step 2: Configure */}
        {step === "config" && (
          <motion.div key="config" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`${card} p-6 space-y-5`}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkle size={15} className="text-[#C8A762]" weight="fill" />
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                {REPORT_TYPES.find(r => r.id === selectedType)?.label}
              </p>
            </div>

            <div>
              <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                رقم القضية أو مرجع العميل (اختياري)
              </label>
              <input
                value={caseRef}
                onChange={e => setCaseRef(e.target.value)}
                placeholder="مثال: ١٤٤٥/٣٢١٧ أو اسم الموكّل"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-royal/40" : "border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:border-royal/30"}`}
              />
            </div>

            <div>
              <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                صيغة التقرير
              </label>
              <div className="flex gap-2">
                {(["word", "pdf", "md"] as const).map(f => (
                  <button key={f}
                    onClick={() => setFormat(f)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${format === f
                      ? "bg-royal/10 border-royal/30 text-royal"
                      : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:text-royal"
                    }`}
                  >
                    {f === "word" ? "Word" : f === "pdf" ? "PDF" : "Markdown"}
                  </button>
                ))}
              </div>
            </div>

            <motion.button
              onClick={handleGenerate}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#0a3328] transition-colors shadow-[0_4px_16px_-4px_rgba(11,61,46,0.3)]"
            >
              <Sparkle size={16} weight="fill" />
              توليد التقرير
            </motion.button>
          </motion.div>
        )}

        {/* Step 3: Generating */}
        {step === "generating" && (
          <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${card} p-10 flex flex-col items-center`}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-14 h-14 rounded-2xl bg-royal/10 flex items-center justify-center mb-5"
            >
              <Robot size={28} weight="duotone" className="text-royal" />
            </motion.div>
            <p className={`text-[15px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>يُولّد التقرير...</p>
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>يحلل البيانات ويُنسّق المحتوى</p>
          </motion.div>
        )}

        {/* Step 4: Done */}
        {step === "done" && (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className={`${card} p-4 flex items-center gap-3`}>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle size={20} weight="fill" className="text-emerald-500" />
              </div>
              <div className="flex-1">
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>اكتمل التوليد!</p>
                <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {REPORT_TYPES.find(r => r.id === selectedType)?.label} — جاهز للتنزيل
                </p>
              </div>
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-semibold hover:bg-[#0a3328] transition-colors">
                <Download size={14} />
                تنزيل
              </button>
            </div>

            {/* Preview */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>معاينة التقرير</p>
              <div className={`rounded-xl font-mono text-[11px] leading-relaxed whitespace-pre-wrap p-4 border overflow-auto max-h-80 ${isDark ? "border-white/[0.06] bg-zinc-800/40 text-zinc-400" : "border-slate-100 bg-slate-50 text-slate-600"}`}>
                {MOCK_REPORT}
              </div>
            </div>
            {/* Unified Result Actions */}
            <AiResultActions
              text={MOCK_REPORT}
              filename={`report-${selectedType ?? "generated"}`}
              showVault
              showHumanReview
              className="justify-start"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
