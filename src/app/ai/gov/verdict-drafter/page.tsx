"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, Scales, MagnifyingGlass, FileText,
  ArrowLeft, ArrowRight, Sparkle, BookOpen,
  CheckCircle, Warning, CircleNotch, Copy,
  Download, ShareNetwork
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────
type VerdictType = "حكم ابتدائي" | "حكم استئنافي" | "حكم تمييز" | "قرار";
type LegalBranch = "جنائي" | "مدني" | "تجاري" | "إداري" | "عمالي" | "أحوال شخصية";

const VERDICT_TYPES: VerdictType[] = ["حكم ابتدائي", "حكم استئنافي", "حكم تمييز", "قرار"];
const BRANCHES: LegalBranch[] = ["جنائي", "مدني", "تجاري", "إداري", "عمالي", "أحوال شخصية"];

const WEIGH_OPTIONS = [
  { key: "plaintiff", label: "المدعي / الاتهام", desc: "الأدلة والمستندات تدعم طلبات المدعي" },
  { key: "defendant", label: "المدعى عليه / الدفاع", desc: "الأدلة والمستندات تدعم موقف الدفاع" },
  { key: "partial",   label: "جزئي", desc: "يُقضى جزئياً لكل طرف وفق المستجد" },
];

type Step = "input" | "weighing" | "drafting" | "result";

