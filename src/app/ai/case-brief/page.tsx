"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUp, X, Robot, FileMagnifyingGlass, Warning,
  CheckCircle, ArrowSquareOut, Scales, BookOpen, Clock,
  SealWarning, Lightbulb, ArrowRight, ChatCircleDots,
  FileText, PencilSimple, MagnifyingGlass, Brain, Gavel,
  ListChecks, Copy, UserCircle, CurrencyCircleDollar, UsersThree,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BriefStep = "intake" | "processing" | "result";

interface ClientRequest {
  id: number;
  /** الطلب الموجّه للعميل */
  request: string;
  /** لماذا هذا الطلب — مرتبط بثغرة محددة في الأوراق */
  reason: string;
  /** أولوية الطلب */
  priority: "critical" | "high" | "normal";
  /** نوع المستند أو المعلومة المطلوبة */
  type: "document" | "info" | "witness" | "financial";
}

interface BriefResult {
  caseCard: {
    type: string;
    stage: string;
    position: string;
    parties: string;
    court: string;
    caseNo: string;
    claim: string;
  };
  story: string;
  highlights: Array<{ kind: "error" | "warning" | "info"; text: string }>;
  assessment: "strong" | "medium" | "weak";
  assessmentReason: string;
  options: Array<{ label: string; requires: string; tool?: { href: string; label: string } }>;
  questions: string[];
  /** الطلبات الذكية التي يجب توجيهها للعميل — مشتقة من الثغرات المكتشفة */
  clientRequests: ClientRequest[];
}

// ─── Mock result ───────────────────────────────────────────────────────────────

const MOCK_RESULT: BriefResult = {
  caseCard: {
    type: "تجاري",
    stage: "استئناف",
    position: "المستأنف (المحكوم عليه ابتدائياً)",
    parties: "شركة الأمل للمقاولات (مستأنفة) ضد شركة البناء الذهبي (مستأنف عليها)",
    court: "محكمة الاستئناف التجارية — الرياض",
    caseNo: "١٢٤٥/ق/١٤٤٦",
    claim: "٢,٣٠٠,٠٠٠ ريال سعودي",
  },
  story:
    "أبرمت شركة الأمل للمقاولات عقداً مع شركة البناء الذهبي لتنفيذ مشروع بناء بمبلغ ٤ ملايين ريال. أوقفت شركة البناء الذهبي العمل بعد ٧ أشهر مدّعيةً تأخر الدفعات، فيما ردّت الأمل بأن التأخر ناتج عن قصور في التنفيذ. قضت المحكمة الابتدائية بإلزام الأمل بدفع ٢,٣٠٠,٠٠٠ ريال تعويضاً عن إنهاء العقد، وهو ما تطعن فيه الأمل استئنافاً.",
  highlights: [
    { kind: "error", text: "لم تُقدّم شركة الأمل تقرير خبير مضاد رغم اعتماد الحكم الابتدائي على تقرير الخبير المنتدب بالكامل — نقطة ضعف جوهرية." },
    { kind: "warning", text: "الميعاد النظامي لتقديم لائحة الاستئناف: ٣٠ يوماً من تاريخ الحكم. تأكّد من حساب المدة بدقة." },
    { kind: "warning", text: "محضر الجلسة يتضمن إقراراً ضمنياً من ممثل الأمل بتأخر الدفعة الثالثة — قد يُستخدم ضد الموقف." },
    { kind: "info", text: "عقد المقاولة يتضمن بند تحكيم SCCA — لم يُستند إليه في الدفوع الابتدائية، يمكن إثارة الاختصاص." },
  ],
  assessment: "medium",
  assessmentReason: "الموقف متوسط: وجود قصور في التنفيذ موثّق، لكن غياب الخبير المضاد يُضعف الطعن في التقدير المالي.",
  options: [
    { label: "إعداد لائحة استئناف", requires: "صك الحكم الابتدائي + عقد المقاولة + محاضر الجلسات", tool: { href: "/ai/draft", label: "الصائغ القانوني" } },
    { label: "طلب تعيين خبير مضاد", requires: "تقرير الخبير المنتدب + بيان القصور التقني" },
    { label: "إثارة دفع بعدم الاختصاص (التحكيم)", requires: "نص بند التحكيم في العقد", tool: { href: "/ai/legal-opinion", label: "الرأي الفصل" } },
    { label: "التسوية قبل الجلسة الأولى", requires: "تقييم الموقف التفاوضي + مبلغ التسوية المقبول" },
  ],
  questions: [
    "هل صدر الحكم الابتدائي بتاريخ محدد؟ لحساب ميعاد الاستئناف بدقة.",
    "هل يوجد توثيق لمراسلات المطالبة بالدفعات قبل إيقاف العمل؟",
    "هل توجد صور أو محاضر توثّق قصور التنفيذ المدّعى به؟",
  ],
  // ── الطلبات الذكية من العميل — مشتقة من الثغرات المكتشفة في أوراق القضية
  clientRequests: [
    {
      id: 1,
      request: "أرسل لي تقرير الخبير الهندسي المستقل الذي يوثّق قصور التنفيذ في المراحل المنجزة",
      reason: "الحكم اعتمد على تقرير خبير الخصم فقط — نحتاج تقريراً مضاداً لدحض التقدير المالي",
      priority: "critical",
      type: "document",
    },
    {
      id: 2,
      request: "وفّر لي كل المراسلات (واتساب، بريد، رسائل) التي تُثبت أنك أخطرت الطرف الآخر بقصور التنفيذ قبل توقف العمل",
      reason: "محضر الجلسة يحتوي إقراراً ضمنياً بتأخر الدفعات — نحتاج أدلة مضادة تُثبت السبب الأصلي",
      priority: "critical",
      type: "document",
    },
    {
      id: 3,
      request: "أرسل لي سجلات سداد كل الدفعات مع تواريخها (إيصالات تحويل بنكي أو شيكات)",
      reason: "الإثبات الفعلي لتسلسل الدفعات سيحدد هل التأخر كان قبل أو بعد توقف العمل",
      priority: "high",
      type: "financial",
    },
    {
      id: 4,
      request: "هل يوجد شاهد من داخل الموقع (مهندس إشراف / مقاول منسّق) يمكنه توثيق حالة البناء لحظة الإيقاف؟",
      reason: "شاهد عياني يُعزّز الدفع بالقصور التقني بشكل أقوى من الأوراق وحدها",
      priority: "high",
      type: "witness",
    },
    {
      id: 5,
      request: "أرسل لي النسخة الكاملة لعقد المقاولة مع كل الملاحق والاتفاقيات الإضافية",
      reason: "بند التحكيم SCCA موجود في العقد — نحتاج النص الحرفي لتحديد ما إذا كان ملزماً للطرفين",
      priority: "normal",
      type: "document",
    },
    {
      id: 6,
      request: "وفّر لي صوراً موثّقة (بتاريخ) من موقع البناء تُظهر نسبة الأعمال المنجزة",
      reason: "الأدلة البصرية المؤرخة تدعم تقدير نسبة الإنجاز الفعلية وتُشكّك في تقدير الخبير المنتدب",
      priority: "normal",
      type: "document",
    },
  ],
};

