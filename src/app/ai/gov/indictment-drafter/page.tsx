"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, FileText, Gavel, Warning,
  ArrowLeft, ArrowRight, Sparkle, CheckCircle,
  Copy, Download, Plus, Trash, ListBullets
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────
type CrimeCategory =
  | "جرائم النفس" | "جرائم المال" | "جرائم الشرف" | "جرائم الأمن"
  | "جرائم المعلوماتية" | "جرائم المخدرات" | "جرائم الإرهاب" | "جرائم أخرى";

const CRIME_CATS: CrimeCategory[] = [
  "جرائم النفس", "جرائم المال", "جرائم الشرف", "جرائم الأمن",
  "جرائم المعلوماتية", "جرائم المخدرات", "جرائم الإرهاب", "جرائم أخرى"
];

interface Evidence {
  id: string;
  type: string;
  desc: string;
}

type Step = "facts" | "evidence" | "charges" | "result";

const CHARGE_TEMPLATES = [
  { key: "sariqa", label: "سرقة", article: "المادة 1 من نظام مكافحة السرقة" },
  { key: "nasha", label: "نشل", article: "المادة 4 من نظام الأمن العام" },
  { key: "ihtial", label: "احتيال", article: "المادة 3 من نظام مكافحة الاحتيال" },
  { key: "ertishai", label: "رشوة", article: "المادة 1 من نظام مكافحة الرشوة" },
  { key: "itida", label: "اعتداء", article: "المادة 2 من نظام الإجراءات الجزائية" },
  { key: "makdarat", label: "حيازة مخدرات", article: "المادة 1 من نظام مكافحة المخدرات" },
];

