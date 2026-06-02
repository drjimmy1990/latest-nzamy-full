"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PencilLine, MagnifyingGlass, Warning, CheckCircle, FileArrowUp,
  FileText, X, Sparkle, TrendUp, ArrowsCounterClockwise, Scales, Briefcase,
  Gavel, Shield, Buildings, Users, ArrowRight, SealQuestion, SealCheck } from "@phosphor-icons/react";
import { useState, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Analysis Dimensions (color-coded) ───────────────────────────────────────

const DIMS = [
  { id: "laws",     label: "السند النظامي",      color: "blue",   ring: "ring-blue-400",   bg: "bg-blue-500/10",   text: "text-blue-500",   border: "border-blue-400/40"  },
  { id: "princip",  label: "المبادئ القضائية",   color: "purple", ring: "ring-purple-400", bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-400/40"},
  { id: "defenses", label: "الدفوع والحجج",      color: "amber",  ring: "ring-amber-400",  bg: "bg-amber-500/10",  text: "text-amber-500",  border: "border-amber-400/40" },
  { id: "requests", label: "الطلبات والمبالغ",   color: "red",    ring: "ring-red-400",    bg: "bg-red-500/10",    text: "text-red-500",    border: "border-red-400/40"   },
  { id: "style",    label: "الصياغة والأسلوب",   color: "emerald",ring: "ring-emerald-400",bg: "bg-emerald-500/10",text: "text-emerald-500",border: "border-emerald-400/40"},
];

// Mock: each paragraph maps to one or more dimension IDs + a suggested fix
const MOCK_PARAS = [
  {
    text: "يتقدم الموكل بهذه المذكرة طاعناً في قرار إنهاء خدمته الصادر في 15/3/1446هـ، مدعياً تعسف صاحب العمل في الفصل دون مسوّغ مشروع.",
    dims: ["defenses"],
    issues: [{ dim: "laws", sev: "high", note: "غياب السند النظامي — لم تُذكر المادة (77) نظام العمل.", fix: "أضف: «استناداً للمادة (٧٧) من نظام العمل م/٥١»" }],
  },
  {
    text: "وإن صاحب العمل لم يُخطر الموكل بأي إنذار كتابي مسبق ولم يتبع إجراءات التحقيق المنصوص عليها نظاماً.",
    dims: ["defenses", "laws"],
    issues: [{ dim: "princip", sev: "high", note: "لا يوجد مبدأ قضائي داعم لهذا الدفع.", fix: "أضف مبدأ المحكمة العليا رقم ٣٤١/ق/١٤٤٢هـ المقرر لضرورة الإخطار الكتابي." }],
  },
  {
    text: "لذا يلتمس الموكل الحكم بإعادة توظيفه أو التعويض عن الفصل التعسفي.",
    dims: ["requests"],
    issues: [
      { dim: "requests", sev: "high", note: "الطلبات مجملة — لا توجد مبالغ.", fix: "حدد مبلغ التعويض: راتب شهرين إشعار + مكافأة نهاية الخدمة بمقدار X ريال." },
      { dim: "style",    sev: "medium", note: "صياغة الطلب ضعيفة — مبهمة قانونياً.", fix: "«يلتمس الحكم بـ: أولاً: إعادة الموكل لعمله. ثانياً: التعويض بمبلغ ... ريال»" },
    ],
  },
];

// ─── Main Component ──────────────────────────────────────────────────────────

interface DraftPreStepProps {
  onStartDraft: () => void;
  initialMode?: string;
}

// Mode labels for the context banner
const MODE_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  arbitration: { label: "صائغ حكم التحكيم",  desc: "سيبدأ الصائغ في وضع حكم التحكيم التجاري مباشرةً",  color: "indigo" },
  notary:      { label: "صائغ عقد التوثيق",   desc: "سيبدأ الصائغ في وضع عقد التوثيق الرسمي مباشرةً",    color: "emerald" },
  report:      { label: "صياغة تقرير",         desc: "سيبدأ الصائغ في وضع تقرير احترافي مباشرةً",         color: "blue" },
  minutes:     { label: "صياغة محضر",          desc: "سيبدأ الصائغ في وضع محضر اجتماع مباشرةً",           color: "amber" },
  reply:       { label: "رد احترافي",           desc: "سيبدأ الصائغ في صياغة رد قانوني احترافي مباشرةً",    color: "rose" },
};

export function DraftPreStep({ onStartDraft, initialMode = "" }: DraftPreStepProps) {
  const { isDark } = useTheme();
  const [mode, setMode] = useState<"choose" | "review">("choose");

  // Review — 2-stage: upload → color-coded results
  const [reviewFile,  setReviewFile]  = useState<string | null>(null);
  const [notes,       setNotes]       = useState("");
  const [processing,  setProcessing]  = useState(false);
  const [reviewDone,  setReviewDone]  = useState(false);
  const [activeDim,   setActiveDim]   = useState<string | null>(null); // highlight filter
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [reviewDims, setReviewDims] = useState<Record<string,boolean>>({
    laws: true, principles: true, defenses: true, requests: true, style: true,
  });
  const toggleDim = (k: string) => setReviewDims(p => ({ ...p, [k]: !p[k] }));
  const anyDim = Object.values(reviewDims).some(Boolean);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setReviewFile(f.name);
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm";

  async function startReview() {
    if (!reviewFile) return;
    setProcessing(true);
    await new Promise(r => setTimeout(r, 2800));
    setProcessing(false);
    setReviewDone(true);
  }

  function resetReview() { setReviewFile(null); setNotes(""); setReviewDone(false); setActiveDim(null); }

  // ── CHOOSE ───────────────────────────────────────────────────────────────────
  if (mode === "choose") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" dir="rtl">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
              الصائغ القانوني
            </h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-black text-[#C8A762] tracking-wider">PRO</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>اختر المسار المناسب لمهمتك</p>
        </div>

        {/* Mode context banner — shown when arriving from a sidebar link with ?mode= */}
        {initialMode && MODE_LABELS[initialMode] && (() => {
          const m = MODE_LABELS[initialMode];
          return (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#0B3D2E]/15 bg-[#0B3D2E]/5"
              }`}>
              <SealCheck size={16} weight="fill" className={isDark ? "text-[#C8A762] mt-0.5 flex-shrink-0" : "text-[#0B3D2E] mt-0.5 flex-shrink-0"} />
              <div>
                <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                  تم تحديد المسار: {m.label}
                </p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{m.desc}</p>
              </div>
            </motion.div>
          );
        })()}

        {/* Two main cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* A — صياغة جديدة */}
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStartDraft}
            className={`group relative overflow-hidden rounded-3xl border p-6 text-start transition-all duration-300 ${
              isDark
                ? "border-[#0B3D2E]/40 bg-[#0B3D2E]/10 hover:border-[#0B3D2E]/70 hover:bg-[#0B3D2E]/20"
                : "border-[#0B3D2E]/20 bg-gradient-to-br from-[#0B3D2E]/5 to-emerald-50/80 hover:border-[#0B3D2E]/40 hover:shadow-lg hover:shadow-[#0B3D2E]/10"
            }`}
          >
            {/* Glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all" />

            {/* Icon */}
            <div className="relative mb-5">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#155e41] flex items-center justify-center shadow-lg shadow-[#0B3D2E]/30">
                <PencilLine size={24} weight="duotone" className="text-[#C8A762]" />
              </div>
            </div>

            {/* Content */}
            <div className="relative space-y-2">
              <p className={`font-bold text-[17px] ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>صياغة جديدة</p>
              <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                مذكرة · دعوى · رد · استئناف · طعن — صياغة احترافية من الصفر في ٨ خطوات ذكية
              </p>
            </div>

            {/* Features */}
            <div className="relative flex flex-wrap gap-2 mt-5">
              {["تحليل القضية", "المبادئ القضائية", "الدفوع تلقائياً", "تنزيل Word"].map(f => (
                <span key={f} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                  isDark
                    ? "border-emerald-700/30 text-emerald-400 bg-emerald-900/20"
                    : "border-[#0B3D2E]/20 text-[#0B3D2E] bg-[#0B3D2E]/5"
                }`}>✓ {f}</span>
              ))}
            </div>

            {/* CTA */}
            <div className={`relative mt-5 flex items-center gap-2 text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>
              <span>ابدأ الصياغة</span>
              <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>←</motion.span>
            </div>
          </motion.button>

          {/* B — مراجعة مذكرة */}
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setMode("review")}
            className={`group relative overflow-hidden rounded-3xl border p-6 text-start transition-all duration-300 ${
              isDark
                ? "border-amber-700/30 bg-amber-900/10 hover:border-amber-600/50 hover:bg-amber-900/20"
                : "border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-orange-50/40 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-500/10"
            }`}
          >
            {/* Glow */}
            <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-amber-500/10 blur-2xl group-hover:bg-amber-500/20 transition-all" />

            {/* Icon */}
            <div className="relative mb-5">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <MagnifyingGlass size={24} weight="duotone" className="text-white" />
              </div>
            </div>

            {/* Content */}
            <div className="relative space-y-2">
              <p className={`font-bold text-[17px] ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مراجعة مذكرة</p>
              <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                ارفع مذكرتك الحالية — AI يحللها بعين الخصم والقاضي ويكشف الثغرات مع إصلاح تلقائي
              </p>
            </div>

            {/* Features */}
            <div className="relative flex flex-wrap gap-2 mt-5">
              {["كشف نقاط الضعف", "ترتيب بالخطورة", "اقتراح الإصلاح", "diff تلقائي"].map(f => (
                <span key={f} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                  isDark
                    ? "border-amber-700/30 text-amber-400 bg-amber-900/20"
                    : "border-amber-300/60 text-amber-700 bg-amber-50"
                }`}>✓ {f}</span>
              ))}
            </div>

            {/* CTA */}
            <div className={`relative mt-5 flex items-center gap-2 text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
              <span>ارفع مذكرتك</span>
              <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}>←</motion.span>
            </div>
          </motion.button>
        </div>

        {/* Bottom hint */}
        <p className={`text-center text-[11px] ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>
          لصياغة خطاب رسمي أو إنذار قانوني ← انتقل لـ{" "}
          <a href="/ai/legal-opinion" className={`font-bold underline ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>الرأي الفصل</a>
        </p>
      </motion.div>
    );
  }

  // ── REVIEW WORKFLOW ───────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => { setMode("choose"); resetReview(); }}
          className={`text-[12px] font-semibold flex items-center gap-1 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
          ← رجوع
        </button>
        <div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مراجعة المذكرة</h1>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>AI يقرأ المذكرة ويُلوّن كل فقرة حسب نوع المشكلة فيها</p>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ── STAGE 1: Upload + Notes ── */}
        {!reviewDone && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Upload zone */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ارفع المذكرة</p>
              {reviewFile ? (
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                  <FileText size={14} className="text-emerald-500 flex-shrink-0" />
                  <span className={`flex-1 truncate text-[12px] font-medium ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{reviewFile}</span>
                  <button onClick={() => setReviewFile(null)}><X size={13} className="text-emerald-500" /></button>
                </div>
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                    isDragging
                      ? isDark ? "border-amber-400/60 bg-amber-500/10 scale-[1.01]" : "border-amber-400 bg-amber-50 scale-[1.01]"
                      : isDark ? "border-white/[0.08] hover:border-amber-500/30" : "border-zinc-200 hover:border-amber-300"
                  }`}>
                  <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setReviewFile(f.name); }} />
                  <FileArrowUp size={28} className={`mx-auto mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
                  <p className={`text-[14px] font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اسحب الملف هنا أو انقر للرفع</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>PDF · Word</p>
                </div>
              )}
            </div>

            {/* Notes + role */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ملاحظاتك أو موقفك (اختياري)</p>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="مثال: أنا محامي المدعي، أخشى ضعف السند النظامي وإغفال الطلبات التفصيلية..."
                rows={3}
                className={`w-full rounded-xl border px-3 py-2.5 text-[12px] resize-none outline-none transition ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50/50 text-zinc-700 placeholder:text-zinc-400 focus:border-[#0B3D2E]/30"}`}
              />
            </div>

            {/* Dimension selector */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ماذا تريد مراجعته؟</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  { key:"laws",       label:"السند النظامي",      sub:"صحة المواد والمراجع",   color:"text-rose-500",   bg:"bg-rose-500/10 border-rose-500/20" },
                  { key:"principles", label:"المبادئ القضائية",   sub:"سوابق داعمة",            color:"text-blue-500",   bg:"bg-blue-500/10 border-blue-500/20"  },
                  { key:"defenses",   label:"الدفوع",              sub:"دفوع ناقصة أو ضعيفة",    color:"text-amber-500",  bg:"bg-amber-500/10 border-amber-500/20"},
                  { key:"requests",   label:"الطلبات",             sub:"اكتمال ودقة الطلبات",   color:"text-emerald-500",bg:"bg-emerald-500/10 border-emerald-500/20"},
                  { key:"style",      label:"الصياغة",             sub:"أخطاء لغوية وقانونية",  color:"text-purple-500", bg:"bg-purple-500/10 border-purple-500/20"},
                ] as const).map(d => (
                  <button key={d.key} onClick={() => toggleDim(d.key)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-all ${
                      reviewDims[d.key]
                        ? `${d.bg} ${d.color}`
                        : isDark ? "border-white/[0.06] text-zinc-600 hover:border-white/10" : "border-zinc-100 text-zinc-400 hover:border-zinc-200"
                    }`}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                      reviewDims[d.key] ? `${d.color.replace("text","border")} bg-current/20` : isDark ? "border-zinc-700" : "border-zinc-300"
                    }`}>
                      {reviewDims[d.key] && <div className={`w-2 h-2 rounded-sm ${d.color.replace("text","bg")}`} />}
                    </div>
                    <div>
                      <p className="text-[12px] font-bold leading-none mb-0.5">{d.label}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{d.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={startReview} disabled={!reviewFile || processing || !anyDim}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 py-3.5 text-[13px] font-bold text-white shadow-md disabled:opacity-40">
              {processing ? (
                <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />جارٍ التحليل الذكي...</>
              ) : (
                <><MagnifyingGlass size={15} />ابدأ التحليل الملوّن</>
              )}
            </motion.button>
          </motion.div>
        )}

        {/* ── STAGE 2: Color-coded Analysis ── */}
        {reviewDone && (
          <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Summary bar */}
            <div className={`${card} p-4 flex items-center gap-3`}>
              <CheckCircle size={18} weight="fill" className="text-emerald-500 flex-shrink-0" />
              <div className="flex-1">
                <p className={`font-bold text-[13px] ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>اكتمل التحليل — {reviewFile}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{MOCK_PARAS.length} فقرة · {MOCK_PARAS.flatMap(p => p.issues).length} ملاحظة قانونية</p>
              </div>
              <button onClick={resetReview}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
                مذكرة جديدة
              </button>
            </div>

            {/* Dimension legend — click to filter */}
            <div className={`${card} p-4`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>دليل الألوان — انقر لتصفية الفقرات</p>
              <div className="flex flex-wrap gap-2">
                {DIMS.map(d => (
                  <button key={d.id} onClick={() => setActiveDim(activeDim === d.id ? null : d.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-[11px] font-bold transition-all ${
                      activeDim === d.id
                        ? `${d.bg} ${d.text} ${d.border} ring-2 ${d.ring}`
                        : activeDim ? "opacity-30" : `${d.bg} ${d.text} ${d.border}`
                    }`}>
                    <span className="w-2 h-2 rounded-full bg-current" />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color-coded memo paragraphs */}
            <div className={`${card} p-5 space-y-4`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>نص المذكرة — الفقرات الملوّنة</p>
              {MOCK_PARAS.map((para, pi) => {
                const dimObjs = para.dims.map(id => DIMS.find(d => d.id === id)!).filter(Boolean);
                const isHighlighted = !activeDim || para.dims.includes(activeDim);
                const isIssueHighlighted = !activeDim || para.issues.some(i => i.dim === activeDim);
                return (
                  <div key={pi}
                    style={{ opacity: isHighlighted ? 1 : 0.18, transition: "opacity 0.25s ease" }}
                    className="space-y-2">
                    {/* Paragraph with left border(s) using the dim color */}
                    <div className={`rounded-xl p-4 transition-all ${
                      dimObjs.length > 0
                        ? `border-r-4 ${dimObjs[0].border} ${dimObjs[0].bg}`
                        : isDark ? "border border-white/[0.04]" : "border border-zinc-100"
                    }`}>
                      {/* Color dots for dims */}
                      {dimObjs.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-2">
                          {dimObjs.map(d => (
                            <span key={d.id} className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${d.bg} ${d.text}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />{d.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className={`text-[13px] leading-relaxed font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{para.text}</p>
                    </div>

                    {/* Issues for this paragraph */}
                    {para.issues.map((issue, ii) => {
                      const issDim = DIMS.find(d => d.id === issue.dim)!;
                      const issueVisible = !activeDim || issue.dim === activeDim;
                      if (!issueVisible) return null;
                      return (
                        <div key={`${pi}-${ii}-${activeDim}`}
                          className={`mr-4 rounded-xl border p-3 ${issDim?.bg ?? ""} ${issDim?.border ?? ""}`}>
                          <div className="flex items-start gap-2">
                            <Warning size={13} weight="fill" className={`flex-shrink-0 mt-0.5 ${issDim?.text ?? "text-zinc-400"}`} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${issDim?.bg ?? ""} ${issDim?.text ?? ""}`}>{issDim?.label}</span>
                                <span className={`text-[9px] font-bold ${issue.sev === "high" ? "text-red-500" : "text-amber-500"}`}>{issue.sev === "high" ? "⚠ خطر عالٍ" : "◆ متوسط"}</span>
                              </div>
                              <p className={`text-[11px] mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{issue.note}</p>
                              <div className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 ${isDark ? "bg-black/20" : "bg-white/60"}`}>
                                <Sparkle size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                                <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{issue.fix}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Action row */}
            <div className="flex gap-3">
              <button className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-[12px] font-bold ${isDark ? "border-emerald-500/25 text-emerald-400" : "border-emerald-200 text-emerald-700"}`}>
                <TrendUp size={14} />تنزيل التقرير
              </button>
              <button
                onClick={() => { setReviewDone(false); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-[12px] font-bold ${isDark ? "border-purple-500/25 text-purple-400" : "border-purple-200 text-purple-700"}`}>
                <ArrowsCounterClockwise size={14} />تحسين تلقائي
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
}
