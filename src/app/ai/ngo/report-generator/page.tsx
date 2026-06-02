"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartBar, HandHeart, UsersThree, Money, Calendar,
  Warning, CheckCircle, Sparkle, Copy, Download,
  ArrowsClockwise, FileText, TrendUp, TrendDown
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────
type ReportType = "تقرير ربع سنوي" | "تقرير سنوي" | "تقرير برنامج" | "تقرير للمركز الوطني" | "تقرير مانحين";

const REPORT_TYPES: ReportType[] = [
  "تقرير ربع سنوي", "تقرير سنوي", "تقرير برنامج",
  "تقرير للمركز الوطني", "تقرير مانحين"
];

interface KPI {
  id: string;
  label: string;
  value: string;
  unit: string;
  trend: "up" | "down" | "stable";
}

export default function NGOReportGeneratorPage() {
  const [reportType, setReportType] = useState<ReportType | "">("");
  const [orgName, setOrgName] = useState("");
  const [period, setPeriod] = useState("");
  const [missionSummary, setMissionSummary] = useState("");
  const [achievements, setAchievements] = useState("");
  const [challenges, setChallenges] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  const [kpis, setKpis] = useState<KPI[]>([
    { id: "1", label: "عدد المستفيدين", value: "", unit: "مستفيد", trend: "up" },
    { id: "2", label: "المتطوعون النشطون", value: "", unit: "متطوع", trend: "up" },
    { id: "3", label: "إجمالي التبرعات", value: "", unit: "ريال", trend: "up" },
    { id: "4", label: "الأنشطة المنفذة", value: "", unit: "نشاط", trend: "stable" },
  ]);

  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  function updateKpi(id: string, field: keyof KPI, value: string) {
    setKpis(p => p.map(k => k.id === id ? { ...k, [field]: value } : k));
  }

  const MOCK_REPORT = `${reportType || "التقرير الدوري"}
══════════════════════════════════════════
${orgName || "اسم الجمعية"}
الفترة: ${period || "——"}

────────────────────────────────────────

أولاً: نبذة عن الجمعية ورسالتها
${missionSummary || "الرسالة والرؤية..."}

────────────────────────────────────────

ثانياً: المؤشرات الرئيسية للأداء

${kpis.filter(k => k.value).map(k =>
  `• ${k.label}: ${k.value} ${k.unit} ${k.trend === "up" ? "↑" : k.trend === "down" ? "↓" : "→"}`
).join("\n") || "لم تُدخَل مؤشرات بعد"}

────────────────────────────────────────

ثالثاً: الإنجازات والأنشطة المنفذة
${achievements || "قائمة الإنجازات والأنشطة..."}

────────────────────────────────────────

رابعاً: التحديات والعقبات
${challenges || "التحديات التي واجهت الجمعية خلال هذه الفترة..."}

────────────────────────────────────────

خامساً: الخطة القادمة والأهداف
${nextSteps || "الأهداف والخطط للفترة القادمة..."}

────────────────────────────────────────

سادساً: البيان المالي المختصر

الإيرادات:
  - تبرعات نقدية: ${kpis.find(k=>k.label==="إجمالي التبرعات")?.value || "——"} ريال
  - منح ودعم مؤسسي: ——
  - رسوم وإيرادات أخرى: ——

المصروفات:
  - برامج ومشاريع: ——
  - إدارة وتشغيل: ——
  - تطوير الكوادر: ——

────────────────────────────────────────

ختاماً:
يُقدم مجلس الإدارة هذا التقرير للجهات المعنية تأكيداً للشفافية والمساءلة،
وإيماناً بمسؤولية الجمعية تجاه المجتمع والمستفيدين.

تاريخ الإصدار: ${new Date().toLocaleDateString("ar-SA")}
رئيس مجلس الإدارة: __________________
التوقيع والختم: __________________`;

  function handleGenerate() {
    setLoading(true);
    setTimeout(() => { setLoading(false); setGenerated(true); }, 1400);
  }

  function handleCopy() {
    navigator.clipboard.writeText(MOCK_REPORT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canGenerate = reportType && orgName && period;

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-700 to-purple-500 flex items-center justify-center shadow-lg">
          <ChartBar size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">مولِّد التقارير الدورية</h1>
          <p className="text-[12px] text-zinc-500">تقارير للمركز الوطني · المانحين · مجلس الإدارة</p>
        </div>
        <span className="mr-auto rounded-full bg-violet-500/10 border border-violet-500/25 px-3 py-1 text-[10px] font-bold text-violet-400">
          جمعية خيرية
        </span>
      </div>

      <AnimatePresence mode="wait">
        {!generated ? (
          <motion.div key="form" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="space-y-6">

            {/* Report type */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400">نوع التقرير</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {REPORT_TYPES.map(t => (
                  <button key={t} onClick={() => setReportType(t)}
                    className={`rounded-xl border px-3 py-2.5 text-[11px] font-semibold transition-all ${
                      reportType === t ? "border-violet-500/50 bg-violet-500/10 text-violet-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                    }`}>{t}</button>
                ))}
              </div>
            </div>

            {/* Org + Period */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">اسم الجمعية</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)}
                  placeholder="الاسم الرسمي للجمعية"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1"><Calendar size={11}/> الفترة</label>
                <input value={period} onChange={e => setPeriod(e.target.value)}
                  placeholder="مثال: الربع الأول 2026 / يناير-مارس 2026"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40"
                />
              </div>
            </div>

            {/* KPIs */}
            <div className="space-y-3">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <ChartBar size={12}/> مؤشرات الأداء الرئيسية
              </label>
              <div className="grid grid-cols-2 gap-3">
                {kpis.map(k => (
                  <div key={k.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-zinc-400">{k.label}</span>
                      <div className="flex items-center gap-1">
                        {(["up","stable","down"] as const).map(t => (
                          <button key={t} onClick={() => updateKpi(k.id, "trend", t)}
                            className={`rounded-lg p-1 text-[10px] transition-all ${
                              k.trend === t
                                ? t === "up" ? "bg-emerald-500/20 text-emerald-400" : t === "down" ? "bg-red-500/20 text-red-400" : "bg-zinc-700 text-zinc-400"
                                : "text-zinc-700 hover:text-zinc-500"
                            }`}
                          >
                            {t === "up" ? <TrendUp size={10} weight="bold"/> : t === "down" ? <TrendDown size={10} weight="bold"/> : "→"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input value={k.value} onChange={e => updateKpi(k.id, "value", e.target.value)}
                        placeholder="القيمة"
                        className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 font-mono"
                      />
                      <span className="text-[11px] text-zinc-600 flex-shrink-0">{k.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Text sections */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">رسالة الجمعية ونبذة موجزة</label>
              <textarea value={missionSummary} onChange={e => setMissionSummary(e.target.value)} rows={3}
                placeholder="اذكر رسالة الجمعية والنشاط الرئيسي..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">الإنجازات والأنشطة المنفذة</label>
              <textarea value={achievements} onChange={e => setAchievements(e.target.value)} rows={4}
                placeholder="اذكر أبرز الإنجازات والأنشطة التي نفذتها الجمعية خلال الفترة..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">التحديات</label>
                <textarea value={challenges} onChange={e => setChallenges(e.target.value)} rows={3}
                  placeholder="أبرز التحديات والمعيقات..."
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">الخطة القادمة</label>
                <textarea value={nextSteps} onChange={e => setNextSteps(e.target.value)} rows={3}
                  placeholder="أهداف وخطط الفترة القادمة..."
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 resize-none"
                />
              </div>
            </div>

            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
              onClick={handleGenerate} disabled={!canGenerate || loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-violet-700 to-purple-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-violet-500/20 disabled:opacity-50"
            >
              {loading ? (
                <><motion.div animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:"linear" }}
                  className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white" />
                جارٍ إنشاء التقرير...</>
              ) : (
                <><Sparkle size={15} weight="fill" /> أنشئ التقرير الدوري</>
              )}
            </motion.button>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} className="space-y-5">
            <BetaReviewGate toolId="ngo.report-generator" toolName="التقرير الدوري للجمعية" reviewScope="legal-data">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                <span className="text-[13px] font-bold text-white">تم إنشاء التقرير</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "تم" : "نسخ"}
                </button>
                <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  <Download size={12} /> تحميل PDF
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <pre className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">{MOCK_REPORT}</pre>
            </div>

            {/* Unified Result Actions */}
            <AiResultActions
              text={MOCK_REPORT}
              filename={`ngo-report-${reportType || "periodic"}`}
              showVault
              showHumanReview
              className="justify-start"
            />

            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 text-[11px] text-zinc-500 flex gap-2">
              <Warning size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
              <span>يجب مراجعة التقرير من مجلس الإدارة قبل إرساله للجهات الرسمية.</span>
            </div>
            </BetaReviewGate>

            <button onClick={() => { setGenerated(false); setReportType(""); setOrgName(""); setPeriod(""); }}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
              <ArrowsClockwise size={13} /> تقرير جديد
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