const RELATED_TOOLS = [
  { id: "draft", href: "/ai/draft", label: "الصائغ القانوني", desc: "صياغة مذكرات ولوائح", icon: PencilSimple },
  { id: "wargaming", href: "/ai/wargaming", label: "محاكي القضايا", desc: "تقييم قوة الموقف", icon: Scales },
  { id: "legal-opinion", href: "/ai/legal-opinion", label: "الرأي الفصل", desc: "دراسة قانونية معمّقة", icon: Brain },
  { id: "quick-answer", href: "/ai/quick-answer", label: "المجيب السريع", desc: "سؤال قانوني فوري", icon: ChatCircleDots },
  { id: "brief-check", href: "/ai/brief-check", label: "فاحص المذكرات", desc: "فحص المذكرة الجاهزة", icon: FileMagnifyingGlass },
  { id: "templates", href: "/ai/templates", label: "مكتبة القوالب", desc: "نماذج مذكرات جاهزة", icon: FileText },
];

// ─── Assessment config ─────────────────────────────────────────────────────────

const ASSESS_CFG = {
  strong: { label: "قوي", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  medium: { label: "متوسط", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  weak:   { label: "ضعيف", color: "text-red-500",  bg: "bg-red-500/10",  border: "border-red-500/20"  },
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CaseBriefPage() {
  const { isDark } = useTheme();
  const [step,       setStep]       = useState<BriefStep>("intake");
  const [chatInput,  setChatInput]  = useState("");
  const [files,      setFiles]      = useState<string[]>([]);
  const [dragging,   setDragging]   = useState(false);
  const [result,     setResult]     = useState<BriefResult | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [generateClientRequests, setGenerateClientRequests] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);


  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm";

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const names = Array.from(newFiles).map(f => f.name);
    setFiles(prev => [...prev, ...names]);
  }

  async function runBrief() {
    if (files.length === 0) return;
    setStep("processing");
    await new Promise(r => setTimeout(r, 3500));
    setResult(MOCK_RESULT);
    setStep("result");
  }

  const assess = result ? ASSESS_CFG[result.assessment] : null;

  return (
    <div className={`max-w-4xl mx-auto p-5 md:p-8 space-y-6 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center">
            <Robot size={18} weight="duotone" className="text-[#0B3D2E] dark:text-[#C8A762]" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            الباراليجل
          </h1>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/15 dark:text-[#C8A762] border border-[#0B3D2E]/15 dark:border-[#C8A762]/30">
            الخطوة صفر
          </span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          المساعد القانوني الذكي. ارفع أوراق القضية (أحكام، مذكرات، عقود) وسيقوم بقراءتها، تلخيص الوقائع، واستخراج نقاط القوة والضعف لتقديم إحاطة شاملة في ثوانٍ.
        </p>
      </div>

      {/* Intake (Chat + Upload) + Processing + Result */}
      <AnimatePresence mode="wait">

        {/* ── Intake ── */}
        {step === "intake" && (
          <motion.div key="intake" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            
            {/* Options Toggle */}
            <div className="flex justify-end">
              <label className={`flex items-center gap-3 cursor-pointer group px-4 py-2.5 rounded-2xl border transition-all ${
                generateClientRequests 
                  ? isDark ? "bg-[#C8A762]/10 border-[#C8A762]/30" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/20" 
                  : isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-zinc-200 shadow-sm"
              }`}>
                <div className="flex items-center gap-2">
                  <ListChecks size={16} weight="duotone" className={generateClientRequests ? (isDark ? "text-[#C8A762]" : "text-[#0B3D2E]") : (isDark ? "text-zinc-500" : "text-zinc-400")} />
                  <span className={`text-[12px] font-bold select-none transition-colors ${generateClientRequests ? (isDark ? "text-zinc-200" : "text-zinc-800") : (isDark ? "text-zinc-500" : "text-zinc-500")}`}>
                    تحليل النواقص وتوليد طلبات للعميل
                  </span>
                </div>
                <div className={`relative w-9 h-5 rounded-full transition-colors ${generateClientRequests ? (isDark ? "bg-[#C8A762]" : "bg-[#0B3D2E]") : (isDark ? "bg-white/[0.1]" : "bg-zinc-200")}`}>
                  <motion.div
                    layout
                    className="absolute top-0.5 bottom-0.5 w-4 rounded-full bg-white shadow-sm"
                    initial={false}
                    animate={{
                      left: generateClientRequests ? "2px" : "calc(100% - 18px)"
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </div>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={generateClientRequests}
                  onChange={(e) => setGenerateClientRequests(e.target.checked)}
                />
              </label>
            </div>

            {/* Chat Input */}
            <div className={`rounded-3xl border p-4 transition-all ${isDark ? "border-white/[0.08] bg-zinc-900 focus-within:border-[#C8A762]/50 focus-within:bg-[#C8A762]/[0.02]" : "border-zinc-200 bg-white focus-within:border-[#0B3D2E]/50 focus-within:bg-[#0B3D2E]/[0.02] shadow-sm"}`}>
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="اشرح هنا: ما هو دورك في هذه القضية (مثلاً مدعي، مدعى عليه، طرف أول)؟ وما الذي تبحث عنه تحديداً في هذه الأوراق؟"
                rows={4}
                className={`w-full resize-none text-[14px] bg-transparent outline-none placeholder:text-zinc-500 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition-all ${
                dragging
                  ? isDark ? "border-[#C8A762]/60 bg-[#C8A762]/5" : "border-[#0B3D2E]/50 bg-[#0B3D2E]/5"
                  : isDark ? "border-white/[0.08] hover:border-[#C8A762]/30" : "border-zinc-200 hover:border-[#0B3D2E]/30"
              }`}
            >
              <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={e => handleFiles(e.target.files)} />
              <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${isDark ? "bg-white/[0.05]" : "bg-zinc-100"}`}>
                <CloudArrowUp size={28} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
              </div>
              <p className={`font-bold text-[14px] mb-1 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>ارفع أوراق القضية هنا</p>
              <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>PDF · Word · TXT — يمكنك رفع ملفات متعددة</p>
            </div>

            {/* Files list */}
            {files.length > 0 && (
              <div className={`${card} p-4 space-y-2`}>
                <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{files.length} ملف مرفق</p>
                {files.map((f, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-zinc-50"}`}>
                    <FileText size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                    <p className={`flex-1 text-[12px] truncate ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{f}</p>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className={`w-5 h-5 flex items-center justify-center rounded ${isDark ? "hover:bg-white/[0.07] text-zinc-600" : "hover:bg-zinc-200 text-zinc-400"}`}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <motion.button
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              onClick={runBrief}
              disabled={files.length === 0 || !chatInput.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#0B3D2E] text-[#C8A762] font-bold text-[15px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              <Robot size={18} weight="duotone" />
              ابدأ الإحاطة
            </motion.button>
          </motion.div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${card} p-10 flex flex-col items-center gap-5 text-center`}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}>
              <Robot size={40} weight="duotone" className="text-[#C8A762]" />
            </motion.div>
            <div>
              <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-800"}`}>الباراليجل يقرأ الأوراق...</p>
              <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                تحديد الأطراف · ترتيب الوقائع · رصد المواعيد الحرجة · تقييم الموقف
              </p>
            </div>
            <div className={`h-1.5 w-64 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
              <motion.div
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#C8A762]/60 to-transparent"
              />
            </div>
          </motion.div>
        )}

        {/* Step: Result */}
        {step === "result" && result && assess && (
          <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <BetaReviewGate toolId="case-brief.result" toolName="إحاطة القضية القانونية" reviewScope="legal-data">

            {/* Case card */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>بطاقة القضية</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  ["نوع القضية", result.caseCard.type],
                  ["المرحلة", result.caseCard.stage],
                  ["موقفنا", result.caseCard.position],
                  ["المبلغ / المطالبة", result.caseCard.claim],
                  ["المحكمة", result.caseCard.court],
                  ["رقم القضية", result.caseCard.caseNo],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{k}</p>
                    <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{v}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الأطراف</p>
                  <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{result.caseCard.parties}</p>
                </div>
              </div>
            </div>

            {/* Story */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>القصة باختصار</p>
              <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{result.story}</p>
            </div>

            {/* Highlights */}
            <div className={`${card} p-5 space-y-3`}>
              <p className={`text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ما لفت الانتباه</p>
              {result.highlights.map((h, i) => {
                const cfg = h.kind === "error"
                  ? { icon: <Warning size={14} weight="fill" className="text-red-500 flex-shrink-0" />, border: isDark ? "border-red-900/30 bg-red-900/10" : "border-red-100 bg-red-50" }
                  : h.kind === "warning"
                  ? { icon: <SealWarning size={14} weight="fill" className="text-amber-500 flex-shrink-0" />, border: isDark ? "border-amber-900/30 bg-amber-900/10" : "border-amber-100 bg-amber-50" }
                  : { icon: <Lightbulb size={14} className="text-blue-500 flex-shrink-0" />, border: isDark ? "border-blue-900/30 bg-blue-900/10" : "border-blue-100 bg-blue-50" };
                return (
                  <div key={i} className={`flex gap-2.5 p-3 rounded-xl border ${cfg.border}`}>
                    {cfg.icon}
                    <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{h.text}</p>
                  </div>
                );
              })}
            </div>

            {/* Assessment */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>التقييم الأولي</p>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[13px] font-bold ${assess.color} ${assess.bg} ${assess.border}`}>
                {assess.label}
              </div>
              <p className={`mt-2 text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{result.assessmentReason}</p>
              <p className={`mt-1 text-[10px] italic ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>تقييم مبدئي قائم على المعطيات المتاحة — وليس حكماً نهائياً.</p>

              {/* Result Actions */}
              <div className={`mt-4 pt-3 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                <AiResultActions
                  text={`إحاطة القضية\n\nبطاقة القضية:\n${JSON.stringify(result.caseCard, null, 2)}\n\nالقصة:\n${result.story}\n\nالتقييم: ${assess.label}\n${result.assessmentReason}`}
                  filename="case-brief"
                  showVault
                  showHumanReview
                  className="justify-start"
                />
              </div>
            </div>

            {/* Options */}
            <div className={`${card} p-5 space-y-3`}>
              <p className={`text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الخيارات المتاحة</p>
              {result.options.map((opt, i) => (
                <div key={i} className={`rounded-xl border p-4 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{i + 1}. {opt.label}</p>
                      <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>يتطلب: {opt.requires}</p>
                    </div>
                    {opt.tool && (
                      <Link href={opt.tool.href}
                        className="flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762] hover:opacity-80 transition-opacity">
                        {opt.tool.label} <ArrowRight size={10} />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              <p className={`text-[10px] italic text-center pt-1 ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>
                القرار النهائي للمحامي — الباراليجل يعرض الخيارات فقط.
              </p>
            </div>

            {/* Questions */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>أسئلة للمحامي</p>
              <ul className="space-y-2">
                {result.questions.map((q, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>{i + 1}</span>
                    <p className={`text-[13px] ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{q}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Smart Client Requests — ما يجب طلبه من العميل */}
            {generateClientRequests && result.clientRequests && result.clientRequests.length > 0 && (() => {
              const priorityCfg = {
                critical: { label: "عاجل جداً", bg: isDark ? "bg-red-900/20" : "bg-red-50", border: isDark ? "border-red-800/40" : "border-red-200", dot: "bg-red-500", text: isDark ? "text-red-400" : "text-red-600" },
                high:     { label: "مهم",       bg: isDark ? "bg-amber-900/15" : "bg-amber-50", border: isDark ? "border-amber-800/30" : "border-amber-200", dot: "bg-amber-500", text: isDark ? "text-amber-400" : "text-amber-600" },
                normal:   { label: "اعتيادي",  bg: isDark ? "bg-white/[0.02]" : "bg-zinc-50", border: isDark ? "border-white/[0.06]" : "border-zinc-200", dot: "bg-zinc-400", text: isDark ? "text-zinc-500" : "text-zinc-400" },
              };
              const typeCfg = {
                document:  { icon: <FileText size={12} weight="fill" />,             label: "مستند" },
                financial: { icon: <CurrencyCircleDollar size={12} weight="fill" />, label: "مالي" },
                witness:   { icon: <UsersThree size={12} weight="fill" />,           label: "شاهد" },
                info:      { icon: <Brain size={12} weight="fill" />,                label: "معلومة" },
              };
              const allText = result.clientRequests.map((r, i) => `${i + 1}. ${r.request}`).join("\n");
              const handleCopyAll = () => {
                navigator.clipboard.writeText(allText).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2200);
                });
              };
              return (
                <div className={`${card} p-5 space-y-3`}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListChecks size={14} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} weight="duotone" />
                      <p className={`text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>طلبات ذكية من العميل</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>مولَّدة من الثغرات</span>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={handleCopyAll}
                      className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all ${
                        copied
                          ? isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                          : isDark ? "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.09]" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {copied ? <CheckCircle size={12} weight="fill" /> : <Copy size={12} />}
                      {copied ? "تم النسخ" : "نسخ الكل"}
                    </motion.button>
                  </div>

                  <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    الباراليجل حلّل الأوراق وحدّد ما تحتاجه من العميل بدقة — كل طلب مرتبط بثغرة فعلية.
                  </p>

                  {/* Request list */}
                  <div className="space-y-2.5">
                    {result.clientRequests.map((req) => {
                      const pc = priorityCfg[req.priority];
                      const tc = typeCfg[req.type];
                      return (
                        <motion.div
                          key={req.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: req.id * 0.05 }}
                          className={`rounded-xl border p-3.5 ${pc.bg} ${pc.border}`}
                        >
                          {/* Top row */}
                          <div className="flex items-start gap-2.5">
                            <span className={`flex-shrink-0 w-5 h-5 rounded-full ${pc.dot} flex items-center justify-center text-[9px] font-black text-white mt-0.5`}>
                              {req.id}
                            </span>
                            <p className={`flex-1 text-[13px] font-medium leading-snug ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                              {req.request}
                            </p>
                          </div>
                          {/* Bottom meta */}
                          <div className="flex items-center gap-3 mt-2.5 mr-7">
                            <span className={`flex items-center gap-1 text-[10px] font-bold ${pc.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${pc.dot} inline-block`} />
                              {pc.label}
                            </span>
                            <span className={`flex items-center gap-1 text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                              {tc.icon} {tc.label}
                            </span>
                            <span className={`flex-1 text-[10px] italic ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                              {req.reason}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <p className={`text-[10px] italic text-center pt-1 ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>
                    راجع القائمة، احذف ما لا ينطبق، ثم أرسلها للعميل مباشرة.
                  </p>
                </div>
              );
            })()}

            </BetaReviewGate>

            {/* Related tools */}
            <div className={`${card} p-5`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الخطوة التالية — الأدوات ذات الصلة</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {RELATED_TOOLS.map(tool => {
                  const Icon = tool.icon;
                  return (
                    <Link key={tool.id} href={tool.href}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all hover:border-[#0B3D2E]/30 dark:hover:border-[#C8A762]/30 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50"}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.06]" : "bg-white border border-zinc-100"}`}>
                        <Icon size={15} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-bold truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{tool.label}</p>
                        <p className={`text-[10px] truncate ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{tool.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Reset */}
            <button onClick={() => { setStep("intake"); setFiles([]); setChatInput(""); setResult(null); }}
              className={`w-full py-3 rounded-2xl border text-[13px] font-medium transition-colors ${isDark ? "border-white/[0.07] text-zinc-400 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
              إحاطة قضية جديدة
            </button>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
