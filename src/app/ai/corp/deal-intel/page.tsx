"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, ChartLine, ShieldWarning, Buildings, Handshake,
  CheckCircle, CaretLeft, ArrowRight, DownloadSimple, Copy, Check,
  Sparkle, Globe, Lightbulb, ListChecks, Warning, Scales,
  ShareNetwork, Spinner, FileText, MagnifyingGlass, Robot,
  TrendUp, Newspaper, Bank,
} from "@phosphor-icons/react";
import Link from "next/link";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useTheme } from "@/components/ThemeProvider";
import {
  Stage, Risk, Verdict,
  DEAL_TYPES, SECTORS, PARTY_TYPES, DIMENSIONS, RISK_STYLE, VERDICT_STYLE,
  MOCK_REPORT, AccordionCard, exportReportToPDF,
} from "./_lib";

// ─── Main Page ─────────────────────────────────────────────────────────────────

function formatDealIntelReport(dealType: string | null, sector: string | null, partyName: string, dimensions: string[]) {
  return [
    "Deal Intelligence Report",
    `Deal type: ${dealType ?? "-"}`,
    `Sector: ${sector ?? "-"}`,
    `Counterparty: ${partyName || "-"}`,
    `Dimensions: ${dimensions.join(", ")}`,
    "",
    `${MOCK_REPORT.legal.title}: ${MOCK_REPORT.legal.opinion}`,
    `${MOCK_REPORT.commercial.title}: ${MOCK_REPORT.commercial.note}`,
    `${MOCK_REPORT.risk.title}:`,
    ...MOCK_REPORT.risk.risks.map((risk) => `- [${risk.level}] ${risk.label}: ${risk.desc} | Fix: ${risk.fix}`),
    `${MOCK_REPORT.regulatory.title}:`,
    ...MOCK_REPORT.regulatory.requirements.map((req) => `- ${req.agency}: ${req.action} (${req.timeline})`),
    `${MOCK_REPORT.verdict.title}: ${MOCK_REPORT.verdict.summary}`,
    "Next steps:",
    ...MOCK_REPORT.verdict.nextSteps.map((step) => `- ${step}`),
  ].join("\n");
}

