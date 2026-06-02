"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Handshake, FileText, ArrowRight, ArrowLeft, Sparkle,
  CheckCircle, Warning, Copy, Export, ChatsCircle,
  Lightning, Target, ShieldCheck, Scales, X,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "identify" | "upload" | "strategy" | "result";
type ContractType = "توظيف" | "توريد" | "خدمات" | "إيجار" | "شراكة" | "نقل ملكية" | "امتياز" | "سرية";
type NegotiationGoal = "تحسين شروط مالية" | "تقليل المسؤوليات" | "تمديد المواعيد" | "تعديل بنود الفسخ" | "تقوية ضمانات الطرف الآخر" | "تخفيف بنود العقوبات";
type PartyStrength = "قوي" | "متعادل" | "ضعيف";

interface NegotiationResult {
  overallStrategy: string;
  redLines: string[];
  tradablePoints: string[];
  openingPosition: string[];
  concessions: string[];
  alternatives: string[];
  riskWarnings: string[];
}

const CONTRACT_TYPES: ContractType[] = ["توظيف", "توريد", "خدمات", "إيجار", "شراكة", "نقل ملكية", "امتياز", "سرية"];
const GOALS: NegotiationGoal[] = [
  "تحسين شروط مالية", "تقليل المسؤوليات", "تمديد المواعيد",
  "تعديل بنود الفسخ", "تقوية ضمانات الطرف الآخر", "تخفيف بنود العقوبات",
];

const MOCK_RESULT: NegotiationResult = {
  overallStrategy: "استراتيجية الضغط التدريجي — ابدأ بموقف مرتفع وتراجع بشكل مدروس. الطرف الآخر في موقف مفاوضة متعادل مما يتيح مجالاً للمناورة.",
  redLines: [
    "بند التحكيم — يجب أن يبقى في المملكة العربية السعودية",
    "التزامات السرية — لا تفاوض على مدتها (٥ سنوات كحد أدنى)",
    "ضمان الأداء — لا يقل عن ١٠% من قيمة العقد",
    "اختصاص قضائي — المحاكم السعودية حصراً",
  ],
  tradablePoints: [
    "مدة التسليم — قابلة للتفاوض بين ٣٠-٦٠ يوماً",
    "شروط الدفع — يمكن تعديل الجدول الزمني",
    "الغرامات التأخيرية — قابلة للتعديل النسبي",
    "شروط التجديد التلقائي — قابلة للحذف أو التعديل",
  ],
  openingPosition: [
    "افتح بطلب خفض الغرامة التأخيرية إلى ٠.٢٥%/يوم (نصف ما هو مقترح)",
    "اطلب دفعة مقدمة ٤٠% بدلاً من ٣٠%",
    "اشترط مراجعة قانونية مستقلة على نفقة الطرف الآخر",
    "أضف شرط القوة القاهرة الشامل بصياغتك",
  ],
  concessions: [
    "يمكن قبول مدة ٣٦ شهراً بدلاً من ٢٤ شهراً إذا أُحسّنت شروط الدفع",
    "يمكن التنازل عن بند إعادة التفاوض السنوي مقابل ضمان أسعار ثابتة",
    "قبول تحكيم دولي فقط إذا كان مقر التحكيم الرياض",
  ],
  alternatives: [
    "BATNA: العقود الأخرى المعروضة من منافسين — استخدمها ورقة ضغط",
    "إذا رفض تحسين الضمانات: اطلب بوليصة تأمين بدلاً من ذلك",
    "إذا رفض تمديد المدة: اقترح مرحلتين بعقدين منفصلين",
  ],
  riskWarnings: [
    "المادة ١٢ (التعويض التلقائي) — صياغتها مبهمة وقد تُفسَّر ضدك",
    "بند الإنهاء المبكر — الإشعار ٩٠ يوماً مرهق جداً — اطلب تخفيضه إلى ٣٠ يوماً",
    "عدم وجود آلية تسوية ودية قبل اللجوء للقضاء — أضفها",
  ],
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string }[] = [
  { key: "identify", label: "تحديد المعطيات" },
  { key: "upload", label: "ملابسات التفاوض" },
  { key: "strategy", label: "تحديد الأهداف" },
  { key: "result", label: "استراتيجية التفاوض" },
];

