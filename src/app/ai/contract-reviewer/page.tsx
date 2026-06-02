"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, FileText, CheckCircle, Warning,
  Copy, Sparkle, ArrowRight, ArrowLeft, Lightning,
  ShieldCheck, XCircle, Info,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import BetaReviewGate from "@/components/BetaReviewGate";

type Step = "upload" | "options" | "result";
type ReviewFocus = "التزامات الطرفين" | "بنود المسؤولية" | "شروط الإنهاء" | "الغرامات والعقوبات" | "التحكيم وحل النزاعات" | "بنود السرية" | "الملكية الفكرية" | "بنود القوة القاهرة";

interface Issue {
  severity: "خطر" | "تحذير" | "ملاحظة";
  clause: string;
  issue: string;
  recommendation: string;
}

interface ReviewResult {
  summary: string;
  score: number;
  positives: string[];
  issues: Issue[];
  missingClauses: string[];
  redraftSuggestions: string[];
}

const FOCUS_OPTIONS: ReviewFocus[] = [
  "التزامات الطرفين", "بنود المسؤولية", "شروط الإنهاء",
  "الغرامات والعقوبات", "التحكيم وحل النزاعات",
  "بنود السرية", "الملكية الفكرية", "بنود القوة القاهرة",
];

const MOCK_RESULT: ReviewResult = {
  summary: "العقد يحتاج إلى مراجعة جوهرية قبل التوقيع. يوجد 3 مخاطر حرجة تتعلق بعدم التوازن في توزيع المسؤوليات، وغياب آلية تسوية ودية، وصياغة مبهمة لبنود التعويض التلقائي.",
  score: 61,
  positives: [
    "وجود شرط تحكيم واضح مع تحديد الجهة والمقر",
    "مدد التسليم محددة بتواريخ دقيقة",
    "شرط السرية موجود وشامل لجميع الأطراف",
    "آلية الإشعار بالإخلال محددة (٧ أيام)",
  ],
  issues: [
    { severity: "خطر", clause: "المادة ١٢", issue: "بند التعويض التلقائي مبهم — قد يُفسَّر بشكل موسّع ضدك في حال أي إخلال بسيط", recommendation: "أضف سقفاً أقصى للتعويض لا يتجاوز قيمة العقد الإجمالية، وحدد الإخلالات الجوهرية فقط" },
    { severity: "خطر", clause: "المادة ٨", issue: "غياب تام لآلية التسوية الودية قبل اللجوء للتحكيم — يخالف المادة ١١ من نظام التحكيم", recommendation: "أضف بنداً للتفاوض الودي (٣٠ يوماً) ثم الوساطة (١٥ يوماً) قبل رفع طلب التحكيم" },
    { severity: "خطر", clause: "المادة ١٧", issue: "بند الإنهاء الانفرادي مفتوح للطرف الآخر دون تعويض كافٍ — الإشعار ٩٠ يوماً مع تعويض أسبوع راتب فقط", recommendation: "اشترط إما إشعار ٣٠ يوماً مع تعويض ٣ أشهر أو مقايضة بين المدة والتعويض" },
    { severity: "تحذير", clause: "المادة ٥", issue: "شرط السرية ينتهي بانتهاء العقد مباشرة — لا توجد مدة امتداد بعد الانتهاء", recommendation: "أضف: 'تستمر التزامات السرية لمدة ٣ سنوات بعد انتهاء العقد'" },
    { severity: "تحذير", clause: "المادة ٩", issue: "تعريف القوة القاهرة ضيق جداً — لا يشمل الأوبئة أو القرارات الحكومية", recommendation: "وسّع التعريف ليشمل: الأوبئة، القرارات الحكومية الطارئة، الأزمات الأمنية" },
    { severity: "ملاحظة", clause: "المادة ٣", issue: "التزامات الطرف الآخر مذكورة بشكل عام — قد يصعب إثبات الإخلال", recommendation: "حدد KPIs واضحة ومعايير قياس محددة للأداء" },
  ],
  missingClauses: [
    "آلية حل النزاعات الودية قبل التحكيم",
    "سقف مسؤولية إجمالي للطرفين",
    "بند التنازل عن الحقوق (Assignment Clause)",
    "بند التعديل والإضافات على العقد",
    "آلية مراجعة الأسعار السنوية",
  ],
  redraftSuggestions: [
    "المادة ١٢: '...لا يتجاوز التعويض الإجمالي في جميع الأحوال المبلغ الإجمالي لهذا العقد'",
    "أضف مادة جديدة: 'يلتزم الطرفان بالسعي لحل أي نزاع ودياً خلال ٣٠ يوماً من نشوئه قبل اللجوء للتحكيم'",
    "المادة ٥: أضف في النهاية '...وتستمر هذه الالتزامات لمدة ثلاث (٣) سنوات بعد انتهاء هذا العقد لأي سبب'",
  ],
};

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  "خطر": { bg: "bg-red-500/8 border-red-500/15", text: "text-red-500", icon: <XCircle size={13} weight="fill" className="text-red-500 shrink-0" /> },
  "تحذير": { bg: "bg-amber-500/8 border-amber-500/15", text: "text-amber-500", icon: <Warning size={13} weight="fill" className="text-amber-500 shrink-0" /> },
  "ملاحظة": { bg: "bg-blue-500/8 border-blue-500/15", text: "text-blue-400", icon: <Info size={13} weight="fill" className="text-blue-400 shrink-0" /> },
};

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "رفع العقد" },
  { key: "options", label: "محاور المراجعة" },
  { key: "result", label: "تقرير المراجعة" },
];