export default function IndictmentDrafterPage() {
  const [step, setStep] = useState<Step>("facts");
  const [crimeCategory, setCrimeCategory] = useState<CrimeCategory | "">("");
  const [caseNumber, setCaseNumber] = useState("");
  const [accusedName, setAccusedName] = useState("");
  const [accusedId, setAccusedId] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [incidentPlace, setIncidentPlace] = useState("");
  const [factsText, setFactsText] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([
    { id: "1", type: "شهادة شاهد", desc: "" },
  ]);
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]);
  const [customCharge, setCustomCharge] = useState("");
  const [penaltyText, setPenaltyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Evidence helpers ───────────────────────────────────────────────────────
  function addEvidence() {
    setEvidence(prev => [...prev, { id: Date.now().toString(), type: "مستند", desc: "" }]);
  }
  function removeEvidence(id: string) {
    setEvidence(prev => prev.filter(e => e.id !== id));
  }
  function updateEvidence(id: string, field: keyof Evidence, value: string) {
    setEvidence(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  function toggleCharge(key: string) {
    setSelectedCharges(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  // ── Mock output ────────────────────────────────────────────────────────────
  const MOCK_INDICTMENT = `لائحة الاتهام
═══════════════════════════════════════════

الجهة: النيابة العامة — المملكة العربية السعودية
رقم الملف: ${caseNumber || "——"}

**أولاً: بيانات المتهم**
الاسم: ${accusedName || "——"}
رقم الهوية: ${accusedId || "——"}

**ثانياً: وقائع الجريمة**
تاريخ الحادثة: ${incidentDate || "——"}
مكان الحادثة: ${incidentPlace || "——"}

${factsText || "...وقائع الجريمة كما وردت في محاضر الضبط..."}

**ثالثاً: الأدلة والمستندات**
${evidence.filter(e => e.desc).map((e, i) => `${i+1}. [${e.type}] ${e.desc}`).join("\n") || "لم تُدرج أدلة بعد."}

**رابعاً: التهم الموجهة**
${selectedCharges.map(k => {
  const ch = CHARGE_TEMPLATES.find(c => c.key === k);
  return ch ? `• جريمة ${ch.label} — استناداً إلى ${ch.article}` : "";
}).filter(Boolean).join("\n")}
${customCharge ? `• ${customCharge}` : ""}

**خامساً: العقوبة المطلوبة**
${penaltyText || "تُطالب النيابة العامة بتطبيق العقوبة المقررة نظاماً..."}

صدرت هذه اللائحة من النيابة العامة.`;

  function handleGenerate() {
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep("result"); }, 1600);
  }

  function handleCopy() {
    navigator.clipboard.writeText(MOCK_INDICTMENT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const STEP_LIST: Step[] = ["facts", "evidence", "charges", "result"];
  const STEP_LABELS = ["وقائع الجريمة", "الأدلة", "التهم", "لائحة الاتهام"];
  const stepIdx = STEP_LIST.indexOf(step);

  const canFacts = crimeCategory && factsText.length > 20;
  const canEvidence = evidence.some(e => e.desc.length > 5);
  const canCharges = selectedCharges.length > 0 || customCharge.length > 5;

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-700 to-rose-500 flex items-center justify-center shadow-lg">
          <Shield size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">صائغ لائحة الاتهام</h1>
          <p className="text-[12px] text-zinc-500">وقائع + أدلة + تكييف + عقوبة — لعضو النيابة العامة</p>
        </div>
        <span className="mr-auto rounded-full bg-red-500/10 border border-red-500/25 px-3 py-1 text-[10px] font-bold text-red-400">
          حكومي · نيابة عامة
        </span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-7">
        {STEP_LIST.map((s, i) => {
          const done = i < stepIdx;
          const active = s === step;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                done ? "bg-emerald-500 text-white" :
                active ? "bg-red-500 text-white" :
                "bg-white/[0.06] text-zinc-600"
              }`}>
                {done ? <CheckCircle size={14} weight="fill" /> : i+1}
              </div>
              <span className={`text-[10px] hidden sm:block ${active ? "text-white font-semibold" : done ? "text-emerald-500" : "text-zinc-600"}`}>
                {STEP_LABELS[i]}
              </span>
              {i < 3 && <div className={`flex-1 h-px ${done ? "bg-emerald-500/30" : "bg-white/[0.05]"}`} />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Facts ─────────────────────────────────────────────────── */}
        {step === "facts" && (
          <motion.div key="facts" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }} className="space-y-5">

            {/* Crime category */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400">فئة الجريمة</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CRIME_CATS.map(c => (
                  <button key={c} onClick={() => setCrimeCategory(c)}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${
                      crimeCategory === c ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                    }`}>{c}</button>
                ))}
              </div>
            </div>

            {/* Case + Accused */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">رقم الملف</label>
                <input value={caseNumber} onChange={e => setCaseNumber(e.target.value)}
                  placeholder="رقم ملف النيابة"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">اسم المتهم</label>
                <input value={accusedName} onChange={e => setAccusedName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">رقم الهوية</label>
                <input value={accusedId} onChange={e => setAccusedId(e.target.value)}
                  placeholder="رقم الهوية الوطنية"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">تاريخ الحادثة</label>
                <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white focus:outline-none focus:border-red-500/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">مكان الحادثة</label>
              <input value={incidentPlace} onChange={e => setIncidentPlace(e.target.value)}
                placeholder="المدينة / الحي / العنوان التفصيلي"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">وقائع الجريمة</label>
              <textarea value={factsText} onChange={e => setFactsText(e.target.value)} rows={5}
                placeholder="اذكر وقائع الجريمة بدقة كما وردت في محاضر الضبط والتحقيق..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40 resize-none leading-relaxed"
              />
            </div>

            <div className="flex justify-start pt-2">
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => setStep("evidence")} disabled={!canFacts}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40"
              >
                التالي — الأدلة <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Evidence ─────────────────────────────────────────────── */}
        {step === "evidence" && (
          <motion.div key="evidence" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }} className="space-y-5">
            <div className="space-y-3">
              {evidence.map((ev, i) => (
                <div key={ev.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-500">دليل #{i+1}</span>
                    {evidence.length > 1 && (
                      <button onClick={() => removeEvidence(ev.id)}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-all">
                        <Trash size={12} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-500 mb-1 block">نوع الدليل</label>
                      <select value={ev.type} onChange={e => updateEvidence(ev.id, "type", e.target.value)}
                        className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2 text-[12px] text-white focus:outline-none focus:border-red-500/40">
                        {["شهادة شاهد","مستند رسمي","تسجيل صوتي","تسجيل مرئي","دليل مادي","تقرير طبي","تقرير جنائي","اعتراف","أدلة رقمية"].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] text-zinc-500 mb-1 block">وصف الدليل</label>
                      <input value={ev.desc} onChange={e => updateEvidence(ev.id, "desc", e.target.value)}
                        placeholder="وصف مختصر للدليل..."
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addEvidence}
              className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-2.5 text-[12px] font-semibold text-zinc-500 hover:border-white/25 hover:text-zinc-400 transition-all w-full justify-center">
              <Plus size={13} /> إضافة دليل آخر
            </button>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("facts")}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => setStep("charges")} disabled={!canEvidence}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40"
              >
                التالي — التهم <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Charges ──────────────────────────────────────────────── */}
        {step === "charges" && (
          <motion.div key="charges" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <ListBullets size={13} /> اختر التهمة / التهم
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CHARGE_TEMPLATES.map(ch => {
                  const active = selectedCharges.includes(ch.key);
                  return (
                    <button key={ch.key} onClick={() => toggleCharge(ch.key)}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-right transition-all ${
                        active ? "border-red-500/50 bg-red-500/10" : "border-white/[0.07] bg-white/[0.03] hover:border-white/20"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                        active ? "border-red-500 bg-red-500" : "border-zinc-600"
                      }`}>
                        {active && <span className="text-[8px] font-black text-white">✓</span>}
                      </div>
                      <div>
                        <div className="text-[12px] font-bold text-white">{ch.label}</div>
                        <div className="text-[10px] text-zinc-600 mt-0.5">{ch.article}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">تهمة مخصصة (اختياري)</label>
              <input value={customCharge} onChange={e => setCustomCharge(e.target.value)}
                placeholder="أدخل وصف التهمة وسندها النظامي..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">العقوبة المطلوبة</label>
              <textarea value={penaltyText} onChange={e => setPenaltyText(e.target.value)} rows={3}
                placeholder="حدد العقوبة التي تطلبها النيابة وسندها النظامي..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40 resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("evidence")}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={handleGenerate} disabled={!canCharges || loading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-red-700 to-rose-500 px-7 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-red-500/20 disabled:opacity-60"
              >
                {loading ? (
                  <><motion.div animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:"linear" }}
                    className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white" />
                  جارٍ الصياغة...</>
                ) : (
                  <><Sparkle size={14} weight="fill" /> صِغ لائحة الاتهام</>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 4: Result ───────────────────────────────────────────────── */}
        {step === "result" && (
          <motion.div key="result" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} className="space-y-5">
            <BetaReviewGate toolId="gov.indictment-drafter" toolName="لائحة الاتهام" reviewScope="legal-data">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                <span className="text-[13px] font-bold text-white">تم صياغة لائحة الاتهام</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
                  {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "تم" : "نسخ"}
                </button>
                <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  <Download size={12} /> تحميل
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <pre className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                {MOCK_INDICTMENT}
              </pre>
            </div>

            <AiResultActions text={MOCK_INDICTMENT} filename="gov-indictment-draft" showShare />

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-[11px] text-zinc-500 flex gap-2">
              <Warning size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <span>
                هذه مسودة مُساعِدة للصياغة — يجب مراجعتها من عضو النيابة المختص قبل الإيداع الرسمي.
              </span>
            </div>
            </BetaReviewGate>

            <button onClick={() => { setStep("facts"); setFactsText(""); setEvidence([{ id:"1", type:"شهادة شاهد", desc:"" }]); setSelectedCharges([]); }}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
              <FileText size={13} /> صياغة لائحة جديدة
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