function StepBar({ current, isDark }: { current: Step; isDark: boolean }) {
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1 shrink-0">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
            i === idx ? "bg-[#0B3D2E] text-[#C8A762]" :
            i < idx ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600" :
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContractNegotiatorPage() {
  const { isDark } = useTheme();
  const [step, setStep] = useState<Step>("identify");
  const [contractType, setContractType] = useState<ContractType | "">("");
  const [partyStrength, setPartyStrength] = useState<PartyStrength | "">("");
  const [goals, setGoals] = useState<NegotiationGoal[]>([]);
  const [contractText, setContractText] = useState("");
  const [context, setContext] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<NegotiationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const toggleGoal = (g: NegotiationGoal) =>
    setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  async function handleAnalyze() {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 3000));
    setResult(MOCK_RESULT);
    setStep("result");
    setProcessing(false);
  }

  function copyResult() {
    if (!result) return;
    const text = [
      "=== استراتيجية التفاوض ===",
      result.overallStrategy, "",
      "الخطوط الحمراء:", ...result.redLines.map(r => `• ${r}`), "",
      "الموقف الافتتاحي:", ...result.openingPosition.map(o => `• ${o}`), "",
      "نقاط التنازل:", ...result.concessions.map(c => `• ${c}`), "",
      "تحذيرات المخاطر:", ...result.riskWarnings.map(w => `! ${w}`),
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
          style={{ fontFamily: "var(--font-brand)" }}>
          <Handshake className="text-royal" weight="duotone" />
          مفاوض العقود الذكي
        </h1>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          أدخل معطيات العقد والتفاوض — احصل على استراتيجية مخصصة وموقف تفاوضي محدد
        </p>
      </motion.div>

      {/* Step Bar */}
      <StepBar current={step} isDark={isDark} />

      <AnimatePresence mode="wait">

        {/* Step 1: Identify */}
        {step === "identify" && (
          <motion.div key="identify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-6 space-y-5`}>
            <div>
              <p className={`text-[12px] font-bold mb-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>نوع العقد</p>
              <div className="flex flex-wrap gap-2">
                {CONTRACT_TYPES.map(t => (
                  <button key={t} onClick={() => setContractType(t)}
                    className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold transition-all ${
                      contractType === t ? "bg-[#0B3D2E] text-[#C8A762]" : isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <p className={`text-[12px] font-bold mb-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>قوة موقفك التفاوضي</p>
              <div className="flex gap-2">
                {(["قوي", "متعادل", "ضعيف"] as PartyStrength[]).map(s => (
                  <button key={s} onClick={() => setPartyStrength(s)}
                    className={`flex-1 py-3 rounded-xl text-[12px] font-bold transition-all border ${
                      partyStrength === s
                        ? s === "قوي" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                          : s === "متعادل" ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                          : "bg-red-500/10 border-red-500/30 text-red-500"
                        : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-500"
                    }`}>
                    {s === "قوي" ? <span className="flex items-center justify-center gap-1.5"><Handshake size={14} /> قوي</span> : s === "متعادل" ? <span className="flex items-center justify-center gap-1.5"><Scales size={14} /> متعادل</span> : <span className="flex items-center justify-center gap-1.5"><Warning size={14} /> ضعيف</span>}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setStep("upload")} disabled={!contractType || !partyStrength}
              className="w-full py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
              التالي <ArrowLeft size={14} />
            </button>
          </motion.div>
        )}

        {/* Step 2: Upload */}
        {step === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-6 space-y-5`}>
            <div>
              <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>نص العقد أو بنوده الرئيسية</p>
              <textarea value={contractText} onChange={e => setContractText(e.target.value)} rows={6} dir="rtl"
                placeholder="الصق نص العقد أو أهم بنوده هنا..."
                className={`w-full rounded-xl border text-[12px] p-3 outline-none resize-none transition-colors ${
                  isDark ? "bg-white/[0.03] border-white/[0.06] text-zinc-300 placeholder:text-zinc-600 focus:border-royal/40" : "bg-zinc-50 border-zinc-200 text-slate-700 placeholder:text-slate-400 focus:border-emerald-300"
                }`} />
            </div>
            <div>
              <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>سياق التفاوض والمعلومات الإضافية</p>
              <textarea value={context} onChange={e => setContext(e.target.value)} rows={3} dir="rtl"
                placeholder="مثال: الطرف الآخر شركة كبرى، لديهم عدة عروض من منافسين، التسليم حرج جداً لهم..."
                className={`w-full rounded-xl border text-[12px] p-3 outline-none resize-none transition-colors ${
                  isDark ? "bg-white/[0.03] border-white/[0.06] text-zinc-300 placeholder:text-zinc-600 focus:border-royal/40" : "bg-zinc-50 border-zinc-200 text-slate-700 placeholder:text-slate-400 focus:border-emerald-300"
                }`} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("identify")}
                className={`px-5 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                رجوع
              </button>
              <button onClick={() => setStep("strategy")} disabled={contractText.trim().length < 20}
                className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
                التالي <ArrowLeft size={14} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Strategy Goals */}
        {step === "strategy" && (
          <motion.div key="strategy" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-6 space-y-5`}>
            <div>
              <p className={`text-[12px] font-bold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>أهداف التفاوض (اختر ما ينطبق)</p>
              <p className={`text-[11px] mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>حدد ما تريد تحقيقه — كلما كانت الأهداف أوضح كانت الاستراتيجية أدق</p>
              <div className="flex flex-wrap gap-2">
                {GOALS.map(g => (
                  <button key={g} onClick={() => toggleGoal(g)}
                    className={`px-3.5 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      goals.includes(g) ? "bg-[#0B3D2E] border-[#0B3D2E] text-[#C8A762]" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                    }`}>
                    {goals.includes(g) ? <CheckCircle size={12} weight="fill" className="inline ml-1" /> : ""}{g}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("upload")}
                className={`px-5 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                رجوع
              </button>
              <button onClick={handleAnalyze} disabled={goals.length === 0 || processing}
                className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
                {processing ? (
                  <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Sparkle size={14} /></motion.span> يحلل...</>
                ) : (
                  <><Lightning size={14} /> ابنِ استراتيجية التفاوض</>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 4: Result */}
        {step === "result" && result && (
          <motion.div key="result" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            className="space-y-4">
            {/* Actions */}
            <div className="flex items-center justify-between">
              <button onClick={() => { setStep("identify"); setResult(null); setGoals([]); }}
                className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                <ArrowRight size={12} /> تفاوض جديد
              </button>
            </div>

            <BetaReviewGate toolId="contract-negotiator.result" toolName="استراتيجية تفاوض العقد" reviewScope="legal-data">
            <div className="flex justify-end">
              <button onClick={copyResult}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                {copied ? <CheckCircle size={12} weight="fill" className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? "تم النسخ!" : "نسخ"}
              </button>
            </div>

            {/* Overall Strategy */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-royal" weight="duotone" />
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الاستراتيجية العامة</p>
              </div>
              <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{result.overallStrategy}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Red Lines */}
              <div className={`${card} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={15} className="text-red-500" weight="duotone" />
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الخطوط الحمراء (لا تتنازل)</p>
                </div>
                <div className="space-y-2">
                  {result.redLines.map((r, i) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${isDark ? "bg-red-500/5" : "bg-red-50"}`}>
                      <span className="text-red-500 shrink-0"><X size={12} weight="bold" /></span>
                      <span className={`text-[11px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Opening Position */}
              <div className={`${card} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <ChatsCircle size={15} className="text-blue-500" weight="duotone" />
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الموقف الافتتاحي</p>
                </div>
                <div className="space-y-2">
                  {result.openingPosition.map((o, i) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${isDark ? "bg-blue-500/5" : "bg-blue-50"}`}>
                      <span className="text-blue-500 text-[10px] font-bold mt-0.5 shrink-0">→</span>
                      <span className={`text-[11px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{o}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tradable Points */}
              <div className={`${card} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <Scales size={15} className="text-amber-500" weight="duotone" />
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>النقاط القابلة للتفاوض</p>
                </div>
                <div className="space-y-2">
                  {result.tradablePoints.map((t, i) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${isDark ? "bg-amber-500/5" : "bg-amber-50"}`}>
                      <span className="text-amber-500 text-[10px] font-bold mt-0.5 shrink-0">⟷</span>
                      <span className={`text-[11px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Warnings */}
              <div className={`${card} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <Warning size={15} className="text-orange-500" weight="duotone" />
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>مخاطر يجب معالجتها</p>
                </div>
                <div className="space-y-2">
                  {result.riskWarnings.map((w, i) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${isDark ? "bg-orange-500/5" : "bg-orange-50"}`}>
                      <span className="text-orange-500 shrink-0"><Warning size={12} weight="bold" /></span>
                      <span className={`text-[11px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Alternatives */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkle size={15} className="text-purple-500" weight="duotone" />
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>البدائل والخيارات الاحتياطية (BATNA)</p>
              </div>
              <div className="space-y-2">
                {result.alternatives.map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${isDark ? "bg-purple-500/5" : "bg-purple-50"}`}>
                    <span className="text-purple-500 text-[10px] font-bold mt-0.5 shrink-0">⤷</span>
                    <span className={`text-[11px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{a}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <p className={`text-[10px] text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              * الاستراتيجية استرشادية — استشر محامياً متخصصاً قبل أي قرار تفاوضي نهائي
            </p>
            </BetaReviewGate>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