function StepBar({ current, isDark }: { current: Step; isDark: boolean }) {
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1 shrink-0">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
            i === idx ? "bg-[#0B3D2E] text-[#C8A762]" :
            i < idx ? "bg-emerald-500/10 text-emerald-400" :
            isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
          }`}>
            {i < idx ? <CheckCircle size={11} weight="fill" /> : <span className="text-[9px]">{i + 1}</span>}
            {s.label}
          </div>
          {i < STEPS.length - 1 && <ArrowLeft size={10} className={isDark ? "text-zinc-700" : "text-slate-300"} />}
        </div>
      ))}
    </div>
  );
}

function ScoreRing({ score, isDark }: { score: number; isDark: boolean }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const r = 36, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width={90} height={90} className="-rotate-90">
        <circle cx={45} cy={45} r={r} fill="none" stroke={isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"} strokeWidth={7} />
        <motion.circle cx={45} cy={45} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={c} strokeDashoffset={c} strokeLinecap="round"
          animate={{ strokeDashoffset: c - (c * score / 100) }}
          transition={{ duration: 1.2, ease: "easeOut" }} />
      </svg>
      <div className="text-center -mt-[70px] mb-[10px]">
        <p className="text-2xl font-black font-mono" style={{ color }}>{score}</p>
        <p className={`text-[9px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>/ ١٠٠</p>
      </div>
    </div>
  );
}