export default function DealIntelPage() {
  const { isDark } = useTheme();
  const [stage,       setStage]      = useState<Stage>("form");
  const [dealType,    setDealType]   = useState<string | null>(null);
  const [sector,      setSector]     = useState<string | null>(null);
  const [description, setDesc]       = useState("");
  const [partyType,   setPartyType]  = useState<string | null>(null);
  const [partyName,   setPartyName]  = useState("");
  const [dimensions,  setDimensions] = useState<string[]>(DIMENSIONS.map(d => d.id));
  const [progress,    setProgress]   = useState(0);
  const [copied,      setCopied]     = useState(false);
  const [pdfLoading,  setPdfLoading] = useState(false);
  const [shared,      setShared]     = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleExportPDF = useCallback(async () => {
    if (!reportRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      await exportReportToPDF(reportRef.current, `nzamy-deal-intel-${Date.now()}.pdf`, dealType ?? "صفقة", sector ?? "عام");
    } finally { setPdfLoading(false); }
  }, [pdfLoading, dealType, sector]);

  const handleShare = useCallback(async () => {
    const url  = window.location.href;
    const text = `تقرير محلل الصفقات والفرص — ${dealType ?? ""} | ${sector ?? ""}`;
    if (navigator.share) { try { await navigator.share({ title: "نظامي — محلل الصفقات", text, url }); } catch {} }
    else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500); }
  }, [dealType, sector]);

  const canProceedForm = !!dealType && !!sector && description.length >= 20;
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70" : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  const processingSteps = [
    { label: "تحليل نوع الصفقة والقطاع",                         done: progress >= 20 },
    { label: "فحص قاعدة التشريعات السعودية",                     done: progress >= 40 },
    { label: "تقييم الجدوى التجارية ومتطلبات الجهات الرقابية",  done: progress >= 60 },
    { label: "استخراج خارطة المخاطر",                            done: progress >= 80 },
    { label: "إعداد التوصية التنفيذية الشاملة",                  done: progress >= 100 },
  ];

  function startProcess() {
    setStage("processing"); setProgress(0);
    [20, 40, 60, 80, 100].forEach((p, i) => {
      setTimeout(() => { setProgress(p); if (i === 4) setTimeout(() => setStage("report"), 500); }, i * 700);
    });
  }

  function handleCopySummary() {
    navigator.clipboard.writeText(MOCK_REPORT.verdict.summary);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  // Helper for selection button classes
  const selectCls = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
      active
        ? isDark ? "bg-[#0B3D2E] border-[#C8A762]/30 text-[#C8A762]" : "bg-[#0B3D2E] border-[#0B3D2E] text-white"
        : isDark ? "border-white/[0.06] text-zinc-500 hover:border-white/10" : "border-slate-200 text-slate-500 hover:border-slate-300"
    }`;

  return (
    <div className={`max-w-3xl mx-auto p-5 md:p-7 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px]">
        <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
        <CaretLeft size={11} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-600"}>محلل الصفقات والفرص</span>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 flex items-center justify-center flex-shrink-0 shadow-lg">
          <Briefcase size={24} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>محلل الصفقات والفرص</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "border-amber-700/30 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>جديد</span>
          </div>
          <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            دراسة جدوى ٣٦٠° لأي صفقة أو شراكة · قانوني + تجاري + مخاطر + جهات رقابية
          </p>
        </div>
      </motion.div>

      {/* Info callout */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className={`flex items-start gap-3 p-3.5 rounded-xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/60"}`}>
        <Robot size={14} className="text-[#C8A762] flex-shrink-0 mt-0.5" weight="duotone" />
        <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          يعمل بأكثر من نموذج ذكاء اصطناعي مدعوماً بقاعدة التشريعات السعودية — النتيجة تقرير جاهز <span className="font-bold">لمجلس الإدارة</span>
        </p>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ── FORM STEP ── */}
        {stage === "form" && (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Deal type */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-100 text-amber-700"}`}>١</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>نوع الصفقة</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {DEAL_TYPES.map(t => <button key={t} onClick={() => setDealType(t === dealType ? null : t)} className={selectCls(dealType === t)}>{t}</button>)}
              </div>
            </div>

            {/* Sector */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-100 text-amber-700"}`}>٢</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>قطاع شركتك</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map(s => <button key={s} onClick={() => setSector(s === sector ? null : s)} className={selectCls(sector === s)}>{s}</button>)}
              </div>
            </div>

            {/* Description */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-100 text-amber-700"}`}>٣</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>وصف الصفقة</p>
              </div>
              <textarea value={description} onChange={e => setDesc(e.target.value)} rows={4}
                placeholder={`مثال: نريد التعاقد مع شركة تسويق رقمي لإطلاق${dealType ? ` ${dealType}` : " مشروع"} في السوق السعودي لمدة سنة بقيمة ٢٠٠ ألف ريال...`}
                className={`w-full px-3.5 py-3 rounded-xl border text-[13px] leading-relaxed resize-none outline-none transition ${isDark ? "border-white/[0.06] bg-zinc-800/80 text-zinc-200 placeholder-zinc-600 focus:border-[#C8A762]/30" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder-slate-400 focus:border-amber-300"}`} />
              <span className={`text-[10px] ${description.length < 20 ? "text-red-400" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {description.length < 20 ? `${20 - description.length} حرف إضافي على الأقل` : "✓ يمكن المتابعة"}
              </span>
            </div>

            {/* Counterparty (optional) */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-100 text-amber-700"}`}>٤</span>
                  <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الطرف الآخر</p>
                </div>
                <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>اختياري — يرفع دقة التحليل</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PARTY_TYPES.map(p => <button key={p} onClick={() => setPartyType(p === partyType ? null : p)} className={selectCls(partyType === p)}>{p}</button>)}
              </div>
              {partyType && (
                <input value={partyName} onChange={e => setPartyName(e.target.value)} placeholder="اسم أو وصف الطرف الآخر (اختياري)"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-[13px] outline-none transition ${isDark ? "border-white/[0.06] bg-zinc-800/80 text-zinc-200 placeholder-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder-slate-400"}`} />
              )}
            </div>

            <motion.button whileHover={canProceedForm ? { scale: 1.01 } : {}} whileTap={canProceedForm ? { scale: 0.99 } : {}}
              onClick={() => canProceedForm && setStage("dimensions")} disabled={!canProceedForm}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[13px] font-bold shadow transition-all ${
                canProceedForm ? "bg-gradient-to-l from-[#0B3D2E] to-emerald-700 text-white" : "bg-gradient-to-l from-[#0B3D2E]/40 to-emerald-700/40 text-white/40 cursor-not-allowed"
              }`}>
              <ListChecks size={16} />
              {!dealType ? "اختر نوع الصفقة" : !sector ? "اختر قطاعك" : description.length < 20 ? "أكمل الوصف (٢٠ حرف)" : "التالي — اختيار أبعاد التحليل"}
              <ArrowRight size={14} />
            </motion.button>
          </motion.div>
        )}

        {/* ── DIMENSIONS STEP ── */}
        {stage === "dimensions" && (
          <motion.div key="dims" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className={`${card} p-4 space-y-3`}>
              <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>اختر أبعاد التحليل</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>كل الأبعاد مُفعَّلة بالافتراضي — ألغِ ما لا تحتاجه</p>
              <div className="space-y-2">
                {DIMENSIONS.map(dim => {
                  const Icon   = dim.icon;
                  const active = dimensions.includes(dim.id);
                  return (
                    <button key={dim.id} onClick={() => setDimensions(prev => active ? prev.filter(d => d !== dim.id) : [...prev, dim.id])}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-right ${active ? isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/50" : isDark ? "border-white/[0.04] bg-transparent opacity-50" : "border-slate-100 bg-transparent opacity-50"}`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${active ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                        <Icon size={15} weight="duotone" className={active ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-slate-400"} />
                      </div>
                      <div className="flex-1">
                        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{dim.label}</p>
                        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{dim.desc}</p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${active ? "bg-[#C8A762] border-[#C8A762]" : isDark ? "border-zinc-700" : "border-slate-300"}`}>
                        {active && <CheckCircle size={16} weight="fill" className="text-[#0B3D2E] -m-px" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStage("form")} className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-semibold border transition ${isDark ? "border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}>
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                onClick={startProcess} disabled={dimensions.length === 0}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-l from-[#0B3D2E] to-emerald-700 text-white text-[12px] font-bold shadow disabled:opacity-40">
                <Sparkle size={14} /> ابدأ التحليل ({dimensions.length} بُعد)
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── PROCESSING ── */}
        {stage === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-10 space-y-6`}>
            <div className="flex flex-col items-center text-center gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-14 h-14 rounded-full border-2 border-[#C8A762]/20 border-t-[#C8A762]" />
              <div>
                <p className={`text-[15px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>يُجري التحليل الشامل...</p>
                <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {dealType} · {sector}{partyName ? ` · ${partyName}` : ""}
                </p>
              </div>
            </div>
            <div className="space-y-2 max-w-xs mx-auto w-full">
              {processingSteps.map((step, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${step.done ? "bg-[#C8A762]" : isDark ? "bg-zinc-800 border border-zinc-700" : "bg-slate-100 border border-slate-200"}`}>
                    {step.done && <CheckCircle size={12} weight="fill" className="text-[#0B3D2E]" />}
                  </div>
                  <p className={`text-[12px] ${step.done ? isDark ? "text-zinc-300" : "text-zinc-600" : isDark ? "text-zinc-600" : "text-slate-400"}`}>{step.label}</p>
                </motion.div>
              ))}
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
              <motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }}
                className="h-full rounded-full bg-gradient-to-l from-[#0B3D2E] to-[#C8A762]" />
            </div>
            <p className={`text-center text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{progress}%</p>
          </motion.div>
        )}

        {/* ── REPORT ── */}
        {stage === "report" && (
          <motion.div ref={reportRef} key="report" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <BetaReviewGate toolId="corp.deal-intel" toolName="تقرير تحليل الصفقة" reviewScope="legal-data">

            {/* Top action banner */}
            <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] border ${isDark ? "border-[#C8A762]/10 bg-[#C8A762]/5 text-zinc-400" : "border-amber-200/60 bg-amber-50/40 text-slate-500"}`}>
              <span>التقرير جاهز · تحميل PDF أو مشاركة كرابط مع فريقك</span>
              <div className="flex gap-1.5 items-center">
                <button onClick={handleExportPDF} disabled={pdfLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-[#0B3D2E] text-[#C8A762] hover:opacity-80 disabled:opacity-50">
                  {pdfLoading ? <Spinner size={10} className="animate-spin" /> : <DownloadSimple size={10} />} PDF
                </button>
                <button onClick={handleShare} className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition ${shared ? "text-emerald-500" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"}`}>
                  <ShareNetwork size={10} />{shared ? " تم!" : " مشاركة"}
                </button>
              </div>
            </div>

            {/* Summary bar */}
            <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} weight="fill" className="text-[#C8A762]" />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  تقرير <span className="text-[#C8A762] font-bold">{dealType}</span> — {sector}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopySummary} className={`flex items-center gap-1 text-[11px] font-semibold transition ${isDark ? "text-zinc-600 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                  {copied ? <><Check size={12} /> نُسخ</> : <><Copy size={12} /> نسخ الملخص</>}
                </button>
                <span className={`w-px h-4 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                <button onClick={handleShare} className={`flex items-center gap-1 text-[11px] font-semibold transition ${shared ? "text-emerald-500" : isDark ? "text-zinc-600 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                  {shared ? <><Check size={12} /> تم نسخ الرابط</> : <><ShareNetwork size={12} /> مشاركة</>}
                </button>
                <span className={`w-px h-4 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                <button onClick={handleExportPDF} disabled={pdfLoading}
                  className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all ${pdfLoading ? "opacity-60 cursor-not-allowed" : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0d5238]"}`}>
                  {pdfLoading ? <><Spinner size={12} className="animate-spin" /> جارٍ التصدير...</> : <><DownloadSimple size={12} /> تحميل PDF</>}
                </button>
              </div>
            </div>

            <AiResultActions
              text={formatDealIntelReport(dealType, sector, partyName, dimensions)}
              filename="corp-deal-intel-report"
              showShare
            />

            {/* Legal */}
            <AccordionCard icon={Scales} title={MOCK_REPORT.legal.title} color={MOCK_REPORT.legal.color} isDark={isDark} defaultOpen>
              <div className="pt-3 space-y-3">
                {MOCK_REPORT.legal.texts.map((t, i) => (
                  <div key={i} className={`p-3 rounded-xl ${isDark ? "bg-zinc-800/60" : "bg-slate-50"}`}>
                    <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-blue-300" : "text-blue-700"}`}>{t.ref}</p>
                    <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{t.body}</p>
                  </div>
                ))}
                <div>
                  <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>البنود الإلزامية المقترحة:</p>
                  <div className="space-y-1">
                    {MOCK_REPORT.legal.clauses.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle size={11} weight="fill" className="text-blue-500 flex-shrink-0" />
                        <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{c}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${isDark ? "border-blue-700/20 bg-blue-900/10" : "border-blue-200 bg-blue-50"}`}>
                  <p className="text-[11px] font-bold text-blue-500 mb-1">الرأي القانوني:</p>
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{MOCK_REPORT.legal.opinion}</p>
                </div>
              </div>
            </AccordionCard>

            {/* Commercial */}
            <AccordionCard icon={ChartLine} title={MOCK_REPORT.commercial.title} color={MOCK_REPORT.commercial.color} isDark={isDark}>
              <div className="pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {MOCK_REPORT.commercial.factors.map((f, i) => (
                    <div key={i} className={`p-3 rounded-xl ${isDark ? "bg-zinc-800/60" : "bg-slate-50"}`}>
                      <p className={`text-[10px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{f.label}</p>
                      <p className={`text-[12px] font-bold ${f.positive ? "text-emerald-500" : "text-amber-500"}`}>{f.value}</p>
                    </div>
                  ))}
                </div>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{MOCK_REPORT.commercial.note}</p>
              </div>
            </AccordionCard>

            {/* Risks */}
            <AccordionCard icon={ShieldWarning} title={MOCK_REPORT.risk.title} color={MOCK_REPORT.risk.color} isDark={isDark}>
              <div className="pt-3 space-y-2">
                {MOCK_REPORT.risk.risks.map((r, i) => {
                  const rs = RISK_STYLE[r.level];
                  return (
                    <div key={i} className={`p-3 rounded-xl border ${isDark ? rs.bg.dark : rs.bg.light}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rs.dot}`} />
                        <p className={`text-[11px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{r.label}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-white text-slate-500"}`}>{rs.label}</span>
                      </div>
                      <p className={`text-[11px] mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{r.desc}</p>
                      <p className={`text-[11px] font-semibold flex items-center gap-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}><CheckCircle size={12} weight="fill" className="text-emerald-500" /> الحل: {r.fix}</p>
                    </div>
                  );
                })}
              </div>
            </AccordionCard>

            {/* Regulatory */}
            <AccordionCard icon={Buildings} title={MOCK_REPORT.regulatory.title} color={MOCK_REPORT.regulatory.color} isDark={isDark}>
              <div className="pt-3 space-y-2">
                {MOCK_REPORT.regulatory.requirements.map((req, i) => (
                  <div key={i} className={`flex items-start justify-between gap-3 p-3 rounded-xl ${isDark ? "bg-zinc-800/60" : "bg-slate-50"}`}>
                    <div className="flex-1">
                      <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{req.agency}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{req.action}</p>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${req.required ? isDark ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-600" : isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                        {req.required ? "إلزامي" : "اختياري"}
                      </span>
                      <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{req.timeline}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionCard>

            {/* Macro */}
            {dimensions.includes("macro") && (
              <AccordionCard icon={Globe} title={MOCK_REPORT.macro.title} color={MOCK_REPORT.macro.color} isDark={isDark}>
                <div className="pt-3 space-y-4">
                  <div>
                    <p className={`text-[11px] font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المؤشرات الاقتصادية</p>
                    <div className="grid grid-cols-2 gap-2">
                      {MOCK_REPORT.macro.economic.map((item, i) => {
                        const ItemIcon = item.icon;
                        return (
                          <div key={i} className={`p-3 rounded-xl border ${isDark ? "border-white/[0.05] bg-zinc-800/60" : "border-slate-100 bg-slate-50"}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <ItemIcon size={11} className={item.positive === true ? "text-emerald-500" : item.positive === false ? "text-red-400" : "text-amber-400"} />
                              <p className={`text-[10px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{item.label}</p>
                            </div>
                            <p className={`text-[13px] font-black mb-0.5 ${item.positive === true ? "text-emerald-500" : item.positive === false ? "text-red-400" : "text-amber-400"}`}>{item.value}</p>
                            <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.note}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className={`text-[11px] font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>التحديثات التشريعية المؤثرة</p>
                    <div className="space-y-2">
                      {MOCK_REPORT.macro.legislative.map((item, i) => {
                        const lvl = item.level === "high"   ? { dot: "bg-red-500",   badge: isDark ? "bg-red-900/20 text-red-400 border-red-700/20"     : "bg-red-50 text-red-600 border-red-200",     label: "أثر عالٍ" }
                                  : item.level === "medium" ? { dot: "bg-amber-400", badge: isDark ? "bg-amber-900/20 text-amber-400 border-amber-700/20" : "bg-amber-50 text-amber-600 border-amber-200", label: "أثر متوسط" }
                                  :                           { dot: "bg-green-500", badge: isDark ? "bg-green-900/20 text-green-400 border-green-700/20"  : "bg-green-50 text-green-600 border-green-200",  label: "أثر محدود" };
                        return (
                          <div key={i} className={`p-3 rounded-xl border ${isDark ? "border-white/[0.05] bg-zinc-800/40" : "border-slate-100 bg-white"}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lvl.dot}`} />
                                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{item.title}</p>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.badge}`}>{lvl.label}</span>
                            </div>
                            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{item.impact}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${isDark ? "border-teal-700/20 bg-teal-900/10" : "border-teal-200 bg-teal-50/60"}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Globe size={12} className="text-teal-500 flex-shrink-0" weight="duotone" />
                      <p className={`text-[11px] font-bold ${isDark ? "text-teal-400" : "text-teal-700"}`}>التأثير على صفقتك</p>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{MOCK_REPORT.macro.policyImpact}</p>
                  </div>
                </div>
              </AccordionCard>
            )}

            {/* Counterparty */}
            <AccordionCard icon={Handshake} title={MOCK_REPORT.counterparty.title} color={MOCK_REPORT.counterparty.color} isDark={isDark}>
              <div className="pt-3 space-y-3">
                <div>
                  <p className={`text-[11px] font-bold mb-2 flex items-center gap-1.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    <Warning size={14} className="text-amber-500" /> نقاط يجب التحقق منها:
                  </p>
                  {MOCK_REPORT.counterparty.redFlags.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 mb-1">
                      <Warning size={11} className="text-amber-500 flex-shrink-0" />
                      <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{f}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className={`text-[11px] font-bold mb-2 flex items-center gap-1.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    <ListChecks size={14} className="text-blue-500" /> أسئلة Due Diligence مقترحة:
                  </p>
                  {MOCK_REPORT.counterparty.ddQuestions.map((q, i) => (
                    <div key={i} className={`flex items-start gap-2 mb-1.5 p-2 rounded-lg ${isDark ? "bg-zinc-800/50" : "bg-slate-50"}`}>
                      <span className={`text-[10px] font-black mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{i + 1}.</span>
                      <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{q}</p>
                    </div>
                  ))}
                </div>
              </div>
            </AccordionCard>

            {/* Verdict */}
            {(() => {
              const v  = MOCK_REPORT.verdict;
              const vs = VERDICT_STYLE[v.verdict];
              return (
                <div className={`p-4 rounded-2xl border ${isDark ? vs.bg.dark : vs.bg.light}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb size={16} weight="duotone" className={vs.text} />
                    <p className={`text-[13px] font-bold flex items-center gap-1.5 ${vs.text}`}>
                      <vs.Icon weight="fill" size={14} className="mb-px" /> {vs.label}
                    </p>
                  </div>
                  <p className={`text-[12px] leading-relaxed mb-3 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{v.summary}</p>
                  <div className="space-y-1">
                    {v.nextSteps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className={`text-[10px] font-black ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{i + 1}.</span>
                        <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            </BetaReviewGate>

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/ai/contracts"
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.07] bg-zinc-900 hover:border-[#C8A762]/30" : "border-slate-200 bg-white shadow-sm hover:border-amber-300 hover:shadow-md"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                  <FileText size={18} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div className="flex-1">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>صياغة العقد</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>أرسل البنود لمحترف العقود</p>
                </div>
                <ArrowRight size={14} className={isDark ? "text-zinc-600" : "text-slate-300"} />
              </Link>
              <button onClick={() => { setStage("form"); setDealType(null); setSector(null); setDesc(""); setPartyType(null); setPartyName(""); }}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.07] bg-zinc-900" : "border-slate-200 bg-white shadow-sm"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-zinc-800" : "bg-slate-50"}`}>
                  <MagnifyingGlass size={18} weight="duotone" className={isDark ? "text-zinc-400" : "text-slate-500"} />
                </div>
                <div className="flex-1">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>تحليل صفقة جديدة</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ابدأ من جديد</p>
                </div>
              </button>
            </div>

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
