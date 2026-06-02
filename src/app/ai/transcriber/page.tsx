"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Microphone, FileAudio, FileText, UploadSimple, Sparkle,
  ArrowRight, CaretLeft, Copy, Check, DownloadSimple,
  PencilSimple, Scales, ArrowsClockwise, FilePdf, FileDoc,
  Image, X, CheckCircle, Gavel, Users, Buildings,
  ChatCircle, Suitcase, Question, ShieldCheck, HeartStraight,
  Handshake, Briefcase, UserFocus, Scroll, Megaphone,
  HouseLine,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ─────────────────────────────────────────────────────────────────────
type Mode    = "verbatim" | "legal";
type Stage   = "input" | "processing" | "result";
type Purpose = string;

// ─── All Purpose Options ───────────────────────────────────────────────────────
interface PurposeOption {
  id: string;
  label: string;
  hint: string;
  icon: React.ElementType;
  color: string;
  bg: { dark: string; light: string };
}

const PURPOSES: PurposeOption[] = [
  {
    id: "hearing", label: "جلسة قضائية", icon: Gavel,
    hint: "يركّز على المطالبات والدفوع والإجراءات الإجرائية",
    color: "text-amber-600 dark:text-amber-400",
    bg: { dark: "border-amber-700/30 bg-amber-900/10", light: "border-amber-300 bg-amber-50" },
  },
  {
    id: "contract", label: "مراجعة عقد / اتفاقية", icon: FileText,
    hint: "يستخرج الالتزامات والشروط والمواعيد والغرامات",
    color: "text-blue-600 dark:text-blue-400",
    bg: { dark: "border-blue-700/30 bg-blue-900/10", light: "border-blue-300 bg-blue-50" },
  },
  {
    id: "witness", label: "شهادة شاهد", icon: Users,
    hint: "يرصد التصريحات والتناقضات وتسلسل الأحداث",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: { dark: "border-emerald-700/30 bg-emerald-900/10", light: "border-emerald-300 bg-emerald-50" },
  },
  {
    id: "investigation", label: "تحقيق إداري / تأديبي", icon: Suitcase,
    hint: "يحدد الوقائع التأديبية والاعترافات والإنكارات",
    color: "text-red-600 dark:text-red-400",
    bg: { dark: "border-red-700/30 bg-red-900/10", light: "border-red-300 bg-red-50" },
  },
  {
    id: "meeting", label: "محضر اجتماع", icon: Buildings,
    hint: "يُلخّص القرارات والتكليفات والمواعيد النهائية",
    color: "text-purple-600 dark:text-purple-400",
    bg: { dark: "border-purple-700/30 bg-purple-900/10", light: "border-purple-300 bg-purple-50" },
  },
  {
    id: "client", label: "مقابلة عميل", icon: ChatCircle,
    hint: "يُبرز المشكلة القانونية والطلبات ونقاط الخلاف",
    color: "text-teal-600 dark:text-teal-400",
    bg: { dark: "border-teal-700/30 bg-teal-900/10", light: "border-teal-300 bg-teal-50" },
  },
  {
    id: "arbitration", label: "جلسة تحكيم", icon: Scales,
    hint: "يُركّز على حجج الطرفين وموقف هيئة التحكيم والقرارات",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: { dark: "border-indigo-700/30 bg-indigo-900/10", light: "border-indigo-300 bg-indigo-50" },
  },
  {
    id: "settlement", label: "جلسة صلح / تسوية", icon: Handshake,
    hint: "يستخلص نقاط الاتفاق والتنازلات والتعهدات",
    color: "text-cyan-600 dark:text-cyan-400",
    bg: { dark: "border-cyan-700/30 bg-cyan-900/10", light: "border-cyan-300 bg-cyan-50" },
  },
  {
    id: "appeal", label: "استئناف / طعن", icon: Megaphone,
    hint: "يُبرز أسباب الطعن والردود والسند القانوني المستند إليه",
    color: "text-orange-600 dark:text-orange-400",
    bg: { dark: "border-orange-700/30 bg-orange-900/10", light: "border-orange-300 bg-orange-50" },
  },
  {
    id: "medical", label: "تقرير طبي / شرعي", icon: HeartStraight,
    hint: "يستخلص التشخيص وأسباب الإصابة والتداعيات القانونية",
    color: "text-rose-600 dark:text-rose-400",
    bg: { dark: "border-rose-700/30 bg-rose-900/10", light: "border-rose-300 bg-rose-50" },
  },
  {
    id: "police", label: "محضر ضبط / تحقيق أمني", icon: ShieldCheck,
    hint: "يُبرز الوقائع المُبلَّغ عنها والاعترافات وتسلسل الحوادث",
    color: "text-slate-600 dark:text-slate-300",
    bg: { dark: "border-slate-600/30 bg-slate-800/30", light: "border-slate-300 bg-slate-50" },
  },
  {
    id: "realestate", label: "توثيق عقاري / إيجار", icon: HouseLine,
    hint: "يستخرج بيانات العقار والمبالغ والمواعيد وشروط التجديد",
    color: "text-yellow-600 dark:text-yellow-400",
    bg: { dark: "border-yellow-700/30 bg-yellow-900/10", light: "border-yellow-300 bg-yellow-50" },
  },
  {
    id: "hr", label: "مقابلة موارد بشرية", icon: UserFocus,
    hint: "يُبرز الاتفاقيات والتعهدات وشروط التوظيف والإنهاء",
    color: "text-fuchsia-600 dark:text-fuchsia-400",
    bg: { dark: "border-fuchsia-700/30 bg-fuchsia-900/10", light: "border-fuchsia-300 bg-fuchsia-50" },
  },
  {
    id: "other", label: "غرض آخر", icon: Question,
    hint: "سيستخلص الذكاء الاصطناعي المحتوى القانوني العام دون تخصيص",
    color: "text-slate-500 dark:text-zinc-500",
    bg: { dark: "border-zinc-700/30 bg-zinc-800/60", light: "border-slate-200 bg-slate-50" },
  },
];