export default function ContractReviewerPage() {
  const { isDark } = useTheme();
  const [step, setStep] = useState<Step>("upload");
  const [contractText, setContractText] = useState("");
  const [focus, setFocus] = useState<ReviewFocus[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<"الكل" | "خطر" | "تحذير" | "ملاحظة">("الكل");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const toggleFocus = (f: ReviewFocus) =>
    setFocus(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

  async function handleReview() {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 3200));
    setResult(MOCK_RESULT);
    setStep("result");
    setProcessing(false);
  }

  const filteredIssues = result?.issues.filter(i =>
    filterSeverity === "الكل" || i.severity === filterSeverity
  ) ?? [];

  return (
    <div className="max-w-[900px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
          style={{ fontFamily: "var(--font-brand)" }}>
          <MagnifyingGlass className="text-royal" weight="duotone" />
          مراجع العقود الذكي
        </h1>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          الصق نص العقد — احصل على تقرير مراجعة شامل مع المخاطر وتوصيات إعادة الصياغة
        </p>
      </motion.div>

      <StepBar current={step} isDark={isDark} />

      <AnimatePresence mode="wait">

        {/* Step 1 */}
        {step === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-6 space-y-4`}>
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>نص العقد</p>
            <textarea value={contractText} onChange={e => setContractText(e.target.value)} rows={10} dir="rtl"
              placeholder="الصق نص العقد كاملاً أو الجزء المراد مراجعته..."
              className={`w-full rounded-xl border text-[12px] p-3 outline-none resize-none transition-colors ${
                isDark ? "bg-white/[0.03] border-white/[0.06] text-zinc-300 placeholder:text-zinc-600 focus:border-royal/40" : "bg-zinc-50 border-zinc-200 text-slate-700 placeholder:text-slate-400 focus:border-emerald-300"
              }`} />
            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              {contractText.length} حرف — {Math.ceil(contractText.length / 5)} كلمة تقريباً
            </p>
            <button onClick={() => setStep("options")} disabled={contractText.trim().length < 50}
              className="w-full py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
              التالي — اختر محاور المراجعة <ArrowLeft size={14} />
            </button>
          </motion.div>
        )}

        {/* Step 2 */}
        {step === "options" && (
          <motion.div key="options" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-6 space-y-5`}>
            <div>
              <p className={`text-[12px] font-bold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>ركّز المراجعة على (اختياري)</p>
              <p className={`text-[11px] mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>اتركه فارغاً لمراجعة شاملة، أو حدد المحاور ذات الأولوية</p>
              <div className="flex flex-wrap gap-2">
                {FOCUS_OPTIONS.map(f => (
                  <button key={f} onClick={() => toggleFocus(f)}
                    className={`px-3.5 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      focus.includes(f) ? "bg-[#0B3D2E] border-[#0B3D2E] text-[#C8A762]" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                    }`}>
                    {focus.includes(f) ? "✓ " : ""}{f}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("upload")}
                className={`px-5 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                رجوع
              </button>
              <button onClick={handleReview} disabled={processing}
                className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40 hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
                {processing ? (
                  <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Sparkle size={14} /></motion.span> يراجع العقد...</>
                ) : (
                  <><Lightning size={14} /> ابدأ المراجعة القانونية</>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3 — Result */}
        {step === "result" && result && (
          <BetaReviewGate toolId="contract-reviewer.result" toolName="تقرير مراجعة العقد" reviewScope="legal-data">
          <motion.div key="result" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">

            <div className="flex items-center justify-between">
              <button onClick={() => { setStep("upload"); setResult(null); setContractText(""); setFocus([]); }}
                className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                <ArrowRight size={12} /> مراجعة عقد جديد
              </button>
              <button onClick={() => { navigator.clipboard.writeText(result.summary); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                {copied ? <CheckCircle size={12} weight="fill" className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? "تم!" : "نسخ الملخص"}
              </button>
            </div>

            {/* Score + Summary */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-5">
                <ScoreRing score={result.score} isDark={isDark} />
                <div className="flex-1">
                  <p className={`text-[11px] font-bold uppercase mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تقييم العقد الإجمالي</p>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{result.summary}</p>
                  <div className="flex gap-3 mt-3">
                    {[
                      { label: "مخاطر حرجة", count: result.issues.filter(i => i.severity === "خطر").length, color: "text-red-500" },
                      { label: "تحذيرات", count: result.issues.filter(i => i.severity === "تحذير").length, color: "text-amber-500" },
                      { label: "بنود ناقصة", count: result.missingClauses.length, color: "text-blue-500" },
                    ].map((s, i) => (
                      <div key={i} className="text-center">
                        <p className={`text-lg font-black font-mono ${s.color}`}>{s.count}</p>
                        <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Positives */}
            <div className={`${card} p-5`}>
              <p className={`text-[12px] font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                <ShieldCheck size={14} className="text-emerald-500" weight="duotone" /> نقاط قوة العقد
              </p>
              <div className="space-y-1.5">
                {result.positives.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle size={12} className="text-emerald-500 shrink-0" weight="fill" />
                    <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Issues */}
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>المشاكل المكتشفة ({result.issues.length})</p>
                <div className="flex gap-1">
                  {(["الكل", "خطر", "تحذير", "ملاحظة"] as const).map(s => (
                    <button key={s} onClick={() => setFilterSeverity(s)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${filterSeverity === s ? "bg-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {filteredIssues.map((issue, i) => {
                  const style = SEVERITY_STYLES[issue.severity];
                  return (
                    <div key={i} className={`p-4 rounded-xl border ${style.bg}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {style.icon}
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>{issue.severity}</span>
                        <span className={`text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{issue.clause}</span>
                      </div>
                      <p className={`text-[12px] mb-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{issue.issue}</p>
                      <div className={`flex items-start gap-1.5 p-2 rounded-lg ${isDark ? "bg-white/[0.03]" : "bg-white"}`}>
                        <Lightning size={11} className="text-royal mt-0.5 shrink-0" weight="fill" />
                        <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{issue.recommendation}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Missing Clauses */}
            <div className={`${card} p-5`}>
              <p className={`text-[12px] font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                <FileText size={14} className="text-purple-500" weight="duotone" /> بنود ناقصة يُنصح بإضافتها
              </p>
              <div className="space-y-1.5">
                {result.missingClauses.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{i + 1}.</span>
                    <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Redraft */}
            <div className={`${card} p-5`}>
              <p className={`text-[12px] font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                <Sparkle size={14} className="text-amber-500" weight="duotone" /> اقتراحات إعادة الصياغة
              </p>
              <div className="space-y-2">
                {result.redraftSuggestions.map((s, i) => (
                  <div key={i} className={`p-3 rounded-xl text-[11px] font-mono leading-relaxed border ${isDark ? "bg-white/[0.03] border-white/[0.05] text-zinc-300" : "bg-zinc-50 border-zinc-100 text-slate-600"}`}>
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <p className={`text-[10px] text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              * التقرير استرشادي — راجع المحامي المتخصص قبل اعتماد أي تعديلات على العقد
            </p>
          </motion.div>
          </BetaReviewGate>
        )}
      </AnimatePresence>
    </div>
  );
}