export default function VerdictDrafterPage() {
  const [step, setStep] = useState<Step>("input");
  const [verdictType, setVerdictType] = useState<VerdictType | "">("");
  const [branch, setBranch] = useState<LegalBranch | "">("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseYear, setCaseYear] = useState(new Date().getFullYear().toString());
  const [factsText, setFactsText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [lawsText, setLawsText] = useState("");
  const [weighing, setWeighing] = useState<string>("");
  const [weighingReason, setWeigingReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Mock generated verdict ─────────────────────────────────────────────────
  const MOCK_VERDICT = `بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ

المحكمة ...
رقم القضية: ${caseNumber} / ${caseYear}

**ديباجة الحكم**
بعد الاطلاع على الأوراق وتداول الدعوى، وما قُدِّم فيها من مرافعات ودفوع...

**الوقائع**
${factsText || "وقائع القضية التي استعرضتها المحكمة..."}

**الأسانيد والنصوص النظامية**
استناداً لأحكام المادة (الأولى) من نظام الإجراءات الجزائية، والمادة (الثلاثين) من نظام المرافعات الشرعية...

${lawsText ? `النصوص المستشهد بها:\n${lawsText}` : ""}

**التحليل والتسبيب**
${weighing === "plaintiff" ? "رجحت الأدلة المقدمة من جانب المدعي / الاتهام، وثبت ذلك من واقع المستندات..." :
  weighing === "defendant" ? "رجح لدى المحكمة موقف الدفاع، إذ لم تثبت التهمة بالقدر الكافي من الأدلة..." :
  "رأت المحكمة القضاء جزئياً بما ثبت لكلا الطرفين..."}

${weighingReason ? `أسباب الترجيح:\n${weighingReason}` : ""}

**المنطوق**
لذلـك حكمـت المحكمـة بـ...

والله الموفق.`;

  function handleGenerate() {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep("result");
    }, 1800);
  }

  function handleCopy() {
    navigator.clipboard.writeText(MOCK_VERDICT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canProceedInput = verdictType && branch && factsText.length > 30;
  const canProceedWeigh = weighing && weighingReason.length > 10;

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-700 to-yellow-500 flex items-center justify-center shadow-lg">
          <Gavel size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">صائغ الأحكام القضائية</h1>
          <p className="text-[12px] text-zinc-500">مُرجِّح + تسبيب + صياغة — للقاضي</p>
        </div>
        <span className="mr-auto rounded-full bg-amber-500/10 border border-amber-500/25 px-3 py-1 text-[10px] font-bold text-amber-400">
          حكومي · قاضي
        </span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-7">
        {(["input","weighing","drafting","result"] as Step[]).map((s, i) => {
          const labels = ["بيانات القضية","الترجيح","المراجعة","الحكم المُسوَّد"];
          const idx = ["input","weighing","drafting","result"].indexOf(step);
          const done = i < idx;
          const active = s === step;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                done ? "bg-emerald-500 text-white" :
                active ? "bg-amber-500 text-black" :
                "bg-white/[0.06] text-zinc-600"
              }`}>
                {done ? <CheckCircle size={14} weight="fill" /> : i+1}
              </div>
              <span className={`text-[10px] hidden sm:block ${active ? "text-white font-semibold" : done ? "text-emerald-500" : "text-zinc-600"}`}>
                {labels[i]}
              </span>
              {i < 3 && <div className={`flex-1 h-px ${done ? "bg-emerald-500/30" : "bg-white/[0.05]"}`} />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Input ─────────────────────────────────────────────────── */}
        {step === "input" && (
          <motion.div key="input" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }} className="space-y-5">

            {/* Type + Branch */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[12px] font-semibold text-zinc-400">نوع الحكم</label>
                <div className="grid grid-cols-2 gap-2">
                  {VERDICT_TYPES.map(v => (
                    <button key={v} onClick={() => setVerdictType(v)}
                      className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${
                        verdictType === v ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                      }`}>{v}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-semibold text-zinc-400">الفرع القانوني</label>
                <div className="grid grid-cols-2 gap-2">
                  {BRANCHES.map(b => (
                    <button key={b} onClick={() => setBranch(b)}
                      className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${
                        branch === b ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                      }`}>{b}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Case Number */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">رقم القضية</label>
                <input value={caseNumber} onChange={e => setCaseNumber(e.target.value)}
                  placeholder="مثال: 1234567"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">السنة</label>
                <input value={caseYear} onChange={e => setCaseYear(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40"
                />
              </div>
            </div>

            {/* Facts */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <BookOpen size={13} /> وقائع القضية
              </label>
              <textarea value={factsText} onChange={e => setFactsText(e.target.value)} rows={5}
                placeholder="أدخل وقائع القضية كما استُعرضت أمام المحكمة..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
              />
            </div>

            {/* Evidence */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <MagnifyingGlass size={13} /> الأدلة والمستندات
              </label>
              <textarea value={evidenceText} onChange={e => setEvidenceText(e.target.value)} rows={3}
                placeholder="اذكر الأدلة المقدمة من كل طرف (اختياري)..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 resize-none"
              />
            </div>

            {/* Laws */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <Scales size={13} /> النصوص النظامية للاستناد إليها (اختياري)
              </label>
              <textarea value={lawsText} onChange={e => setLawsText(e.target.value)} rows={2}
                placeholder="مثال: المادة 30 من نظام الإجراءات الجزائية..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 resize-none"
              />
            </div>

            <div className="flex justify-start pt-2">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setStep("weighing")} disabled={!canProceedInput}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-[12px] font-bold text-black shadow-md disabled:opacity-40"
              >
                التالي — الترجيح <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Weighing ─────────────────────────────────────────────── */}
        {step === "weighing" && (
          <motion.div key="weighing" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }} className="space-y-5">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-[12px] text-zinc-500 flex gap-2">
              <Warning size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <span>هذا النظام يساعد على الصياغة فقط — الترجيح القضائي قرار يعود حصراً للقاضي المختص.</span>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400">اتجاه الترجيح</label>
              <div className="space-y-3">
                {WEIGH_OPTIONS.map(opt => (
                  <button key={opt.key} onClick={() => setWeighing(opt.key)}
                    className={`w-full flex items-start gap-3 rounded-xl border p-4 text-right transition-all ${
                      weighing === opt.key ? "border-amber-500/50 bg-amber-500/10" : "border-white/[0.07] bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <div className={`h-5 w-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      weighing === opt.key ? "border-amber-500 bg-amber-500" : "border-zinc-600"
                    }`}>
                      {weighing === opt.key && <div className="h-2 w-2 rounded-full bg-black" />}
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-white">{opt.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">أسباب الترجيح</label>
              <textarea value={weighingReason} onChange={e => setWeigingReason(e.target.value)} rows={4}
                placeholder="اذكر أسباب الترجيح وعلة الحكم بإيجاز..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("input")}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setStep("drafting")} disabled={!canProceedWeigh}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-[12px] font-bold text-black shadow-md disabled:opacity-40"
              >
                التالي — مراجعة قبل الصياغة <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Review before draft ──────────────────────────────────── */}
        {step === "drafting" && (
          <motion.div key="drafting" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }} className="space-y-5">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-4">
              <h2 className="text-[14px] font-bold text-white">مراجعة قبل الصياغة</h2>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="space-y-0.5">
                  <span className="text-zinc-500">نوع الحكم</span>
                  <p className="font-semibold text-white">{verdictType}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-zinc-500">الفرع القانوني</span>
                  <p className="font-semibold text-white">{branch}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-zinc-500">رقم القضية</span>
                  <p className="font-semibold text-white">{caseNumber} / {caseYear}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-zinc-500">اتجاه الترجيح</span>
                  <p className="font-semibold text-amber-400">
                    {WEIGH_OPTIONS.find(o => o.key === weighing)?.label}
                  </p>
                </div>
              </div>
              <div className="border-t border-white/[0.06] pt-3 space-y-0.5">
                <span className="text-[11px] text-zinc-500">أسباب الترجيح</span>
                <p className="text-[12px] text-zinc-300 leading-relaxed">{weighingReason}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("weighing")}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={handleGenerate} disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-amber-600 to-yellow-500 px-7 py-2.5 text-[12px] font-bold text-black shadow-lg shadow-amber-500/20 disabled:opacity-60"
              >
                {loading ? (
                  <><motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    className="h-4 w-4 rounded-full border-2 border-black/20 border-t-black" />
                  جارٍ الصياغة...</>
                ) : (
                  <><Sparkle size={14} weight="fill" /> صِغ الحكم</>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 4: Result ───────────────────────────────────────────────── */}
        {step === "result" && (
          <motion.div key="result" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} className="space-y-5">
            <BetaReviewGate toolId="gov.verdict-drafter" toolName="مسودة الحكم القضائي" reviewScope="legal-data">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                <span className="text-[13px] font-bold text-white">تم صياغة مسودة الحكم</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
                  {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "تم النسخ" : "نسخ"}
                </button>
                <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
                  <Download size={12} /> تحميل PDF
                </button>
                <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
                  <ShareNetwork size={12} /> مشاركة
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <pre className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                {MOCK_VERDICT}
              </pre>
            </div>

            <AiResultActions text={MOCK_VERDICT} filename="gov-verdict-draft" showShare />

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[11px] text-zinc-500 flex gap-2">
              <Warning size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <span>
                هذه مسودة مُساعِدة للصياغة — يجب مراجعتها وتعديلها من القاضي المختص قبل إصدارها رسمياً.
                النظام لا يُصدر أحكاماً قضائية ولا يُعوِّض عن الاجتهاد القضائي.
              </span>
            </div>
            </BetaReviewGate>

            <button onClick={() => { setStep("input"); setWeighing(""); setWeigingReason(""); setFactsText(""); }}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
              <FileText size={13} /> صياغة حكم جديد
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