// ─── Mock results ───────────────────────────────────────────────────────────────
const MOCK_VERBATIM = `[00:00] المتحدث الأول: أهلاً، شكراً لحضوركم جلسة اليوم بتاريخ التاسع من أبريل ألفين وستة وعشرين.

[00:08] المتحدث الثاني: شكراً. موضوع الجلسة النظر في طلب المدعي إلزام المدعى عليه بسداد المبالغ المستحقة.

[00:19] المتحدث الأول: نعم، أودّ الإشارة إلى أن الطرف الأول لم يلتزم ببنود العقد المبرم بتاريخ الأول من مارس ألفين وخمسة وعشرين.

[00:31] المتحدث الثاني: هل لديكم ما يثبت ذلك؟

[00:35] المتحدث الأول: نعم، عندنا كشف حساب بنكي يُثبت عدم صرف الراتب منذ أربعة أشهر، فضلاً عن بريد إلكتروني تؤكد فيه الشركة الإنهاء الفوري للعقد.

[00:52] المتحدث الثاني: سيتم مراجعة هذه المستندات. هل الطرف الثاني لديه ما يودّ إضافته؟

[01:00] المتحدث الثالث: نعم، نحن نؤكد أن موكلنا أُبلغ بتعديل شروط التوظيف وفق المادة الثامنة من العقد.`;

