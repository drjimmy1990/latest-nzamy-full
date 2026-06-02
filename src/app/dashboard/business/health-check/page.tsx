"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp, MagnifyingGlass, ChartBar,
  FileText, Scales, Buildings, TrendUp, ShieldCheck, Lock,
  Warning, CheckCircle, ArrowLeft, Sparkle,
  FilePdf, FileDoc, Eye, Download,
  GoogleDriveLogo, FolderOpen,
  Clock, CaretDown, Bell, ArrowsClockwise,
  Upload, Funnel, UsersThree, Handshake, Money
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";import {
  type FileItem,
  type Category,
  type Severity,
  type Finding,
  type WizardStep,
  MOCK_FILES,
  CATEGORY_CONFIG,
  MOCK_FINDINGS,
  SCORE_BARS,
  PREDICTIVE_INSIGHTS,
} from "@/constants/healthCheckData";


// ── File icon helper ──────────────────────────────────────────────────
function FileIcon({ type }: { type: string }) {
  if (type === "pdf") return <FilePdf size={20} className="text-red-500" weight="duotone" />;
  if (type === "docx") return <FileDoc size={20} className="text-blue-500" weight="duotone" />;
  return <FileText size={20} className="text-zinc-400" weight="duotone" />;
}

// ── Severity badge ────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = {
    critical: { label: "عاجل", bg: "bg-red-500/10 text-red-500 border-red-500/20" },
    warning:  { label: "متابعة", bg: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    ok:       { label: "سليم", bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  }[severity];
  return <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${cfg.bg}`}>{cfg.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import { RoleGuard } from "@/components/dashboard/RoleGuard";

export default function HealthCheckDashboard() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const [step, setStep] = useState<WizardStep>("upload");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [classifyProgress, setClassifyProgress] = useState(0);
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";

  // ── Simulate upload ──
  const handleUpload = useCallback(() => {
    setFiles(MOCK_FILES.map(f => ({ ...f, status: "uploading" as const })));
    setTimeout(() => {
      setFiles(MOCK_FILES.map(f => ({ ...f, status: "done" as const })));
    }, 1500);
  }, []);

  // ── Simulate classification ──
  const startClassification = useCallback(() => {
    setStep("classifying");
    setClassifyProgress(0);
    const interval = setInterval(() => {
      setClassifyProgress(prev => {
        if (prev >= 100) { clearInterval(interval); setTimeout(() => setStep("results"), 800); return 100; }
        return prev + Math.random() * 8 + 2;
      });
    }, 200);
  }, []);

  // ── Filtered findings ──
  const filteredFindings = filterSeverity === "all"
    ? MOCK_FINDINGS
    : MOCK_FINDINGS.filter(f => f.severity === filterSeverity);

  const criticalCount = MOCK_FINDINGS.filter(f => f.severity === "critical").length;
  const warningCount = MOCK_FINDINGS.filter(f => f.severity === "warning").length;
  const okCount = MOCK_FINDINGS.filter(f => f.severity === "ok").length;
  const overallScore = 67;

  return (
    <RoleGuard blockedRoles={["employee"]}>
    <SubscriptionGuard featureKey="health-check">
    <div className={`p-5 md:p-7 max-w-6xl mx-auto space-y-5 ${tp}`} dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${tp}`}>الفحص القانوني الشامل ٣٦٠°</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">CORP</span>
          </div>
          <p className={`text-[13px] ${ts}`}>ارفع وثائق شركتك — نصنّفها، نحللها، ونعطيك تقريراً شاملاً</p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-royal/20" : "bg-royal/10"}`}>
          <MagnifyingGlass size={22} weight="duotone" className="text-royal" />
        </div>
      </div>

      {/* Progress steps */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center justify-between gap-2">
          {[
            { key: "upload", label: "رفع الوثائق", icon: CloudArrowUp, num: "١" },
            { key: "classifying", label: "التصنيف الذكي", icon: MagnifyingGlass, num: "٢" },
            { key: "results", label: "النتائج والمخاطر", icon: Warning, num: "٣" },
            { key: "dashboard", label: "الداشبورد الحي", icon: ChartBar, num: "٤" },
          ].map((s, i, arr) => {
            const stepOrder = ["upload", "classifying", "results", "dashboard"];
            const current = stepOrder.indexOf(step);
            const thisStep = stepOrder.indexOf(s.key);
            const isActive = thisStep === current;
            const isDone = thisStep < current;
            return (
              <div key={s.key} className="flex-1 flex items-center gap-2">
                <button
                  onClick={() => { if (isDone) setStep(s.key as WizardStep); }}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all w-full ${
                    isActive ? "bg-royal/10 text-royal dark:bg-royal/20 dark:text-[#C8A762]"
                    : isDone ? `${isDark ? "text-emerald-400" : "text-emerald-600"} cursor-pointer`
                    : `${ts} opacity-50`
                  }`}
                >
                  {isDone ? <CheckCircle size={16} weight="fill" className="text-emerald-500" /> : <s.icon size={16} />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.num}</span>
                </button>
                {i < arr.length - 1 && (
                  <div className={`hidden sm:block w-6 h-px ${isDone ? "bg-emerald-500" : isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════ STEP 1: UPLOAD ═══════════════════════ */}
      <AnimatePresence mode="wait">
        {step === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            {/* Drop zone */}
            <div
              onClick={handleUpload}
              className={`${card} p-10 flex flex-col items-center justify-center text-center cursor-pointer border-2 border-dashed transition-colors hover:border-royal/50 ${
                isDark ? "border-white/[0.08] hover:bg-white/[0.02]" : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                <CloudArrowUp size={40} weight="duotone" className={`mb-3 ${isDark ? "text-zinc-600" : "text-zinc-300"}`} />
              </motion.div>
              <p className={`text-[14px] font-semibold mb-1 ${tp}`}>اسحب الملفات هنا أو اضغط للاختيار</p>
              <p className={`text-[12px] ${ts}`}>PDF, DOCX, XLSX, صور — بأي ترتيب وبدون تصنيف</p>
              <div className="flex items-center gap-3 mt-4">
                <span className={`text-[11px] px-3 py-1 rounded-full border ${isDark ? "border-white/[0.08] text-zinc-500" : "border-zinc-200 text-zinc-400"}`}>
                  <Upload size={12} className="inline me-1" />حتى ٥٠٠ ملف
                </span>
                <span className={`text-[11px] px-3 py-1 rounded-full border ${isDark ? "border-white/[0.08] text-zinc-500" : "border-zinc-200 text-zinc-400"}`}>
                  حتى ٢ جيجا
                </span>
              </div>
            </div>

            {/* Or link sources */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: GoogleDriveLogo, label: "Google Drive", desc: "شارك رابط المجلد" },
                { icon: FolderOpen, label: "OneDrive / SharePoint", desc: "شارك رابط المجلد" },
                { icon: Upload, label: "رفع مُرتب", desc: "عقود — تراخيص — مالية..." },
              ].map((src, i) => (
                <button key={i} onClick={handleUpload}
                  className={`${card} p-4 flex items-center gap-3 text-start shadow-sm hover:border-royal/30 transition-colors`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-white/[0.05]" : "bg-zinc-50"}`}>
                    <src.icon size={20} weight="duotone" className="text-royal" />
                  </div>
                  <div>
                    <p className={`text-[12px] font-semibold ${tp}`}>{src.label}</p>
                    <p className={`text-[10px] ${ts}`}>{src.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Uploaded files */}
            {files.length > 0 && (
              <div className={`${card} p-5 shadow-sm`}>
                <div className="flex items-center justify-between mb-4">
                  <p className={`text-[12px] font-bold ${tp}`}>الملفات المرفوعة ({files.length})</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    files.every(f => f.status === "done") ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                  }`}>
                    {files.every(f => f.status === "done") ? "✅ مكتمل" : "جارٍ الرفع..."}
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {files.map(file => (
                    <div key={file.id} className={`flex items-center gap-3 rounded-xl p-3 ${isDark ? "bg-white/[0.02]" : "bg-zinc-50"}`}>
                      <FileIcon type={file.type} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-medium truncate ${tp}`}>{file.name}</p>
                        <p className={`text-[10px] ${ts}`}>{file.size}</p>
                      </div>
                      {file.status === "done" && <CheckCircle size={16} weight="fill" className="text-emerald-500" />}
                      {file.status === "uploading" && (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="h-4 w-4 rounded-full border-2 border-royal/30 border-t-royal" />
                      )}
                    </div>
                  ))}
                </div>
                {files.every(f => f.status === "done") && (
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={startClassification}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="w-full mt-4 py-3.5 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(11,61,46,0.4)]"
                  >
                    <Sparkle size={15} weight="fill" /> ابدأ التصنيف والتحليل <ArrowLeft size={14} weight="bold" />
                  </motion.button>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════ STEP 2: CLASSIFYING ═══════════════════════ */}
        {step === "classifying" && (
          <motion.div key="classifying" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            <div className={`${card} p-10 text-center shadow-sm`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="mx-auto mb-4 w-fit">
                <MagnifyingGlass size={36} weight="duotone" className="text-royal" />
              </motion.div>
              <h3 className={`text-[16px] font-bold mb-2 ${tp}`}>جارٍ تحليل وتصنيف وثائقك...</h3>
              <p className={`text-[13px] mb-6 ${ts}`}>AI يقرأ {MOCK_FILES.length} ملفاً — يصنّف كل وثيقة ويستخرج المعلومات الأساسية</p>
              
              <div className={`w-full max-w-md mx-auto h-3 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
                <motion.div
                  className="h-full rounded-full bg-gradient-to-l from-royal to-emerald-500"
                  style={{ width: `${Math.min(classifyProgress, 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className={`text-[12px] mt-2 font-mono font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {Math.min(Math.round(classifyProgress), 100)}٪
              </p>

              {/* Live feed */}
              <div className="mt-6 space-y-2 max-w-sm mx-auto text-start">
                {[
                  { pct: 10, text: "قراءة عقد_توريد_شركة_الأفق.pdf..." },
                  { pct: 30, text: "تصنيف: عقد تجاري — استخراج البنود..." },
                  { pct: 50, text: "فحص رخصة_بلدية.pdf — تاريخ الانتهاء..." },
                  { pct: 70, text: "تحليل إقرار_زكاة_2024 — مطابقة مع ٢٠٢٥..." },
                  { pct: 90, text: "مسح عقد_شراكة — بنود عدم المنافسة..." },
                ].filter(l => classifyProgress >= l.pct).map((l, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center gap-2 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <CheckCircle size={12} weight="fill" className="text-emerald-500 shrink-0" />
                    <span>{l.text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════ STEP 3: RESULTS ═══════════════════════ */}
        {step === "results" && (
          <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            {/* Score overview */}
            <div className={`${card} p-6 shadow-sm`}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-wider ${ts}`}>النتيجة العامة</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`text-5xl font-extrabold font-mono ${overallScore >= 80 ? "text-emerald-500" : overallScore >= 60 ? "text-amber-500" : "text-red-500"}`}>{overallScore}</span>
                    <span className={`text-lg ${ts}`}>/ ١٠٠</span>
                  </div>
                </div>
                <div className="text-end">
                  <p className={`text-[12px] font-semibold mb-1 ${tp}`}>تم تحليل {MOCK_FILES.length} وثيقة</p>
                  <p className={`text-[11px] ${ts}`}>اكتُشفت {criticalCount + warningCount} نقطة تحتاج اهتمام</p>
                </div>
              </div>
              
              {/* Score bars */}
              <div className="space-y-3">
                {SCORE_BARS.map((b, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[12px] font-medium ${tp}`}>{b.label}</span>
                      <span className={`text-[11px] ${ts}`}>{b.detail}</span>
                    </div>
                    <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${b.pct}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        className={`h-full rounded-full ${b.color}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: isAr ? "عاجل" : "Critical", count: criticalCount, color: "text-red-500", bg: isDark ? "border-red-700/20 bg-red-900/5" : "border-red-200 bg-red-50" },
                { label: isAr ? "متابعة" : "Warnings", count: warningCount, color: "text-amber-500", bg: isDark ? "border-amber-700/20 bg-amber-900/5" : "border-amber-200 bg-amber-50" },
                { label: isAr ? "سليم" : "Healthy", count: okCount, color: "text-emerald-500", bg: isDark ? "border-emerald-700/20 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50" },
              ].map((s, i) => (
                <button key={i} onClick={() => setFilterSeverity(i === 0 ? "critical" : i === 1 ? "warning" : "ok")}
                  className={`rounded-xl border p-4 text-center transition-all hover:scale-[1.02] ${s.bg}`}>
                  <p className={`text-2xl font-black font-mono ${s.color}`}>{s.count}</p>
                  <p className={`text-[11px] mt-0.5 ${ts}`}>{s.label}</p>
                </button>
              ))}
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2">
              {[
                { key: "all" as const, label: isAr ? "الكل" : "All" },
                { key: "critical" as const, label: isAr ? "عاجل" : "Critical" },
                { key: "warning" as const, label: isAr ? "متابعة" : "Warnings" },
                { key: "ok" as const, label: isAr ? "سليم" : "Healthy" },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterSeverity(f.key)}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    filterSeverity === f.key
                      ? "bg-royal text-white border-royal"
                      : isDark ? "border-white/[0.08] text-zinc-400 hover:border-white/20" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                  }`}>
                  {f.label} ({f.key === "all" ? MOCK_FINDINGS.length : MOCK_FINDINGS.filter(ff => ff.severity === f.key).length})
                </button>
              ))}
            </div>

            {/* Findings list */}
            <div className="space-y-2">
              {filteredFindings.map((finding, i) => {
                const catCfg = CATEGORY_CONFIG[finding.category];
                const CatIcon = catCfg.icon;
                const isExpanded = expandedFinding === finding.id;
                return (
                  <motion.div key={finding.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <button onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}
                      className={`w-full text-start ${card} p-4 shadow-sm transition-all hover:shadow-md`}>
                      <div className="flex items-start gap-3">
                        <CatIcon size={18} weight="duotone" className={`mt-0.5 shrink-0 ${catCfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <SeverityBadge severity={finding.severity} />
                            <span className={`text-[10px] ${ts}`}>{catCfg.label}</span>
                          </div>
                          <p className={`text-[13px] font-semibold ${tp}`}>{finding.title}</p>
                        </div>
                        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} className="shrink-0 mt-1">
                          <CaretDown size={14} className={ts} />
                        </motion.div>
                      </div>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden">
                            <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                              <p className={`text-[12px] leading-relaxed mb-3 ${ts}`}>{finding.detail}</p>
                              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                                finding.severity === "ok" ? "bg-emerald-500/10 text-emerald-500" : "bg-royal/10 text-royal"
                              }`}>
                                <ArrowLeft size={11} /> {finding.action}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                  </motion.div>
                );
              })}
            </div>

            {/* Go to dashboard */}
            <motion.button onClick={() => setStep("dashboard")}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(11,61,46,0.4)]">
              <ChartBar size={15} weight="duotone" /> عرض الداشبورد الحي <ArrowLeft size={14} weight="bold" />
            </motion.button>
          </motion.div>
        )}

        {/* ═══════════════════ STEP 4: DASHBOARD ═══════════════════════ */}
        {step === "dashboard" && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            
            {/* ── Analysis metadata ── */}
            <div className={`${card} p-4 shadow-sm`}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {[
                  { icon: Clock, label: "وقت التحليل", value: "٤ دقائق و ١٢ ثانية" },
                  { icon: FileText, label: "وثائق مُحلّلة", value: `${MOCK_FILES.length} وثيقة` },
                  { icon: Sparkle, label: "نموذج AI", value: "Nzamy Legal-v3" },
                  { icon: Funnel, label: "نقاط بيانات", value: "١٨٧ نقطة" },
                  { icon: ChartBar, label: "آخر فحص", value: "اليوم ٠٨:٤٥ ص" },
                ].map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <m.icon size={13} weight="duotone" className="text-royal" />
                    <span className={`text-[10px] ${ts}`}>{m.label}:</span>
                    <span className={`text-[11px] font-bold ${tp}`}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Top row: Score + Classification ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`${card} p-6 shadow-sm md:col-span-2`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${ts}`}>النتيجة العامة</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-5xl font-extrabold font-mono text-amber-500">{overallScore}</span>
                      <span className={`text-lg ${ts}`}>/ ١٠٠</span>
                    </div>
                    <p className={`text-[11px] mt-1 ${isDark ? "text-amber-400/70" : "text-amber-600"}`}>وضعك القانوني يتطلب تدخلات عاجلة في ٥ نقاط</p>
                  </div>
                  <div className="flex gap-2">
                    <button className={`px-3 py-2 rounded-xl text-[11px] font-semibold border ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-500 hover:text-zinc-700"}`}>
                      <Download size={13} className="inline me-1" /> تصدير PDF
                    </button>
                    <button onClick={() => setStep("upload")} className="px-3 py-2 rounded-xl text-[11px] font-semibold bg-royal text-white hover:bg-royal/90">
                      <ArrowsClockwise size={13} className="inline me-1" /> إعادة الفحص
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2.5">
                  {SCORE_BARS.map((b, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-28 text-[11px] shrink-0 font-medium ${tp}`}>{b.label}</span>
                      <div className={`flex-1 h-5 rounded-lg overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${b.pct}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          className={`h-full rounded-lg ${b.color} flex items-center justify-end pe-2`}>
                          <span className="text-[9px] font-bold text-white">{b.pct}٪</span>
                        </motion.div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${card} p-5 shadow-sm`}>
                <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${ts}`}>التصنيف</p>
                <div className="space-y-2.5">
                  {Object.entries(CATEGORY_CONFIG).filter(([, v]) => v.count > 0).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <div key={key} className="flex items-center gap-2.5">
                        <Icon size={15} weight="duotone" className={cfg.color} />
                        <span className={`text-[11px] flex-1 ${tp}`}>{cfg.label}</span>
                        <span className={`text-[12px] font-bold font-mono ${tp}`}>{cfg.count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"} flex items-center justify-between`}>
                  <span className={`text-[11px] font-medium ${ts}`}>إجمالي الوثائق</span>
                  <span className={`text-[14px] font-bold font-mono ${tp}`}>{MOCK_FILES.length}</span>
                </div>
              </div>
            </div>

            {/* ── Alerts row ── */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "عاجل", count: criticalCount, icon: Warning, color: "text-red-500", bg: isDark ? "border-red-700/20 bg-red-900/5" : "border-red-200 bg-red-50" },
                { label: "متابعة", count: warningCount, icon: Clock, color: "text-amber-500", bg: isDark ? "border-amber-700/20 bg-amber-900/5" : "border-amber-200 bg-amber-50" },
                { label: "سليم", count: okCount, icon: CheckCircle, color: "text-emerald-500", bg: isDark ? "border-emerald-700/20 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50" },
              ].map((a, i) => (
                <div key={i} className={`rounded-xl border p-4 text-center ${a.bg}`}>
                  <a.icon size={18} className={`mx-auto mb-1 ${a.color}`} weight="duotone" />
                  <p className={`text-2xl font-black font-mono ${a.color}`}>{a.count}</p>
                  <p className={`text-[10px] mt-0.5 ${ts}`}>{a.label}</p>
                </div>
              ))}
            </div>

            {/* ── 🔮 Predictive Insights ── */}
            <div className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-purple-900/30" : "bg-purple-50"}`}>
                  <Eye size={16} className="text-purple-500" weight="duotone" />
                </div>
                <div>
                  <p className={`text-[13px] font-bold ${tp}`}>نظرة تنبؤية — مخاطر وشيكة</p>
                  <p className={`text-[10px] ${ts}`}>تحليل ذكي لاحتمالية النزاعات والمشاكل القانونية بناءً على وثائقك</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {PREDICTIVE_INSIGHTS.map((item, i) => {
                  const RiskIcon = item.icon;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      className={`rounded-xl border p-4 ${item.color}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <RiskIcon size={16} weight="duotone" className="text-royal dark:text-gold shrink-0" />
                          <span className={`text-[13px] font-bold ${tp}`}>{item.risk}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] ${ts}`}>احتمالية:</span>
                          <span className={`text-[12px] font-black font-mono ${item.prob >= 70 ? "text-red-500" : item.prob >= 50 ? "text-amber-500" : "text-blue-500"}`}>{item.prob}٪</span>
                        </div>
                      </div>
                      <p className={`text-[11px] leading-relaxed ${ts} mb-2`}><strong>السبب:</strong> {item.reason}</p>
                      <p className={`text-[11px] leading-relaxed ${isDark ? "text-red-400/80" : "text-red-600/80"} mb-2`}><strong>الأثر المحتمل:</strong> {item.impact}</p>
                      <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold ${isDark ? "bg-royal/20 text-[#C8A762]" : "bg-royal/10 text-royal"}`}>
                        <Sparkle size={10} weight="fill" /> {item.action}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* ── 📅 Upcoming compliance deadlines ── */}
            <div className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell size={16} weight="duotone" className="text-[#C8A762]" />
                  <p className={`text-[13px] font-bold ${tp}`}>مواعيد الامتثال القادمة</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>٩٠ يوم القادمة</span>
              </div>
              
              <div className="space-y-2">
                {[
                  { date: "١٥ مايو ٢٠٢٦", item: "رخصة الدفاع المدني", days: 28, severity: "critical" as Severity },
                  { date: "٣٠ مايو ٢٠٢٦", item: "إقرار الزكاة ٢٠٢٥", days: 43, severity: "critical" as Severity },
                  { date: "١ يونيو ٢٠٢٦", item: "الرخصة البلدية", days: 45, severity: "warning" as Severity },
                  { date: "١٥ يونيو ٢٠٢٦", item: "عقد خدمات النظافة", days: 59, severity: "warning" as Severity },
                  { date: "١٠ يوليو ٢٠٢٦", item: "عقد صيانة الأنظمة", days: 84, severity: "warning" as Severity },
                  { date: "١٥ يوليو ٢٠٢٦", item: "عقد توريد الأفق", days: 89, severity: "warning" as Severity },
                ].map((d, i) => (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl ${isDark ? "bg-white/[0.02]" : "bg-zinc-50/50"}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${d.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} />
                    <span className={`text-[11px] font-mono w-28 shrink-0 ${ts}`}>{d.date}</span>
                    <span className={`text-[12px] font-medium flex-1 ${tp}`}>{d.item}</span>
                    <span className={`text-[11px] font-bold ${d.days <= 30 ? "text-red-500" : d.days <= 60 ? "text-amber-500" : "text-blue-500"}`}>بعد {d.days} يوم</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 🤖 AI Recommendations ── */}
            <div className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-royal/20" : "bg-royal/10"}`}>
                  <Sparkle size={16} className="text-royal" weight="duotone" />
                </div>
                <div>
                  <p className={`text-[13px] font-bold ${tp}`}>توصيات نظامي الذكية</p>
                  <p className={`text-[10px] ${ts}`}>مقترحات مُرتبة بالأولوية لتحسين وضعك القانوني</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {[
                  { priority: "عاجل", label: "سجّل الموظف في التأمينات فوراً", why: "غرامة عدم التسجيل تصل ١٠,٠٠٠ ﷼/شهر + حق رجوع الموظف", effort: "١٥ دقيقة عبر تأميناتي", color: "text-red-500 bg-red-500/10 border-red-500/20" },
                  { priority: "عاجل", label: "جدّد رخصة الدفاع المدني", why: "متبقي ٢٨ يوم فقط — التأخير = غرامة + إغلاق", effort: "موعد تفتيش + رسوم ٥,٠٠٠ ﷼", color: "text-red-500 bg-red-500/10 border-red-500/20" },
                  { priority: "عاجل", label: "قدّم إقرار الزكاة ٢٠٢٥", why: "التأخير بعد ٣٠ يوم = غرامة ٥-٢٥٪", effort: "ساعة واحدة عبر ZATCA", color: "text-red-500 bg-red-500/10 border-red-500/20" },
                  { priority: "مهم", label: "أضف ملحق تحكيم لعقد الأفق", why: "بدونه أي نزاع = محكمة مباشرة (أبطأ بـ ١٢+ شهر)", effort: "صياغة ملحق — ١ ساعة عبر محترف العقود", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
                  { priority: "مهم", label: "سجّل العلامة التجارية", why: "بدون تسجيل لا حماية قانونية — أي شخص يستخدم اسمك", effort: "طلب عبر SAIP — رسوم ١,٠٠٠ ﷼", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
                  { priority: "تحسين", label: "أعد التفاوض على بند عدم المنافسة", why: "٥ سنوات مبالغ فيه — معيار السوق ١-٢ سنة", effort: "جلسة تفاوض مع الشريك", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
                  { priority: "تحسين", label: "جدّد عقد إيجار المستودع", why: "منتهي من ٤٥ يوم — المؤجر يستطيع المطالبة بالإخلاء", effort: "تواصل مع المؤجر + عقد جديد", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
                ].map((rec, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border ${rec.color}`}>
                    <div className="shrink-0 mt-0.5">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${rec.color}`}>{rec.priority}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-bold ${tp}`}>{rec.label}</p>
                      <p className={`text-[10px] mt-0.5 ${ts}`}>{rec.why}</p>
                      <p className={`text-[10px] mt-1 font-medium ${isDark ? "text-[#C8A762]/80" : "text-royal"}`}>الجهد: {rec.effort}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* ── Critical action items ── */}
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${ts}`}>يتطلب إجراء فوري</p>
              <div className="space-y-2">
                {MOCK_FINDINGS.filter(f => f.severity === "critical").map((f, i) => {
                  const cfg = CATEGORY_CONFIG[f.category];
                  const CatIcon = cfg.icon;
                  return (
                    <motion.div key={f.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className={`${card} p-4 shadow-sm`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/20" : "bg-red-50"}`}>
                          <CatIcon size={16} className="text-red-500" weight="duotone" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-[13px] font-semibold ${tp}`}>{f.title}</p>
                          <p className={`text-[11px] mt-0.5 ${ts}`}>{f.detail}</p>
                        </div>
                        <button className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-[11px] font-semibold hover:bg-red-500/20 transition-colors">
                          {f.action}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* ── Monitoring CTA ── */}
            <div className={`rounded-2xl bg-[#0B3D2E] p-6 text-center shadow-[0_12px_30px_-8px_rgba(11,61,46,0.4)]`}>
              <Bell size={24} weight="duotone" className="text-[#C8A762] mx-auto mb-2" />
              <h3 className="text-[15px] font-bold text-white mb-1">فعّل المراقبة المستمرة</h3>
              <p className="text-[12px] text-white/50 mb-4 max-w-md mx-auto">تنبيهات واتساب فورية عند اقتراب انتهاء أي عقد أو رخصة + تحديثات ربع سنوية تلقائية</p>
              <button className="px-6 py-3 rounded-2xl bg-[#C8A762] text-[#0B3D2E] text-[13px] font-bold">
                <Bell size={13} weight="fill" className="inline me-1" /> تفعيل المراقبة — ٦,٩٩٩ ﷼/سنة
              </button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </SubscriptionGuard>
    </RoleGuard>
  );
}