const MOCK_LEGAL = `**وقائع الجلسة — استخلاص قانوني**

**التاريخ:** ٩ أبريل ٢٠٢٦

**الوقائع المستخلصة:**

**أولاً: موضوع النزاع**
يتمحور النزاع حول مطالبة المدعي بسداد المستحقات العمالية المتأخرة، ويدّعي المدعى عليه تعديل شروط التوظيف وفق المادة (٨) من العقد.

**ثانياً: الوقائع اللازمة للبحث**
١. إبرام عقد عمل بتاريخ ١/٣/٢٠٢٥.
٢. عدم صرف الراتب لمدة أربعة (٤) أشهر متتالية — مُثبَّت بكشف حساب بنكي.
٣. صدور بريد إلكتروني من الشركة يُقرّ بإنهاء العقد فورياً دون إشعار مسبق.
٤. اعتراض المدعى عليه بالاستناد إلى المادة (٨) من العقد لتبرير التعديلات.

**ثالثاً: السند القانوني المقترح**
- المادة (٧٧) من نظام العمل: حق التعويض عن الإنهاء غير المشروع.
- المادة (٨٠) من نظام العمل: عدم جواز فسخ العقد دون مسوّغ نظامي.
- المادة (٨٤) و(٨٨): استحقاق مكافأة نهاية الخدمة والأجور المتأخرة.

**رابعاً: المستندات المطلوبة**
- كشف حساب بنكي للفترة (٣/٢٠٢٥ – ٣/٢٠٢٦).
- نسخة من البريد الإلكتروني المتضمن قرار الإنهاء.
- نسخة العقد الأصلي وأي ملاحق تعديلية.`;

// ─── Helpers ───────────────────────────────────────────────────────────────────
const ACCEPTED  = ".mp3,.wav,.m4a,.ogg,.pdf,.docx,.doc,.png,.jpg,.jpeg";
const AUDIO_EXT = ["mp3", "wav", "m4a", "ogg"];

function getExt(name: string) { return name.split(".").pop()?.toLowerCase() ?? ""; }
function isAudio(name: string) { return AUDIO_EXT.includes(getExt(name)); }

function FileIcon({ name, size = 20 }: { name: string; size?: number }) {
  const ext = getExt(name);
  if (AUDIO_EXT.includes(ext))           return <FileAudio size={size} className="text-purple-500" weight="duotone" />;
  if (ext === "pdf")                      return <FilePdf   size={size} className="text-red-500"    weight="duotone" />;
  if (["doc","docx"].includes(ext))       return <FileDoc   size={size} className="text-blue-500"   weight="duotone" />;
  if (["png","jpg","jpeg"].includes(ext)) return <Image     size={size} className="text-emerald-500" weight="duotone" />;
  return <FileText size={size} className="text-slate-400" weight="duotone" />;
}


// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TranscriberPage() {
  const { isDark } = useTheme();
  const [mode,       setMode]      = useState<Mode>("legal");
  const [purpose,    setPurpose]   = useState<Purpose | null>(null);
  const [customNote, setCustomNote] = useState("");
  const [stage,      setStage]     = useState<Stage>("input");
  const [file,       setFile]      = useState<File | null>(null);
  const [dragging,   setDragging]  = useState(false);
  const [copied,     setCopied]    = useState(false);
  const [progress,   setProgress]  = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPurpose = PURPOSES.find(p => p.id === purpose);
  const result = mode === "verbatim" ? MOCK_VERBATIM : MOCK_LEGAL;
  const canProcess = !!file && !!purpose;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  function handleProcess() {
    if (!canProcess) return;
    setStage("processing"); setProgress(0);
    const steps = [12, 30, 55, 75, 92, 100];
    steps.forEach((p, i) => {
      setTimeout(() => {
        setProgress(p);
        if (i === steps.length - 1) setTimeout(() => setStage("result"), 400);
      }, i * 550);
    });
  }

  function handleCopy() {
    navigator.clipboard.writeText(result);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }

  function handleReset() {
    setFile(null); setPurpose(null); setCustomNote(""); setStage("input"); setProgress(0);
  }

  const processingSteps = [
    { label: "رفع الملف وفحص الصيغة",                                                                       done: progress >= 12  },
    { label: selectedPurpose ? `تحليل المحتوى — ${selectedPurpose.label}` : "تحليل المحتوى",                done: progress >= 55  },
    { label: mode === "legal" ? "ربط الوقائع بالنصوص النظامية" : "تمييز المتحدثين والطوابع الزمنية",       done: progress >= 75  },
    { label: "تنسيق النتيجة وإعدادها للتصدير",                                                              done: progress >= 100 },
  ];

  return (
    <div className={`max-w-3xl mx-auto p-5 md:p-7 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px]">
        <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
        <CaretLeft size={11} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-600"}>المفرّغ الذكي</span>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
          <Microphone size={24} weight="duotone" className="text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المفرّغ الذكي</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "border-purple-700/30 bg-purple-900/10 text-purple-400" : "border-purple-200 bg-purple-50 text-purple-700"}`}>جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            تفريغ المحادثات والجلسات · استخلاص ذكي حسب الغرض · إرسال مباشر للصائغ
          </p>
        </div>
      </motion.div>



      <AnimatePresence mode="wait">

        {/* ── Stage: Input ── */}
        {stage === "input" && (
          <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* ① Purpose */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-purple-900/40 text-purple-400" : "bg-purple-100 text-purple-700"}`}>١</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ما الغرض من التفريغ؟</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PURPOSES.map(opt => {
                  const Icon = opt.icon;
                  const active = purpose === opt.id;
                  const bgClass = isDark ? opt.bg.dark : opt.bg.light;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setPurpose(opt.id)}
                      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border text-right transition-all ${
                        active ? `${bgClass} ring-1 ${isDark ? "ring-white/10" : "ring-black/5"}` : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {active && (
                        <span className="absolute top-1.5 left-1.5">
                          <CheckCircle size={11} weight="fill" className="text-emerald-500" />
                        </span>
                      )}
                      <Icon size={14} className={active ? opt.color : isDark ? "text-zinc-600" : "text-slate-400"} weight={active ? "fill" : "regular"} />
                      <span className={`text-[11px] font-semibold leading-tight text-right ${active ? (isDark ? "text-zinc-100" : "text-zinc-800") : isDark ? "text-zinc-500" : "text-slate-500"}`}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Purpose hint */}
              <AnimatePresence>
                {selectedPurpose && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className={`flex items-start gap-2 px-3 py-2.5 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}
                  >
                    <Sparkle size={13} className="text-[#C8A762] flex-shrink-0 mt-0.5" weight="duotone" />
                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      <span className="font-bold text-[#C8A762]">سيركّز الذكاء الاصطناعي على: </span>
                      {selectedPurpose.hint}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Custom note */}
              {purpose && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <input
                    value={customNote}
                    onChange={e => setCustomNote(e.target.value)}
                    placeholder="تفاصيل إضافية — اختياري (مثال: ركّز على موقف المدعي دون الخصم)"
                    maxLength={200}
                    className={`w-full px-3 py-2.5 rounded-xl border text-[12px] outline-none transition ${
                      isDark ? "border-white/[0.06] bg-zinc-800/80 text-zinc-200 placeholder-zinc-600 focus:border-purple-500/30" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder-slate-400 focus:border-purple-300"
                    }`}
                  />
                </motion.div>
              )}
            </div>

            {/* ② Mode */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-purple-900/40 text-purple-400" : "bg-purple-100 text-purple-700"}`}>٢</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>وضع التفريغ</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { id: "legal" as Mode,    label: "استخلاص قانوني", desc: "يُصفّي الكلام ويُخرج الوقائع بلغة مذكرة جاهزة", icon: Scales,       color: "text-[#C8A762]",   activeBg: isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5" : "border-amber-300 bg-amber-50" },
                  { id: "verbatim" as Mode, label: "تفريغ حرفي",     desc: "كل كلمة مع الطوابع الزمنية وتمييز المتحدثين",   icon: PencilSimple, color: "text-purple-500", activeBg: isDark ? "border-purple-500/30 bg-purple-900/10" : "border-purple-300 bg-purple-50" },
                ] as const).map(opt => {
                  const Icon = opt.icon;
                  const active = mode === opt.id;
                  return (
                    <button key={opt.id} onClick={() => setMode(opt.id)}
                      className={`flex flex-col gap-2 p-4 rounded-xl border text-right transition-all ${active ? opt.activeBg : isDark ? "border-white/[0.06] hover:border-white/[0.1]" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex items-center gap-2">
                        <Icon size={16} className={active ? opt.color : isDark ? "text-zinc-500" : "text-slate-400"} weight={active ? "fill" : "regular"} />
                        <p className={`text-[13px] font-bold ${active ? (isDark ? "text-zinc-100" : "text-zinc-800") : isDark ? "text-zinc-400" : "text-slate-500"}`}>{opt.label}</p>
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ③ Upload */}
            <div className={`${card} overflow-hidden`}>
              <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-purple-900/40 text-purple-400" : "bg-purple-100 text-purple-700"}`}>٣</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الملف المراد تفريغه</p>
              </div>
              <div
                onDragEnter={e => { e.preventDefault(); setDragging(true); }}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !file && inputRef.current?.click()}
                className={`mx-3 mb-2 p-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                  dragging
                    ? isDark ? "border-purple-500/50 bg-purple-900/10" : "border-purple-400 bg-purple-50"
                    : isDark ? "border-white/[0.06] hover:border-purple-500/30" : "border-slate-200 hover:border-purple-300"
                } ${file ? "cursor-default" : ""}`}
              >
                <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                {file ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm">
                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                      <FileIcon name={file.name} size={24} />
                      <div className="flex-1 min-w-0 text-right">
                        <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{file.name}</p>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                          {(file.size / 1024).toFixed(1)} KB · {isAudio(file.name) ? "ملف صوتي" : "مستند نصي"}
                        </p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setFile(null); }}
                        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition ${isDark ? "hover:bg-white/[0.08] text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${isDark ? "bg-purple-900/20" : "bg-purple-50"}`}>
                      <UploadSimple size={24} className="text-purple-500" weight="duotone" />
                    </div>
                    <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>اسحب الملف هنا أو انقر للاختيار</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>MP3 · WAV · M4A · PDF · DOCX · صور</p>
                  </>
                )}
              </div>
              <p className={`text-center text-[10px] pb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                Whisper AI للتفريغ الصوتي · Gemini للاستخلاص القانوني
              </p>
            </div>

            {/* Process Button */}
            <motion.button
              whileHover={canProcess ? { scale: 1.015 } : {}}
              whileTap={canProcess ? { scale: 0.985 } : {}}
              onClick={handleProcess}
              disabled={!canProcess}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white text-[13px] font-bold shadow-md transition-all ${
                canProcess ? "bg-gradient-to-l from-purple-700 to-indigo-600" : "bg-gradient-to-l from-purple-700/40 to-indigo-600/40 cursor-not-allowed"
              }`}
            >
              <Sparkle size={16} weight="duotone" />
              {!purpose ? "اختر غرض التفريغ أولاً"
               : !file   ? "ارفع الملف أولاً"
               : mode === "legal" ? `استخلاص الوقائع — ${selectedPurpose?.label}`
               : `تفريغ حرفي — ${selectedPurpose?.label}`}
            </motion.button>
          </motion.div>
        )}

        {/* ── Stage: Processing ── */}
        {stage === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${card} p-10 space-y-6`}>
            <div className="flex flex-col items-center text-center gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-14 h-14 rounded-full border-2 border-purple-500/20 border-t-purple-500" />
              <div>
                <p className={`text-[15px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                  {mode === "legal" ? "جارٍ الاستخلاص القانوني..." : "جارٍ التفريغ الحرفي..."}
                </p>
                {selectedPurpose && (
                  <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    الغرض: <span className={`font-bold ${selectedPurpose.color}`}>{selectedPurpose.label}</span>
                    {customNote && <span> · {customNote}</span>}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2 max-w-xs mx-auto w-full">
              {processingSteps.map((step, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    step.done ? "bg-emerald-500" : isDark ? "bg-zinc-800 border border-zinc-700" : "bg-slate-100 border border-slate-200"
                  }`}>
                    {step.done && <CheckCircle size={12} weight="fill" className="text-white" />}
                  </div>
                  <p className={`text-[12px] ${step.done ? isDark ? "text-zinc-300" : "text-zinc-600" : isDark ? "text-zinc-600" : "text-slate-400"}`}>{step.label}</p>
                </motion.div>
              ))}
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
              <motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }}
                className="h-full rounded-full bg-gradient-to-l from-purple-600 to-indigo-500" />
            </div>
            <p className={`text-center text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{progress}%</p>
          </motion.div>
        )}

        {/* ── Stage: Result ── */}
        {stage === "result" && (
          <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <BetaReviewGate toolId="transcriber.legal-result" toolName="استخلاص الوقائع القانونية من التفريغ" reviewScope="legal-data" forceShow={mode !== "legal"}>
            {selectedPurpose && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <CheckCircle size={14} weight="fill" className="text-emerald-500 flex-shrink-0" />
                <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                  تم الاستخلاص بناءً على: <span className={`font-bold ${selectedPurpose.color}`}>{selectedPurpose.label}</span>
                  {customNote && <span className="font-medium"> · {customNote}</span>}
                </p>
              </div>
            )}
            <div className={`${card} overflow-hidden`}>
              <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50/60"}`}>
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                  {mode === "legal" ? "الوقائع القانونية المستخلصة" : "التفريغ الحرفي الكامل"}
                </p>
                <div className="flex gap-2">
                  <button onClick={handleCopy}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${copied ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : isDark ? "border border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {copied ? <><Check size={12} />نُسِخ</> : <><Copy size={12} />نسخ</>}
                  </button>
                  <button onClick={() => {
                    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "transcript.txt"; a.click();
                    URL.revokeObjectURL(url);
                  }} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${isDark ? "border border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    <DownloadSimple size={12} />تنزيل
                  </button>
                </div>
              </div>
              <textarea value={result} onChange={() => {}} rows={16}
                className={`w-full px-5 py-4 text-[12px] leading-relaxed resize-none outline-none font-mono ${isDark ? "bg-transparent text-zinc-300" : "bg-transparent text-zinc-700"}`}
              />
            </div>
            <AiResultActions
              text={result}
              filename={`transcript-${mode}-${purpose ?? "general"}`}
              showVault
              showHumanReview
              className="justify-start"
            />
            </BetaReviewGate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/ai/draft" className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.07] bg-zinc-900 hover:border-[#C8A762]/30" : "border-slate-200 bg-white shadow-sm hover:border-amber-300 hover:shadow-md"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                  <PencilSimple size={18} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div className="flex-1">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>إرسال للصائغ</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>انقل الوقائع مباشرة لصياغة المذكرة</p>
                </div>
                <ArrowRight size={14} className={isDark ? "text-zinc-600" : "text-slate-300"} />
              </Link>
              <Link href="/ai/wargaming" className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.07] bg-zinc-900 hover:border-purple-500/30" : "border-slate-200 bg-white shadow-sm hover:border-purple-300 hover:shadow-md"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-purple-900/30" : "bg-purple-50"}`}>
                  <Scales size={18} weight="duotone" className="text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>إرسال للمحاكي</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>محاكاة ردود الخصم بناءً على الوقائع</p>
                </div>
                <ArrowRight size={14} className={isDark ? "text-zinc-600" : "text-slate-300"} />
              </Link>
            </div>
            <button onClick={handleReset}
              className={`flex items-center gap-2 text-[12px] font-semibold transition ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
              <ArrowsClockwise size={13} />تفريغ ملف جديد
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
